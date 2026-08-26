import { ArchiveRestore, CheckCircle2, ChevronLeft, ChevronRight, CloudDownload, Database, Download, ExternalLink, HardDrive, LockKeyhole, Moon, RefreshCw, Save, Server, ShieldAlert, Sun, Upload } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { AppSettings, ProviderPreset, UpdateState, VaultInfo } from '../shared/contracts';

interface SettingsPageProps {
  settings: AppSettings;
  vault: VaultInfo;
  providers: ProviderPreset[];
  version: string;
  updateState?: UpdateState;
  busy: boolean;
  onSave: (settings: Partial<AppSettings>) => Promise<void>;
  onCheckUpdates: () => Promise<void>;
  onExport: () => void;
  onImport: () => void;
  onOpenExternal: (url: string) => Promise<void>;
}

export function SettingsPage({ settings, vault, providers, version, updateState, busy, onSave, onCheckUpdates, onExport, onImport, onOpenExternal }: SettingsPageProps) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  const submit = (event: FormEvent) => { event.preventDefault(); void onSave(draft); };
  const setTheme = (theme: AppSettings['theme']) => {
    setDraft((current) => ({ ...current, theme }));
    void onSave({ theme });
  };
  const checkingUpdate = updateState?.phase === 'checking' || updateState?.phase === 'downloading' || updateState?.phase === 'downloaded';

  return (
    <div className="page-stack settings-layout">
      <section className="security-banner">
        <div className="security-orb"><LockKeyhole size={25} /></div>
        <div><span className="eyebrow green">LOCAL-FIRST SECURITY</span><h2>{vault.encryptionAvailable ? '系统加密保护已启用' : '系统安全存储不可用'}</h2><p>邮箱凭据与 2FA 密钥不会进入网页存储，也不会发送到 CodeHarbor 服务器。</p></div>
        <span className={`status-badge ${vault.encryptionAvailable ? 'ok' : 'error'}`}>{vault.encryptionAvailable ? <CheckCircle2 size={14} /> : <ShieldAlert size={14} />}{vault.encryptionAvailable ? '保护中' : '不可用'}</span>
      </section>

      <section className="content-panel theme-control-card">
        <div className="theme-description">
          <div className={`theme-preview ${settings.theme}`}>
            {settings.theme === 'dark' ? <Moon size={22} /> : <Sun size={22} />}
          </div>
          <div><span className="eyebrow green">界面主题</span><h3>{settings.theme === 'dark' ? '黑夜模式' : '白天模式'}</h3><p>选择更适合当前环境的高对比度配色，修改后立即生效。</p></div>
        </div>
        <div className="theme-buttons" aria-label="切换界面主题">
          <button className="button secondary" type="button" onClick={() => setTheme(settings.theme === 'dark' ? 'light' : 'dark')} disabled={busy}><ChevronLeft size={17} /> 上一个主题</button>
          <button className="button secondary" type="button" onClick={() => setTheme(settings.theme === 'dark' ? 'light' : 'dark')} disabled={busy}>下一个主题 <ChevronRight size={17} /></button>
        </div>
      </section>

      <div className="settings-columns">
        <form className="content-panel settings-card" onSubmit={submit}>
          <header className="panel-header"><div><h3>扫描偏好</h3><span>控制查询范围与自动刷新频率</span></div></header>
          <div className="settings-form">
            <label><div><strong>扫描时间范围</strong><span>只搜索最近多少小时收到的邮件</span></div><div className="number-suffix"><input type="number" min="1" max="168" value={draft.scanWindowHours} onChange={(event) => setDraft({ ...draft, scanWindowHours: Number(event.target.value) })} /><span>小时</span></div></label>
            <label><div><strong>每个邮箱最大邮件数</strong><span>数值越小，批量扫描速度越快</span></div><div className="number-suffix"><input type="number" min="5" max="100" value={draft.maxMessagesPerAccount} onChange={(event) => setDraft({ ...draft, maxMessagesPerAccount: Number(event.target.value) })} /><span>封</span></div></label>
            <label><div><strong>自动刷新</strong><span>应用打开时按固定周期扫描已启用账户</span></div><button className={`switch ${draft.autoRefresh ? 'on' : ''}`} type="button" role="switch" aria-checked={draft.autoRefresh} onClick={() => setDraft({ ...draft, autoRefresh: !draft.autoRefresh })}><span /></button></label>
            <label className={!draft.autoRefresh ? 'muted-setting' : ''}><div><strong>自动刷新间隔</strong><span>建议邮箱较多时设置为 2 分钟以上</span></div><div className="number-suffix"><input type="number" min="1" max="60" disabled={!draft.autoRefresh} value={draft.pollIntervalMinutes} onChange={(event) => setDraft({ ...draft, pollIntervalMinutes: Number(event.target.value) })} /><span>分钟</span></div></label>
          </div>
          <footer className="settings-footer"><button className="button primary" type="submit" disabled={busy}><Save size={16} /> {busy ? '正在保存…' : '保存设置'}</button></footer>
        </form>

        <section className="content-panel settings-card vault-card">
          <header className="panel-header"><div><h3>本地保险库</h3><span>敏感信息存储状态</span></div></header>
          <div className="vault-detail"><div><HardDrive size={19} /><span><small>加密后端</small><strong>{vault.backend}</strong></span></div><div><Database size={19} /><span><small>数据文件</small><strong title={vault.storagePath}>{vault.storagePath}</strong></span></div></div>
          <div className="install-data-note"><CheckCircle2 size={15} /><span>数据默认保存在程序安装目录下的 <code>CodeHarbor-Data</code>，不固定使用 C 盘用户目录。</span></div>
          <div className="privacy-note"><ShieldAlert size={17} /><p>同一 Windows 登录用户下的其他高权限程序仍可能访问本机数据。请保持系统账户与设备安全，不要共享导出的凭据文件。</p></div>
          <div className="version-row"><span>CodeHarbor 验证码港</span><strong>V{version}</strong></div>
        </section>
      </div>

      <section className="content-panel update-card">
        <header className="panel-header"><div><h3>软件更新</h3><span>通过 GitHub Releases 自动检查、后台下载并重启完成更新</span></div><CloudDownload size={21} /></header>
        <div className="update-content">
          <div className={`update-state ${updateState?.phase ?? 'idle'}`} aria-live="polite">
            <strong>当前版本 V{version}{updateState?.availableVersion && updateState.availableVersion !== version ? ` · 最新 V${updateState.availableVersion}` : ''}</strong>
            <span>{updateState?.message ?? '正在读取更新状态…'}</span>
            {updateState?.percent !== undefined && (updateState.phase === 'downloading' || updateState.phase === 'downloaded') && (
              <div className="update-progress" role="progressbar" aria-valuenow={updateState.percent} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${updateState.percent}%` }} /></div>
            )}
          </div>
          <button className="button secondary" type="button" onClick={() => void onCheckUpdates()} disabled={checkingUpdate || updateState?.phase === 'unsupported'}>
            <RefreshCw size={16} className={checkingUpdate ? 'spin' : ''} /> {checkingUpdate ? '正在处理更新…' : '立即检查更新'}
          </button>
        </div>
      </section>

      <section className="content-panel portability-card">
        <header className="panel-header"><div><h3>跨电脑备份与恢复</h3><span>导出全部邮箱、2FA 和扫描设置</span></div><ArchiveRestore size={19} /></header>
        <div className="portability-content">
          <div><strong>一个文件完成迁移</strong><p>备份文件使用密码派生密钥和 AES-256-GCM 加密。导入另一台电脑时会重新使用该电脑的系统安全存储保护数据。</p></div>
          <div className="button-row"><button className="button secondary" type="button" onClick={onImport} disabled={busy}><Upload size={16} /> 导入备份</button><button className="button primary" type="button" onClick={onExport} disabled={busy}><Download size={16} /> 导出备份</button></div>
        </div>
      </section>

      <section className="content-panel provider-guide">
        <header className="panel-header"><div><h3>邮箱导入与认证教程</h3><span>先在邮箱官网开启 IMAP，再把客户端授权码或应用专用密码填入 CodeHarbor</span></div></header>
        <div className="provider-tutorials">{providers.map((provider) => <details key={provider.id}><summary><div className="provider-avatar tiny" style={{ '--provider-color': provider.accent } as React.CSSProperties}>{provider.shortName.slice(0, 2)}</div><div><strong>{provider.name}</strong><span><Server size={12} /> {provider.host || '由用户填写'}:{provider.port} · {provider.credentialLabel}</span></div></summary><div className="tutorial-body"><p>{provider.help}</p><ol>{provider.setupSteps.map((step) => <li key={step}>{step}</li>)}</ol>{provider.helpUrl && <button className="button tiny secondary" type="button" onClick={() => void onOpenExternal(provider.helpUrl!)}>打开官方教程 <ExternalLink size={13} /></button>}</div></details>)}</div>
      </section>
    </div>
  );
}
