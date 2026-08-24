import { CheckCircle2, Database, HardDrive, LockKeyhole, Save, Server, ShieldAlert } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { AppSettings, ProviderPreset, VaultInfo } from '../shared/contracts';

interface SettingsPageProps {
  settings: AppSettings;
  vault: VaultInfo;
  providers: ProviderPreset[];
  version: string;
  busy: boolean;
  onSave: (settings: Partial<AppSettings>) => Promise<void>;
}

export function SettingsPage({ settings, vault, providers, version, busy, onSave }: SettingsPageProps) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  const submit = (event: FormEvent) => { event.preventDefault(); void onSave(draft); };

  return (
    <div className="page-stack settings-layout">
      <section className="security-banner">
        <div className="security-orb"><LockKeyhole size={25} /></div>
        <div><span className="eyebrow green">LOCAL-FIRST SECURITY</span><h2>{vault.encryptionAvailable ? '系统加密保护已启用' : '系统安全存储不可用'}</h2><p>邮箱凭据与 2FA 密钥不会进入网页存储，也不会发送到 CodeHarbor 服务器。</p></div>
        <span className={`status-badge ${vault.encryptionAvailable ? 'ok' : 'error'}`}>{vault.encryptionAvailable ? <CheckCircle2 size={14} /> : <ShieldAlert size={14} />}{vault.encryptionAvailable ? '保护中' : '不可用'}</span>
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
          <div className="privacy-note"><ShieldAlert size={17} /><p>同一 Windows 登录用户下的其他高权限程序仍可能访问本机数据。请保持系统账户与设备安全，不要共享导出的凭据文件。</p></div>
          <div className="version-row"><span>CodeHarbor 验证码港</span><strong>V{version}</strong></div>
        </section>
      </div>

      <section className="content-panel provider-guide">
        <header className="panel-header"><div><h3>已内置邮箱服务</h3><span>所有连接均使用标准 IMAP，TLS 证书会被严格校验</span></div></header>
        <div className="provider-guide-grid">{providers.map((provider) => <article key={provider.id}><div className="provider-avatar tiny" style={{ '--provider-color': provider.accent } as React.CSSProperties}>{provider.shortName.slice(0, 2)}</div><div><strong>{provider.name}</strong><span><Server size={12} /> {provider.host || '由用户填写'}:{provider.port}</span><p>{provider.help}</p></div></article>)}</div>
      </section>
    </div>
  );
}
