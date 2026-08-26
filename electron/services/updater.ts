import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateState } from '../../src/shared/contracts';

const AUTOMATIC_CHECK_DELAY_MS = 4_000;
const AUTOMATIC_RESTART_DELAY_MS = 2_500;

function updateErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : '未知错误';
  return raw.replace(/[\r\n]+/g, ' ').slice(0, 220);
}

export class UpdateService {
  private state: UpdateState;
  private automaticCheckTimer?: NodeJS.Timeout;
  private restartTimer?: NodeJS.Timeout;

  constructor(private readonly smokeTest: boolean) {
    const unsupported = this.unsupportedReason();
    this.state = unsupported
      ? { phase: 'unsupported', currentVersion: app.getVersion(), message: unsupported }
      : {
          phase: 'idle',
          currentVersion: app.getVersion(),
          message: '启动后会自动检查 GitHub 最新版本',
        };

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.logger = null;

    autoUpdater.on('checking-for-update', () => {
      this.publish({ phase: 'checking', message: '正在连接 GitHub 检查更新…' });
    });
    autoUpdater.on('update-available', (info) => {
      this.publish({
        phase: 'available',
        availableVersion: info.version,
        percent: 0,
        message: `发现 V${info.version}，正在后台下载…`,
      });
    });
    autoUpdater.on('update-not-available', (info) => {
      this.publish({
        phase: 'up-to-date',
        availableVersion: info.version,
        percent: 100,
        message: `当前 V${app.getVersion()} 已是最新版本`,
      });
    });
    autoUpdater.on('download-progress', (progress) => {
      const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
      this.publish({
        phase: 'downloading',
        percent,
        message: `正在下载更新 ${percent}%`,
      });
    });
    autoUpdater.on('update-downloaded', (info) => {
      this.publish({
        phase: 'downloaded',
        availableVersion: info.version,
        percent: 100,
        message: `V${info.version} 已下载，软件即将自动更新并重启`,
      });
      if (this.restartTimer) clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => {
        autoUpdater.quitAndInstall(true, true);
      }, AUTOMATIC_RESTART_DELAY_MS);
    });
    autoUpdater.on('error', (error) => {
      this.publish({
        phase: 'error',
        message: `更新失败：${updateErrorMessage(error)}`,
      });
    });
  }

  getStatus(): UpdateState {
    return { ...this.state };
  }

  scheduleAutomaticCheck(): void {
    if (this.unsupportedReason() || this.automaticCheckTimer) return;
    this.automaticCheckTimer = setTimeout(() => {
      this.automaticCheckTimer = undefined;
      void this.check();
    }, AUTOMATIC_CHECK_DELAY_MS);
  }

  async check(): Promise<UpdateState> {
    const unsupported = this.unsupportedReason();
    if (unsupported) {
      this.publish({ phase: 'unsupported', message: unsupported });
      return this.getStatus();
    }
    if (this.state.phase === 'checking' || this.state.phase === 'downloading') {
      return this.getStatus();
    }
    this.publish({ phase: 'checking', message: '正在连接 GitHub 检查更新…' });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.publish({ phase: 'error', message: `更新失败：${updateErrorMessage(error)}` });
    }
    return this.getStatus();
  }

  private unsupportedReason(): string | undefined {
    if (this.smokeTest || !app.isPackaged) return '开发环境不执行在线自动更新';
    if (process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR) {
      return '便携版不支持内部替换，请使用安装版启用自动更新';
    }
    return undefined;
  }

  private publish(next: Omit<UpdateState, 'currentVersion' | 'checkedAt'>): void {
    this.state = {
      ...this.state,
      ...next,
      currentVersion: app.getVersion(),
      checkedAt: new Date().toISOString(),
    };
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('updater:status-changed', this.getStatus());
      }
    }
  }
}
