import {
  Check,
  CircleAlert,
  Clipboard,
  Inbox,
  KeyRound,
  Mail,
  RefreshCw,
  SearchCheck,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatRelativeTime, maskEmail } from '../lib/format';
import type {
  ProviderPreset,
  PublicMailAccount,
  TotpCode,
  VerificationMessage,
} from '../shared/contracts';

interface InboxPageProps {
  accounts: PublicMailAccount[];
  messages: VerificationMessage[];
  providers: ProviderPreset[];
  totpCodes: TotpCode[];
  search: string;
  scanningTarget: string;
  lastScan?: string;
  onScanAll: () => Promise<void>;
  onScanAccount: (accountId: string) => Promise<void>;
  onCopy: (value: string) => Promise<boolean>;
  onGoAccounts: () => void;
  onGoTotp: () => void;
}

export function InboxPage({
  accounts,
  messages,
  providers,
  totpCodes,
  search,
  scanningTarget,
  lastScan,
  onScanAll,
  onScanAccount,
  onCopy,
  onGoAccounts,
  onGoTotp,
}: InboxPageProps) {
  const [accountFilter, setAccountFilter] = useState('all');
  const [copiedKey, setCopiedKey] = useState('');
  const copyTimer = useRef<number | undefined>(undefined);
  const enabled = accounts.filter((account) => account.enabled);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return messages.filter((message) => {
      const matchesAccount = accountFilter === 'all' || message.accountId === accountFilter;
      const matchesQuery = !query || [
        message.sender,
        message.purpose,
        message.accountEmail,
        message.accountLabel,
        ...message.codes,
      ].some((value) => value.toLowerCase().includes(query));
      return matchesAccount && matchesQuery;
    });
  }, [messages, search, accountFilter]);

  useEffect(() => () => {
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
  }, []);

  const copy = async (code: string, key: string) => {
    if (!await onCopy(code)) return;
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    setCopiedKey(key);
    copyTimer.current = window.setTimeout(() => setCopiedKey(''), 1_400);
  };

  const scanAccount = async (accountId: string) => {
    setAccountFilter(accountId);
    await onScanAccount(accountId);
  };

  return (
    <div className="inbox-workspace">
      <section className="inbox-commandbar">
        <div>
          <span className="eyebrow green">CHATGPT LOGIN</span>
          <h2>ChatGPT 登录验证码与 2FA，一处处理</h2>
          <p>仅接收 OpenAI 官方地址发出的 6 位 ChatGPT 登录码；其余邮件全部忽略。</p>
        </div>
        <div className="scan-summary">
          <span>{lastScan ? `最近扫描：${formatRelativeTime(lastScan)}` : '尚未扫描邮箱'}</span>
          <button
            className="button primary large"
            type="button"
            onClick={() => { setAccountFilter('all'); void onScanAll(); }}
            disabled={Boolean(scanningTarget) || !enabled.length}
          >
            <RefreshCw size={18} className={scanningTarget === 'all' ? 'spin' : ''} />
            {scanningTarget === 'all' ? '正在批量扫描…' : '立即扫描全部邮箱'}
          </button>
        </div>
      </section>

      <div className="inbox-columns">
        <aside className="inbox-rail account-rail">
          <header>
            <div><Mail size={18} /><strong>邮箱账户</strong></div>
            <span>{enabled.length} 个启用</span>
          </header>
          <button
            className={`rail-all ${accountFilter === 'all' ? 'active' : ''}`}
            type="button"
            onClick={() => setAccountFilter('all')}
          >
            <span><Inbox size={17} /> 全部验证码</span>
            <em>{messages.length}</em>
          </button>
          <div className="rail-scroll">
            {!accounts.length ? (
              <div className="rail-empty"><p>还没有邮箱账户</p><button type="button" onClick={onGoAccounts}>前往添加</button></div>
            ) : accounts.map((account) => {
              const provider = providers.find((item) => item.id === account.provider);
              const accountMessages = messages.filter((message) => message.accountId === account.id).length;
              const isScanning = scanningTarget === account.id;
              return (
                <article className={`rail-account ${accountFilter === account.id ? 'selected' : ''} ${account.enabled ? '' : 'disabled'}`} key={account.id}>
                  <button className="rail-account-main" type="button" onClick={() => setAccountFilter(account.id)}>
                    <span className="provider-avatar tiny" style={{ '--provider-color': provider?.accent ?? '#4fae8a' } as React.CSSProperties}>{provider?.shortName.slice(0, 2) ?? 'IM'}</span>
                    <span><strong>{account.label}</strong><small>{maskEmail(account.email)}</small></span>
                    <em>{accountMessages}</em>
                  </button>
                  {account.status.state === 'error' && <span className="account-inline-error" title={account.status.message}><CircleAlert size={13} /> {account.status.message}</span>}
                  <button
                    className="rail-scan-button"
                    type="button"
                    disabled={!account.enabled || Boolean(scanningTarget)}
                    onClick={() => void scanAccount(account.id)}
                  >
                    <RefreshCw size={14} className={isScanning ? 'spin' : ''} />
                    {isScanning ? '正在查询…' : account.enabled ? '查询此邮箱' : '已暂停'}
                  </button>
                </article>
              );
            })}
          </div>
        </aside>

        <section className="inbox-results content-panel">
          <header className="results-header">
            <div><SearchCheck size={19} /><div><h3>{accountFilter === 'all' ? '全部验证码结果' : accounts.find((item) => item.id === accountFilter)?.label ?? '验证码结果'}</h3><span>{filtered.length} 条匹配结果</span></div></div>
            <span className="filter-note">仅显示 ChatGPT 登录验证码</span>
          </header>
          <div className="results-scroll" aria-live="polite">
            {!accounts.length ? (
              <div className="empty-state"><div className="empty-icon"><Inbox size={29} /></div><h3>先添加邮箱账户</h3><p>支持主流邮箱和自定义 IMAP。</p><button className="button primary" type="button" onClick={onGoAccounts}>添加邮箱</button></div>
            ) : scanningTarget && !filtered.length ? (
              <div className="empty-state"><div className="scan-radar"><span /></div><h3>正在只读查询 ChatGPT 登录码</h3><p>只匹配 OpenAI 官方 OTP 发件地址；邮箱较多时可能需要几十秒。</p></div>
            ) : !filtered.length ? (
              <div className="empty-state compact"><div className="empty-icon"><SearchCheck size={28} /></div><h3>{messages.length ? '当前筛选没有结果' : '暂未发现 ChatGPT 登录验证码'}</h3><p>{messages.length ? '可切换邮箱或清除顶部搜索词。' : '默认查询最近 5 小时；可全量扫描或单独查询一个邮箱。'}</p></div>
            ) : filtered.map((message) => {
              const provider = providers.find((item) => item.id === message.provider);
              return (
                <article className="verification-result" data-message-id={message.id} key={message.id}>
                  <div className="verification-source">
                    <span className="provider-avatar small" style={{ '--provider-color': provider?.accent ?? '#4fae8a' } as React.CSSProperties}>{provider?.shortName.slice(0, 2) ?? 'IM'}</span>
                    <div><strong title={message.sender}>{message.sender}</strong><span title={`${message.accountLabel} · ${message.accountEmail}`}>{message.accountLabel} · {formatRelativeTime(message.receivedAt)}</span></div>
                  </div>
                  <div className="verification-purpose"><small>用途说明</small><strong title={message.purpose || 'ChatGPT 登录验证码'}>{message.purpose || 'ChatGPT 登录验证码'}</strong></div>
                  <div className="verification-codes">
                    {message.codes.map((code, index) => {
                      const copyKey = `${message.id}:${index}:${code}`;
                      return (
                      <button type="button" onClick={() => void copy(code, copyKey)} key={copyKey} title="点击复制验证码" aria-label={`复制验证码 ${code}`}>
                        <span>{code}</span>{copiedKey === copyKey ? <Check size={16} /> : <Clipboard size={16} />}
                      </button>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="inbox-rail totp-rail">
          <header>
            <div><KeyRound size={18} /><strong>2FA 动态码</strong></div>
            <span>{totpCodes.length} 项</span>
          </header>
          <div className="rail-scroll">
            {!totpCodes.length ? (
              <div className="rail-empty"><p>还没有 2FA 项目</p><span>添加后可在收件箱旁直接复制</span><button type="button" onClick={onGoTotp}>前往添加 2FA</button></div>
            ) : totpCodes.map((entry) => {
              const progress = Math.max(0, Math.min(100, (entry.secondsRemaining / entry.period) * 100));
              return (
                <button className={`rail-totp ${entry.secondsRemaining <= 5 ? 'expiring' : ''}`} type="button" onClick={() => void copy(entry.code, `totp:${entry.id}`)} key={entry.id} aria-label={`复制 ${entry.label} 的动态码`}>
                  <span><strong>{entry.label}</strong><small>{entry.issuer || '未设置发行方'}</small></span>
                  <b>{entry.code}</b>
                  <i><span style={{ width: `${progress}%` }} /></i>
                  <em>{entry.secondsRemaining} 秒 · 点击复制</em>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
