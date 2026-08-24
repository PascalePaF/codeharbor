import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  shell,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron';
import type {
  AppSettings,
  BackupExportResult,
  BackupImportResult,
  MailAccountInput,
  TotpInput,
} from '../src/shared/contracts';
import {
  decryptPortableBackup,
  encryptPortableBackup,
  validateBackupPassword,
} from './core/backup';
import { PROVIDERS } from './core/providers';
import { MailboxService } from './services/mailbox';
import { migrateLegacyVault, resolveDataDirectory } from './services/data-location';
import { VaultStore } from './services/vault';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

const smokeTest = process.env.CODEHARBOR_SMOKE_TEST === '1';
if (smokeTest) {
  app.setPath(
    'userData',
    resolve(process.env.CODEHARBOR_SMOKE_USER_DATA ?? 'test-results/user-data'),
  );
}

let mainWindow: BrowserWindow | null = null;
let vault: VaultStore;
let mailbox: MailboxService;
let dataDirectory = '';

const MAX_BACKUP_FILE_SIZE = 25 * 1024 * 1024;

function cleanError(error: unknown): Error {
  const message = error instanceof Error ? error.message : '操作失败，请重试';
  return new Error(message.replace(/[\r\n]+/g, ' ').slice(0, 300));
}

function registerHandler<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (...args: TArgs) => Promise<TResult> | TResult,
): void {
  ipcMain.handle(channel, async (_event, ...args: TArgs) => {
    try {
      return await handler(...args);
    } catch (error) {
      throw cleanError(error);
    }
  });
}

function registerIpc(): void {
  registerHandler('app:bootstrap', async () => ({
    version: app.getVersion(),
    accounts: vault.listAccounts(),
    totpEntries: vault.listTotpEntries(),
    settings: vault.getSettings(),
    providers: PROVIDERS,
    vault: await vault.getVaultInfo(),
  }));
  registerHandler('accounts:save', (input: MailAccountInput) => vault.saveAccount(input));
  registerHandler('accounts:bulk-save', (inputs: MailAccountInput[]) =>
    vault.bulkSaveAccounts(inputs),
  );
  registerHandler('accounts:remove', (id: string) => vault.removeAccount(id));
  registerHandler('accounts:set-enabled', (id: string, enabled: boolean) =>
    vault.setAccountEnabled(id, enabled),
  );
  registerHandler('accounts:test', (id: string) => mailbox.testAccount(id));
  registerHandler('mail:scan', (accountIds?: string[]) => mailbox.scan(accountIds));
  registerHandler('totp:save', (input: TotpInput) => vault.saveTotp(input));
  registerHandler('totp:bulk-save', (inputs: TotpInput[]) => vault.bulkSaveTotp(inputs));
  registerHandler('totp:remove', (id: string) => vault.removeTotp(id));
  registerHandler('totp:codes', () => vault.generateTotpCodes());
  registerHandler('settings:update', (input: Partial<AppSettings>) => vault.updateSettings(input));
  registerHandler('backup:export', async (password: string): Promise<BackupExportResult> => {
    validateBackupPassword(password);
    const portable = await vault.exportPortableData(app.getVersion());
    const date = new Date().toISOString().slice(0, 10);
    const options: SaveDialogOptions = {
      title: '导出 CodeHarbor 加密备份',
      defaultPath: join(dataDirectory, `CodeHarbor-Backup-${date}.chbackup`),
      buttonLabel: '导出备份',
      filters: [{ name: 'CodeHarbor 加密备份', extensions: ['chbackup'] }],
    };
    const selected = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options);
    if (selected.canceled || !selected.filePath) {
      return { canceled: true, accountCount: portable.accounts.length, totpCount: portable.totpEntries.length };
    }
    const encrypted = await encryptPortableBackup(portable, password);
    await writeFile(selected.filePath, encrypted, { mode: 0o600 });
    return {
      canceled: false,
      fileName: basename(selected.filePath),
      accountCount: portable.accounts.length,
      totpCount: portable.totpEntries.length,
    };
  });
  registerHandler('backup:import', async (password: string): Promise<BackupImportResult> => {
    validateBackupPassword(password);
    const options: OpenDialogOptions = {
      title: '导入 CodeHarbor 加密备份',
      buttonLabel: '导入备份',
      properties: ['openFile'],
      filters: [{ name: 'CodeHarbor 加密备份', extensions: ['chbackup'] }],
    };
    const selected = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    const filePath = selected.filePaths[0];
    if (selected.canceled || !filePath) {
      return {
        canceled: true,
        accountsCreated: 0,
        accountsUpdated: 0,
        totpCreated: 0,
        totpUpdated: 0,
      };
    }
    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile() || fileInfo.size < 1 || fileInfo.size > MAX_BACKUP_FILE_SIZE) {
      throw new Error('备份文件为空或超过 25 MiB 安全限制');
    }
    const backup = await decryptPortableBackup(await readFile(filePath), password);
    const summary = await vault.importPortableData(backup);
    return { canceled: false, fileName: basename(filePath), ...summary };
  });
  registerHandler('system:copy', (text: string) => {
    if (typeof text !== 'string' || text.length > 1000) throw new Error('复制内容无效');
    clipboard.writeText(text);
  });
  registerHandler('system:open-external', async (url: string) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('仅允许打开 HTTPS 链接');
    await shell.openExternal(parsed.toString());
  });
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#07110f',
    show: false,
    autoHideMenuBar: true,
    title: 'CodeHarbor 验证码港',
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (url !== devUrl && !url.startsWith('file://')) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, '../../dist/index.html'));
  }

  if (smokeTest) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 900));
    const snapshot = await mainWindow.webContents.executeJavaScript(`({
      title: document.title,
      heading: document.querySelector('h1')?.textContent,
      hasSidebar: Boolean(document.querySelector('.sidebar')),
      hasEncryptedBadge: Boolean(document.querySelector('.encrypted-pill')),
      bodyTextLength: document.body.innerText.length
    })`);
    const output = resolve(process.env.CODEHARBOR_SMOKE_OUTPUT ?? 'test-results/smoke.png');
    await mkdir(dirname(output), { recursive: true });
    const image = await mainWindow.webContents.capturePage();
    await writeFile(output, image.toPNG());

    await mainWindow.webContents.executeJavaScript(`Promise.all([
      window.codeHarbor.accounts.save({
        label: '测试工作邮箱', email: 'smoke-test@163.com', provider: '163',
        username: 'smoke-test@163.com', credential: 'smoke-only-secret', authMode: 'password', enabled: true
      }),
      window.codeHarbor.totp.save({
        label: '安全测试账户', issuer: 'CodeHarbor', secret: 'JBSWY3DPEHPK3PXP',
        digits: 6, period: 30, algorithm: 'SHA1'
      })
    ])`);
    const smokeAccount = vault.listAccounts().find((account) => account.email === 'smoke-test@163.com');
    if (!smokeAccount) throw new Error('Smoke mailbox account was not created');
    const mailboxStatus = await mailbox.testAccount(smokeAccount.id);
    if (mailboxStatus.state !== 'error') {
      throw new Error('Invalid smoke mailbox credentials unexpectedly succeeded');
    }
    const smokePortable = await vault.exportPortableData(app.getVersion());
    const smokeEncrypted = await encryptPortableBackup(smokePortable, 'smoke-backup-password');
    if (smokeEncrypted.includes(Buffer.from('smoke-only-secret')) || smokeEncrypted.includes(Buffer.from('JBSWY3DPEHPK3PXP'))) {
      throw new Error('Portable backup leaked a plaintext test secret');
    }
    const smokeRestored = await decryptPortableBackup(smokeEncrypted, 'smoke-backup-password');
    const backupSummary = await vault.importPortableData(smokeRestored);
    const reloaded = new Promise<void>((resolveReload) =>
      mainWindow?.webContents.once('did-finish-load', () => resolveReload()),
    );
    mainWindow.reload();
    await reloaded;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 700));

    await mainWindow.webContents.executeJavaScript(`
      document.querySelectorAll('.sidebar-nav button')[1]?.click()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    const accountImage = await mainWindow.webContents.capturePage();
    await writeFile(output.replace(/\.png$/i, '-accounts.png'), accountImage.toPNG());

    await mainWindow.webContents.executeJavaScript(`
      document.querySelector('.menu-wrap .icon-button')?.click()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
    const accountMenuImage = await mainWindow.webContents.capturePage();
    await writeFile(output.replace(/\.png$/i, '-accounts-menu.png'), accountMenuImage.toPNG());

    await mainWindow.webContents.executeJavaScript(`
      document.querySelectorAll('.sidebar-nav button')[2]?.click()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1100));
    const totpImage = await mainWindow.webContents.capturePage();
    await writeFile(output.replace(/\.png$/i, '-totp.png'), totpImage.toPNG());

    await mainWindow.webContents.executeJavaScript(`
      document.querySelectorAll('.sidebar-nav button')[3]?.click()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    const settingsImage = await mainWindow.webContents.capturePage();
    await writeFile(output.replace(/\.png$/i, '-settings.png'), settingsImage.toPNG());
    await mainWindow.webContents.executeJavaScript(`
      document.querySelector('.portability-card .button.primary')?.click()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
    const backupImage = await mainWindow.webContents.capturePage();
    await writeFile(output.replace(/\.png$/i, '-backup.png'), backupImage.toPNG());
    await mainWindow.webContents.executeJavaScript(`
      document.querySelector('.modal-header .icon-button')?.click();
      const scroller = document.querySelector('.page-scroll');
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      const gmailGuide = [...document.querySelectorAll('.provider-tutorials details')]
        .find((item) => item.textContent?.includes('Google Gmail'));
      if (gmailGuide) gmailGuide.open = true;
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
    const tutorialImage = await mainWindow.webContents.capturePage();
    await writeFile(output.replace(/\.png$/i, '-tutorials.png'), tutorialImage.toPNG());
    console.log(`CODEHARBOR_SMOKE_OK ${JSON.stringify({ ...snapshot, backupSummary, mailboxStatus })}`);
    app.quit();
  }
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  app.setAppUserModelId('com.codeharbor.desktop');
  Menu.setApplicationMenu(null);
  dataDirectory = resolveDataDirectory({
    isPackaged: app.isPackaged,
    executablePath: app.getPath('exe'),
    workingDirectory: process.cwd(),
    portableExecutableDirectory: process.env.PORTABLE_EXECUTABLE_DIR,
    overrideDirectory: process.env.CODEHARBOR_DATA_DIR,
    smokeDirectory: smokeTest
      ? process.env.CODEHARBOR_SMOKE_USER_DATA ?? 'test-results/user-data'
      : undefined,
  });
  const vaultPath = join(dataDirectory, 'vault.json');
  if (app.isPackaged && !process.env.CODEHARBOR_DATA_DIR) {
    const legacyVaultPath = join(app.getPath('userData'), 'vault.json');
    const migrated = await migrateLegacyVault(legacyVaultPath, vaultPath);
    if (migrated) console.info(`Migrated CodeHarbor vault to ${vaultPath}`);
  }
  vault = new VaultStore(vaultPath);
  await vault.initialize();
  mailbox = new MailboxService(vault);
  registerIpc();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
}).catch((error) => {
  console.error('Failed to start CodeHarbor:', error instanceof Error ? error.message : error);
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
