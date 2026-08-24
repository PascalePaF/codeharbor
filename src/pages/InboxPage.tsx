import { Check, CircleAlert, Clipboard, Inbox, MailCheck, RefreshCw, ShieldCheck, TimerReset } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatDateTime, formatRelativeTime } from '../lib/format';
import type { PublicMailAccount, ProviderPreset, VerificationMessage } from '../shared/contracts';

interface InboxPageProps {
  accounts: PublicMailAccount[];
  messages: VerificationMessage[];
  providers: ProviderPreset[];
  search: string;
  scanning: boolean;
  lastScan?: string;
  onScan: () => Promise<void>;
  onCopy: (value: string) => Promise<void>;
  onGoAccounts: () => void;
}

export function InboxPage({ accounts, messages, providers, search, scanning, lastScan, onScan, onCopy, onGoAccounts }: InboxPageProps) {
  const [accountFilter, setAccountFilter] = useState('all');
  const [copiedCode, setCopiedCode] = useState('');
  const enabled = accounts.filter((account) => account.enabled);
  const errors = accounts.filter((account) => account.status.state === 'error');
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return messages.filter((message) => {
      const matchesAccount = accountFilter === 'all' || message.accountId === accountFilter;
      const matchesQuery = !query || [message.subject, message.sender, message.accountEmail, message.accountLabel, ...message.codes].some((value) => value.toLowerCase().includes(query));
      return matchesAccount && matchesQuery;
    });
  }, [messages, search, accountFilter]);

  const copy = async (code: string) => {
    await onCopy(code);
    setCopiedCode(code);
    window.setTimeout(() => setCopiedCode(''), 1400);
  };

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <span className="eyebrow green">LIVE CODE FEED</span>
          <h2>所有邮箱验证码，一处查看。</h2>
          <p>只读扫描最近邮件，自动提取 4–10 位验证码；不会把邮件标记为已读。</p>
        </div>
        <button className="button primary large" type="button" onClick={() => void onScan()} disabled={scanning || !enabled.length}>
          <RefreshCw size={18} className={scanning ? 'spin' : ''} />
          {scanning ? '正在扫描邮箱…' : '立即扫描'}
        </button>
      </section>

      <section className="stat-grid">
        <article className="stat-card"><div className="stat-icon mint"><MailCheck size={20} /></div><div><span>已启用邮箱</span><strong>{enabled.length}</strong><small>共 {accounts.length} 个账户</small></div></article>
        <article className="stat-card"><div className="stat-icon blue"><ShieldCheck size={20} /></div><div><span>本次验证码</span><strong>{messages.reduce((sum, item) => sum + item.codes.length, 0)}</strong><small>{messages.length} 封匹配邮件</small></div></article>
        <article className="stat-card"><div className="stat-icon amber"><TimerReset size={20} /></div><div><span>最近扫描</span><strong className="text-stat">{lastScan ? formatRelativeTime(lastScan) : '尚未扫描'}</strong><small>{lastScan ? formatDateTime(lastScan) : '点击右上方按钮开始'}</small></div></article>
      </section>

      {errors.length > 0 && (
        <section className="error-strip">
          <CircleAlert size={18} />
          <div><strong>{errors.length} 个邮箱连接失败</strong><span>{errors.slice(0, 2).map((account) => `${account.label}：${account.status.message}`).join('；')}</span></div>
          <button type="button" onClick={onGoAccounts}>查看账户</button>
        </section>
      )}

      <section className="content-panel inbox-panel">
        <header className="panel-header">
          <div><h3>最新验证码</h3><span>{filtered.length} 封邮件</span></div>
          <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)} aria-label="筛选邮箱账户">
            <option value="all">全部邮箱</option>
            {accounts.map((account) => <option value={account.id} key={account.id}>{account.label}</option>)}
          </select>
        </header>

        {!accounts.length ? (
          <div className="empty-state"><div className="empty-icon"><Inbox size={30} /></div><h3>先添加一个邮箱账户</h3><p>支持 163、126、QQ、Gmail、阿里、Microsoft、Mail.com 与自定义 IMAP。</p><button className="button primary" type="button" onClick={onGoAccounts}>添加邮箱</button></div>
        ) : scanning && !messages.length ? (
          <div className="empty-state"><div className="scan-radar"><span /></div><h3>正在安全扫描</h3><p>邮箱较多时可能需要几十秒，请保持网络连接。</p></div>
        ) : !filtered.length ? (
          <div className="empty-state compact"><div className="empty-icon"><Inbox size={28} /></div><h3>{messages.length ? '没有符合筛选的结果' : '暂未发现验证码'}</h3><p>{messages.length ? '尝试清除搜索词或切换邮箱。' : '点击“立即扫描”读取最近邮件中的验证码。'}</p></div>
        ) : (
          <div className="message-list">
            {filtered.map((message) => {
              const provider = providers.find((item) => item.id === message.provider);
              return (
                <article className="message-row" key={message.id}>
                  <div className="provider-avatar" style={{ '--provider-color': provider?.accent ?? '#86d9b2' } as React.CSSProperties}>{provider?.shortName.slice(0, 2) ?? 'IM'}</div>
                  <div className="message-meta">
                    <div><strong>{message.subject}</strong><time>{formatRelativeTime(message.receivedAt)}</time></div>
                    <span>{message.sender}</span>
                    <small>{message.accountLabel} · {message.accountEmail}</small>
                    <p>{message.preview}</p>
                  </div>
                  <div className="message-codes">
                    {message.codes.map((code, index) => (
                      <button className={index === 0 ? 'code-chip primary-code' : 'code-chip'} type="button" onClick={() => void copy(code)} key={code} title="点击复制">
                        <span>{code}</span>{copiedCode === code ? <Check size={16} /> : <Clipboard size={16} />}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
