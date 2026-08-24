import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  shell,
} from 'electron';
import type { AppSettings, MailAccountInput, TotpInput } from '../src/shared/contracts';
import { PROVIDERS } from './core/providers';
import { MailboxService } from './services/mailbox';
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
      document.querySelectorAll('.sidebar-nav button')[2]?.click()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1100));
    const totpImage = await mainWindow.webContents.capturePage();
    await writeFile(output.replace(/\.png$/i, '-totp.png'), totpImage.toPNG());
    console.log(`CODEHARBOR_SMOKE_OK ${JSON.stringify(snapshot)}`);
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
  vault = new VaultStore(join(app.getPath('userData'), 'vault.json'));
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
