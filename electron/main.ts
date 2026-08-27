import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  screen,
  shell,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron';
import type {
  AppSettings,
  BackupScope,
  BackupExportResult,
  BackupImportResult,
  MailAccountInput,
  TotpInput,
} from '../src/shared/contracts';
import {
  decryptPortableBackup,
  encryptPortableBackup,
  type PortableVaultBackup,
  validateBackupPassword,
} from './core/backup';
import { PROVIDERS } from './core/providers';
import { MailboxService } from './services/mailbox';
import { migrateLegacyVault, resolveDataDirectory } from './services/data-location';
import { VaultStore } from './services/vault';
import { UpdateService } from './services/updater';

const smokeTest = process.env.CODEHARBOR_SMOKE_TEST === '1';
if (smokeTest) {
  app.setPath(
    'userData',
    resolve(process.env.CODEHARBOR_SMOKE_USER_DATA ?? 'test-results/user-data'),
  );
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow: BrowserWindow | null = null;
let vault: VaultStore;
let mailbox: MailboxService;
let updater: UpdateService;
let dataDirectory = '';
let smokeCopiedText = '';

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

function validateBackupScope(scope: BackupScope): BackupScope {
  if (scope !== 'all' && scope !== 'accounts' && scope !== 'totp') {
    throw new Error('备份范围无效');
  }
  return scope;
}

function scopeFileName(scope: BackupScope, date: string): string {
  if (scope === 'accounts') return `CodeHarbor-Mailboxes-${date}.chbackup`;
  if (scope === 'totp') return `CodeHarbor-2FA-${date}.chbackup`;
  return `CodeHarbor-Backup-${date}.chbackup`;
}

function scopeDialogName(scope: BackupScope): string {
  if (scope === 'accounts') return '邮箱账户';
  if (scope === 'totp') return '2FA 动态码';
  return '全部数据';
}

async function portableForScope(scope: BackupScope): Promise<PortableVaultBackup> {
  const portable = await vault.exportPortableData(app.getVersion());
  if (scope === 'accounts') return { ...portable, totpEntries: [] };
  if (scope === 'totp') return { ...portable, accounts: [] };
  return portable;
}

async function exportEncryptedBackup(
  requestedScope: BackupScope,
  password: string,
): Promise<BackupExportResult> {
  const scope = validateBackupScope(requestedScope);
  validateBackupPassword(password);
  const portable = await portableForScope(scope);
  const date = new Date().toISOString().slice(0, 10);
  const options: SaveDialogOptions = {
    title: `导出${scopeDialogName(scope)}加密备份`,
    defaultPath: join(dataDirectory, scopeFileName(scope, date)),
    buttonLabel: '导出加密备份',
    filters: [{ name: 'CodeHarbor 加密备份', extensions: ['chbackup'] }],
  };
  const selected = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options);
  if (selected.canceled || !selected.filePath) {
    return {
      canceled: true,
      accountCount: portable.accounts.length,
      totpCount: portable.totpEntries.length,
    };
  }
  const encrypted = await encryptPortableBackup(portable, password);
  await writeFile(selected.filePath, encrypted, { mode: 0o600 });
  return {
    canceled: false,
    fileName: basename(selected.filePath),
    accountCount: portable.accounts.length,
    totpCount: portable.totpEntries.length,
  };
}

async function importEncryptedBackup(
  requestedScope: BackupScope,
  password: string,
): Promise<BackupImportResult> {
  const scope = validateBackupScope(requestedScope);
  validateBackupPassword(password);
  const options: OpenDialogOptions = {
    title: `导入${scopeDialogName(scope)}加密备份`,
    buttonLabel: '验证密码并导入',
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
  const decrypted = await decryptPortableBackup(await readFile(filePath), password);
  if (scope === 'accounts' && decrypted.accounts.length === 0) {
    throw new Error('这个加密备份中没有邮箱账户');
  }
  if (scope === 'totp' && decrypted.totpEntries.length === 0) {
    throw new Error('这个加密备份中没有 2FA 项目');
  }
  const scoped: PortableVaultBackup = scope === 'all'
    ? decrypted
    : {
        ...decrypted,
        accounts: scope === 'accounts' ? decrypted.accounts : [],
        totpEntries: scope === 'totp' ? decrypted.totpEntries : [],
        settings: vault.getSettings(),
      };
  const summary = await vault.importPortableData(scoped);
  return { canceled: false, fileName: basename(filePath), ...summary };
}

function registerIpc(): void {
  registerHandler('app:bootstrap', async () => {
    const accounts = vault.listAccounts();
    const smokeAccount = accounts.find((account) => account.email === 'smoke-test@163.com');
    return {
      version: app.getVersion(),
      accounts,
      totpEntries: vault.listTotpEntries(),
      settings: vault.getSettings(),
      providers: PROVIDERS,
      vault: await vault.getVaultInfo(),
      smokeVerificationMessages: smokeTest && smokeAccount
        ? [{
            id: 'smoke-verification-fixture',
            accountId: smokeAccount.id,
            accountLabel: smokeAccount.label,
            accountEmail: smokeAccount.email,
            provider: smokeAccount.provider,
            sender: 'ChatGPT <noreply@tm.openai.com>',
            receivedAt: new Date().toISOString(),
            codes: ['702434'],
            purpose: 'ChatGPT 登录验证码',
          }]
        : undefined,
    };
  });
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
  registerHandler('backup:export', (password: string) =>
    exportEncryptedBackup('all', password),
  );
  registerHandler('backup:import', (password: string) =>
    importEncryptedBackup('all', password),
  );
  registerHandler('backup:export-scope', (scope: BackupScope, password: string) =>
    exportEncryptedBackup(scope, password),
  );
  registerHandler('backup:import-scope', (scope: BackupScope, password: string) =>
    importEncryptedBackup(scope, password),
  );
  registerHandler('updater:status', () => updater.getStatus());
  registerHandler('updater:check', () => updater.check());
  registerHandler('system:copy', (text: string) => {
    if (typeof text !== 'string' || text.length > 1000) throw new Error('复制内容无效');
    if (smokeTest) {
      smokeCopiedText = text;
      return;
    }
    clipboard.writeText(text);
  });
  registerHandler('system:open-external', async (url: string) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('仅允许打开 HTTPS 链接');
    await shell.openExternal(parsed.toString());
  });
}

async function createWindow(): Promise<void> {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const initialWidth = Math.min(1440, Math.max(760, Math.round(workArea.width * 0.92)));
  const initialHeight = Math.min(900, Math.max(560, Math.round(workArea.height * 0.9)));
  mainWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth: 760,
    minHeight: 560,
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
      }),
      window.codeHarbor.settings.update({ scanWindowHours: 5 })
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

    smokeCopiedText = '';
    const realCardClicked = await mainWindow.webContents.executeJavaScript(`(() => {
      const button = document.querySelector('[data-message-id="smoke-verification-fixture"] .verification-codes button');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 140));
    const realCopyState = await mainWindow.webContents.executeJavaScript(`Boolean(document.querySelector('[data-message-id="smoke-verification-fixture"] .verification-codes .lucide-check'))`);
    if (!realCardClicked || !realCopyState || smokeCopiedText !== '702434') {
      throw new Error('Real verification card did not copy its code successfully');
    }
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.toast > button')?.click()`);
    let realCopyStateReset = false;
    for (let attempt = 0; attempt < 20 && !realCopyStateReset; attempt += 1) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
      realCopyStateReset = await mainWindow.webContents.executeJavaScript(`!document.querySelector('[data-message-id="smoke-verification-fixture"] .verification-codes .lucide-check')`);
    }
    if (!realCopyStateReset) throw new Error('Verification card copy state did not reset');
    const responsiveSnapshots: Array<{ width: number; height: number; columns: number; titleFont: number }> = [];
    for (const [width, height, suffix, expectedColumns] of [
      [1280, 760, 'wide', 3],
      [900, 650, 'compact', 2],
      [760, 560, 'narrow', 1],
    ] as const) {
      mainWindow.setSize(width, height);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 240));
      const responsive = await mainWindow.webContents.executeJavaScript(`(() => {
        const page = document.querySelector('.page-scroll');
        const columns = document.querySelector('.inbox-columns');
        const card = document.querySelector('[data-message-id="smoke-verification-fixture"]');
        const code = card?.querySelector('.verification-codes button');
        const title = document.querySelector('.inbox-commandbar h2');
        if (!page || !columns || !card || !code || !title) return null;
        const cardRect = card.getBoundingClientRect();
        const codeRect = code.getBoundingClientRect();
        return {
          viewportWidth: window.innerWidth,
          documentFits: document.documentElement.scrollWidth <= window.innerWidth + 1,
          pageFits: page.scrollWidth <= page.clientWidth + 1,
          columnsFit: columns.scrollWidth <= columns.clientWidth + 1,
          columns: getComputedStyle(columns).gridTemplateColumns.split(' ').filter(Boolean).length,
          codeOnRight: codeRect.left >= cardRect.left + cardRect.width * 0.45,
          codeContained: codeRect.right <= cardRect.right + 1,
          titleFont: Number.parseFloat(getComputedStyle(title).fontSize),
          codeFont: Number.parseFloat(getComputedStyle(code.querySelector('span')).fontSize),
        };
      })()`);
      if (!responsive || !responsive.documentFits || !responsive.pageFits || !responsive.columnsFit) {
        throw new Error(`Responsive layout overflow at ${width}x${height}: ${JSON.stringify(responsive)}`);
      }
      if (responsive.columns !== expectedColumns || !responsive.codeOnRight || !responsive.codeContained) {
        throw new Error(`Responsive inbox layout is incorrect at ${width}x${height}: ${JSON.stringify(responsive)}`);
      }
      if (responsive.titleFont < 20 || responsive.titleFont > 28 || responsive.codeFont < 16 || responsive.codeFont > 21) {
        throw new Error(`Responsive typography is outside readable bounds: ${JSON.stringify(responsive)}`);
      }
      responsiveSnapshots.push({ width, height, columns: responsive.columns, titleFont: responsive.titleFont });
      const responsiveImage = await mainWindow.webContents.capturePage();
      await writeFile(output.replace(/\.png$/i, `-inbox-${suffix}.png`), responsiveImage.toPNG());
    }
    if (responsiveSnapshots[0].titleFont <= responsiveSnapshots.at(-1)!.titleFont) {
      throw new Error(`Responsive title typography did not adapt: ${JSON.stringify(responsiveSnapshots)}`);
    }

    const captureNarrowSurface = async (suffix: string): Promise<void> => {
      mainWindow!.setSize(760, 560);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 220));
      const layout = await mainWindow!.webContents.executeJavaScript(`(() => {
        const page = document.querySelector('.page-scroll');
        const modal = document.querySelector('.modal-card');
        if (!page) return null;
        const overflowingControls = [...document.querySelectorAll('button, input, select, textarea')]
          .filter((element) => element instanceof HTMLElement && element.offsetParent !== null)
          .map((element) => ({ label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 30) || element.tagName, rect: element.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1))
          .map(({ label, rect }) => ({ label, left: Math.round(rect.left), right: Math.round(rect.right) }));
        return {
          documentFits: document.documentElement.scrollWidth <= window.innerWidth + 1,
          pageFits: page.scrollWidth <= page.clientWidth + 1,
          modalFits: !modal || modal.scrollWidth <= modal.clientWidth + 1,
          overflowingControls,
        };
      })()`);
      if (!layout || !layout.documentFits || !layout.pageFits || !layout.modalFits || layout.overflowingControls.length) {
        throw new Error(`Narrow ${suffix} layout overflow: ${JSON.stringify(layout)}`);
      }
      const surfaceImage = await mainWindow!.webContents.capturePage();
      await writeFile(output.replace(/\.png$/i, `-${suffix}-narrow.png`), surfaceImage.toPNG());
    };
    const restoreWindowSize = async (): Promise<void> => {
      mainWindow!.setSize(initialWidth, initialHeight);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 220));
    };

    await restoreWindowSize();

    await mainWindow.webContents.executeJavaScript(`
      document.querySelectorAll('.sidebar-nav button')[1]?.click()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    const accountImage = await mainWindow.webContents.capturePage();
    await writeFile(output.replace(/\.png$/i, '-accounts.png'), accountImage.toPNG());

    await captureNarrowSurface('accounts');
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.menu-wrap .icon-button')?.click()`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
    const narrowMenu = await mainWindow.webContents.executeJavaScript(`(() => {
      const menu = document.querySelector('.context-menu');
      if (!menu) return null;
      const rect = menu.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: window.innerWidth, height: window.innerHeight };
    })()`);
    if (!narrowMenu || narrowMenu.left < 0 || narrowMenu.right > narrowMenu.width || narrowMenu.top < 0 || narrowMenu.bottom > narrowMenu.height) {
      throw new Error(`Narrow account action menu is clipped: ${JSON.stringify(narrowMenu)}`);
    }
    const narrowMenuImage = await mainWindow.webContents.capturePage();
    await writeFile(output.replace(/\.png$/i, '-accounts-menu-narrow.png'), narrowMenuImage.toPNG());
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.menu-wrap .icon-button')?.click()`);
    await restoreWindowSize();

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
    await captureNarrowSurface('totp');
    await restoreWindowSize();

    await mainWindow.webContents.executeJavaScript(`
      document.querySelector('.totp-intro .page-actions button')?.click()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 220));
    const qrModalTitle = await mainWindow.webContents.executeJavaScript(`document.querySelector('.modal-header h2')?.textContent`);
    if (!String(qrModalTitle).includes('扫描验证器二维码')) {
      throw new Error('Authenticator QR import modal did not open');
    }
    const qrImportImage = await mainWindow.webContents.capturePage();
    await writeFile(output.replace(/\.png$/i, '-totp-qr-import.png'), qrImportImage.toPNG());
    await captureNarrowSurface('totp-qr-import');
    await restoreWindowSize();
    await mainWindow.webContents.executeJavaScript(`
      document.querySelector('.modal-header .icon-button')?.click()
    `);

    await mainWindow.webContents.executeJavaScript(`
      document.querySelector('.totp-intro .button.primary')?.click()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 220));
    await mainWindow.webContents.executeJavaScript(`
      document.querySelector('.help-hint')?.focus()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
    const totpHelpImage = await mainWindow.webContents.capturePage();
    await writeFile(output.replace(/\.png$/i, '-totp-help.png'), totpHelpImage.toPNG());
    await mainWindow.webContents.executeJavaScript(`
      document.querySelector('.modal-header .icon-button')?.click()
    `);

    await mainWindow.webContents.executeJavaScript(`
      document.querySelectorAll('.sidebar-nav button')[3]?.click()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    const settingsImage = await mainWindow.webContents.capturePage();
    await writeFile(output.replace(/\.png$/i, '-settings.png'), settingsImage.toPNG());
    await captureNarrowSurface('settings');
    await restoreWindowSize();
    await mainWindow.webContents.executeJavaScript(`
      document.querySelector('.theme-buttons button:last-child')?.click()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 280));
    const lightTheme = await mainWindow.webContents.executeJavaScript(`document.documentElement.dataset.theme`);
    if (lightTheme !== 'light') throw new Error('Light theme did not apply');
    const settingsLightImage = await mainWindow.webContents.capturePage();
    await writeFile(output.replace(/\.png$/i, '-settings-light.png'), settingsLightImage.toPNG());
    await mainWindow.webContents.executeJavaScript(`
      document.querySelector('.theme-buttons button:first-child')?.click()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 280));
    const darkTheme = await mainWindow.webContents.executeJavaScript(`document.documentElement.dataset.theme`);
    if (darkTheme !== 'dark') throw new Error('Dark theme did not restore');
    const updateScroll = await mainWindow.webContents.executeJavaScript(`(() => {
      document.querySelector('.update-card')?.scrollIntoView({ block: 'center' });
      const scroller = document.querySelector('.page-scroll');
      return scroller ? { top: scroller.scrollTop, height: scroller.scrollHeight, client: scroller.clientHeight } : null;
    })()`);
    if (!updateScroll || updateScroll.height <= updateScroll.client || updateScroll.top <= 0) {
      throw new Error(`Settings page did not expose working vertical scrolling: ${JSON.stringify(updateScroll)}`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
    const updateImage = await mainWindow.webContents.capturePage();
    await writeFile(output.replace(/\.png$/i, '-update.png'), updateImage.toPNG());
    await mainWindow.webContents.executeJavaScript(`
      document.querySelector('.portability-card .button.primary')?.click()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
    const backupImage = await mainWindow.webContents.capturePage();
    await writeFile(output.replace(/\.png$/i, '-backup.png'), backupImage.toPNG());
    await mainWindow.webContents.executeJavaScript(`
      document.querySelector('.modal-header .icon-button')?.click();
      const gmailGuide = [...document.querySelectorAll('.provider-tutorials details')]
        .find((item) => item.textContent?.includes('Google Gmail'));
      if (gmailGuide) {
        gmailGuide.open = true;
        gmailGuide.scrollIntoView({ block: 'center' });
      }
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
    const tutorialImage = await mainWindow.webContents.capturePage();
    await writeFile(output.replace(/\.png$/i, '-tutorials.png'), tutorialImage.toPNG());
    console.log(`CODEHARBOR_SMOKE_OK ${JSON.stringify({ ...snapshot, backupSummary, mailboxStatus, responsiveSnapshots, lightTheme, darkTheme, updateScroll })}`);
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
  updater = new UpdateService(smokeTest);
  registerIpc();
  await createWindow();
  updater.scheduleAutomaticCheck();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
}).catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Failed to start CodeHarbor:', message);
  if (smokeTest) {
    const output = resolve(process.env.CODEHARBOR_SMOKE_OUTPUT ?? 'test-results/smoke.png');
    await mkdir(dirname(output), { recursive: true }).catch(() => undefined);
    await writeFile(output.replace(/\.png$/i, '-error.txt'), message, 'utf8').catch(() => undefined);
  }
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
