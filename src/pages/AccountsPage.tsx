import { CheckCircle2, CircleAlert, Clock3, Download, FileUp, Mail, MoreVertical, Pencil, Plus, Power, RefreshCw, Server, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatRelativeTime, maskEmail } from '../lib/format';
import type { ProviderPreset, PublicMailAccount } from '../shared/contracts';

interface AccountsPageProps {
  accounts: PublicMailAccount[];
  providers: ProviderPreset[];
  search: string;
  testingId: string;
  onAdd: () => void;
  onBulk: () => void;
  onSecureImport: () => void;
  onSecureExport: () => void;
  onEdit: (account: PublicMailAccount) => void;
  onDelete: (account: PublicMailAccount) => Promise<void>;
  onToggle: (account: PublicMailAccount) => Promise<void>;
  onTest: (account: PublicMailAccount) => Promise<void>;
}

function StatusBadge({ account }: { account: PublicMailAccount }) {
  if (account.status.state === 'ok') return <span className="status-badge ok"><CheckCircle2 size={14} /> 正常</span>;
  if (account.status.state === 'error') return <span className="status-badge error"><CircleAlert size={14} /> 异常</span>;
  if (account.status.state === 'checking') return <span className="status-badge checking"><RefreshCw size={14} className="spin" /> 检查中</span>;
  return <span className="status-badge idle"><Clock3 size={14} /> 未检查</span>;
}

export function AccountsPage({ accounts, providers, search, testingId, onAdd, onBulk, onSecureImport, onSecureExport, onEdit, onDelete, onToggle, onTest }: AccountsPageProps) {
  const [openMenu, setOpenMenu] = useState('');
  useEffect(() => {
    const close = () => setOpenMenu('');
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return accounts.filter((account) => !query || [account.label, account.email, account.imapHost, providers.find((item) => item.id === account.provider)?.name ?? ''].some((value) => value.toLowerCase().includes(query)));
  }, [accounts, search, providers]);

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div><span className="eyebrow green">ACCOUNT VAULT</span><h2>管理邮箱连接</h2><p>使用 IMAP 只读访问。新增凭据写入后不会在界面中回显。</p></div>
        <div className="button-row page-actions">
          <button className="button secondary" type="button" onClick={onBulk}><FileUp size={17} /> CSV 批量导入</button>
          <button className="button secondary" type="button" onClick={onSecureImport}><Upload size={17} /> 加密导入</button>
          <button className="button secondary" type="button" onClick={onSecureExport} disabled={!accounts.length}><Download size={17} /> 加密导出</button>
          <button className="button primary" type="button" onClick={onAdd}><Plus size={17} /> 添加邮箱</button>
        </div>
      </section>

      <section className="content-panel account-panel">
        <header className="panel-header"><div><h3>邮箱账户</h3><span>{filtered.length} / {accounts.length} 个账户</span></div><div className="legend"><span><i className="dot ok" />可用</span><span><i className="dot error" />需处理</span></div></header>
        {!filtered.length ? (
          <div className="empty-state"><div className="empty-icon"><Mail size={30} /></div><h3>{accounts.length ? '没有匹配的邮箱' : '还没有邮箱账户'}</h3><p>{accounts.length ? '换一个关键词试试。' : '单个添加，或用 CSV / 文本一次导入多个邮箱。'}</p>{!accounts.length && <button className="button primary" type="button" onClick={onAdd}>添加第一个邮箱</button>}</div>
        ) : (
          <div className="account-table" role="table">
            <div className="account-table-head" role="row"><span>账户</span><span>服务商 / 服务器</span><span>状态</span><span>启用</span><span /></div>
            {filtered.map((account, index) => {
              const provider = providers.find((item) => item.id === account.provider);
              return (
                <div className={`account-table-row ${account.enabled ? '' : 'disabled'}`} role="row" key={account.id}>
                  <div className="account-identity"><div className="provider-avatar small" style={{ '--provider-color': provider?.accent ?? '#93a4a0' } as React.CSSProperties}>{provider?.shortName.slice(0, 2)}</div><div><strong>{account.label}</strong><span title={account.email}>{maskEmail(account.email)}</span></div></div>
                  <div className="server-cell"><strong>{provider?.name ?? '自定义 IMAP'}</strong><span><Server size={13} /> {account.imapHost}:{account.imapPort} · {account.authMode === 'oauth2' ? 'OAuth2' : '授权码'}</span></div>
                  <div className="status-cell"><StatusBadge account={account} /><small title={account.status.message}>{account.status.checkedAt ? `${formatRelativeTime(account.status.checkedAt)} · ${account.status.message}` : account.status.message}</small></div>
                  <div><button className={`switch ${account.enabled ? 'on' : ''}`} type="button" role="switch" aria-checked={account.enabled} onClick={() => void onToggle(account)}><span /></button></div>
                  <div className="row-actions">
                    <button className="button tiny secondary" type="button" disabled={testingId === account.id || !account.enabled} onClick={() => void onTest(account)}>{testingId === account.id ? <RefreshCw size={14} className="spin" /> : <Power size={14} />} 测试</button>
                    <div className="menu-wrap" onClick={(event) => event.stopPropagation()}><button className="icon-button" type="button" onClick={() => setOpenMenu(openMenu === account.id ? '' : account.id)} aria-label="更多操作" aria-expanded={openMenu === account.id}><MoreVertical size={18} /></button>{openMenu === account.id && <div className={`context-menu ${index >= filtered.length - 2 ? 'open-up' : ''}`}><button type="button" onClick={() => { setOpenMenu(''); onEdit(account); }}><Pencil size={15} /> 编辑</button><button className="danger" type="button" onClick={() => { setOpenMenu(''); void onDelete(account); }}><Trash2 size={15} /> 删除</button></div>}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
