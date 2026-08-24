import { Eye, EyeOff, Server, ShieldCheck } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import type { MailAccountInput, ProviderId, ProviderPreset, PublicMailAccount } from '../shared/contracts';
import { detectProvider } from '../lib/importers';
import { Modal } from './Modal';

interface AccountModalProps {
  providers: ProviderPreset[];
  account?: PublicMailAccount;
  busy: boolean;
  onClose: () => void;
  onSave: (input: MailAccountInput) => Promise<void>;
}

export function AccountModal({ providers, account, busy, onClose, onSave }: AccountModalProps) {
  const [email, setEmail] = useState(account?.email ?? '');
  const [label, setLabel] = useState(account?.label ?? '');
  const [provider, setProvider] = useState<ProviderId>(account?.provider ?? '163');
  const [username, setUsername] = useState(account?.username ?? '');
  const [credential, setCredential] = useState('');
  const [authMode, setAuthMode] = useState(account?.authMode ?? 'password');
  const [imapHost, setImapHost] = useState(account?.imapHost ?? '');
  const [imapPort, setImapPort] = useState(account?.imapPort ?? 993);
  const [secure, setSecure] = useState(account?.secure ?? true);
  const [showCredential, setShowCredential] = useState(false);
  const selectedProvider = useMemo(
    () => providers.find((item) => item.id === provider) ?? providers[providers.length - 1],
    [provider, providers],
  );

  const handleEmailBlur = () => {
    if (account || provider === 'custom' || !email.includes('@')) return;
    const detected = detectProvider(email, providers);
    setProvider(detected);
  };

  const handleProvider = (value: ProviderId) => {
    setProvider(value);
    const preset = providers.find((item) => item.id === value);
    if (preset && value !== 'custom') {
      setImapHost(preset.host);
      setImapPort(preset.port);
      setSecure(preset.secure);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave({
      id: account?.id,
      label: label || email,
      email,
      provider,
      username: username || email,
      credential: credential || undefined,
      authMode,
      imapHost: provider === 'custom' ? imapHost : selectedProvider.host,
      imapPort: provider === 'custom' ? imapPort : selectedProvider.port,
      secure: provider === 'custom' ? secure : selectedProvider.secure,
      enabled: account?.enabled ?? true,
    });
  };

  return (
    <Modal
      title={account ? '编辑邮箱账户' : '添加邮箱账户'}
      description="凭据将在主进程中立即加密，界面不会再次读取明文。"
      onClose={onClose}
      wide
    >
      <form className="modal-form" onSubmit={submit}>
        <div className="provider-picker" role="radiogroup" aria-label="邮箱服务商">
          {providers.map((item) => (
            <button
              className={provider === item.id ? 'selected' : ''}
              style={{ '--provider-color': item.accent } as React.CSSProperties}
              key={item.id}
              type="button"
              onClick={() => handleProvider(item.id)}
            >
              <span>{item.shortName.slice(0, 2)}</span>
              {item.shortName}
            </button>
          ))}
        </div>

        <div className="form-grid two-columns">
          <label>
            <span>邮箱地址</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onBlur={handleEmailBlur}
              placeholder="name@example.com"
              required
              autoFocus
            />
          </label>
          <label>
            <span>显示名称</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如：工作邮箱" />
          </label>
          <label>
            <span>登录用户名</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="默认使用完整邮箱地址" />
          </label>
          <label>
            <span>认证方式</span>
            <select value={authMode} onChange={(event) => setAuthMode(event.target.value as 'password' | 'oauth2')}>
              <option value="password">授权码 / 应用密码</option>
              <option value="oauth2">OAuth2 访问令牌</option>
            </select>
          </label>
          <label className="full-span">
            <span>{authMode === 'oauth2' ? 'OAuth2 访问令牌' : selectedProvider.credentialLabel}</span>
            <div className="input-with-action">
              <input
                type={showCredential ? 'text' : 'password'}
                value={credential}
                onChange={(event) => setCredential(event.target.value)}
                placeholder={account ? '留空将保留现有凭据' : '仅保存在这台电脑上'}
                required={!account}
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowCredential((value) => !value)} aria-label="显示或隐藏凭据">
                {showCredential ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
        </div>

        {provider === 'custom' && (
          <div className="custom-server-box">
            <div className="section-label"><Server size={16} /> 自定义服务器</div>
            <div className="form-grid server-columns">
              <label>
                <span>IMAP 服务器</span>
                <input value={imapHost} onChange={(event) => setImapHost(event.target.value)} placeholder="imap.example.com" required />
              </label>
              <label>
                <span>端口</span>
                <input type="number" min="1" max="65535" value={imapPort} onChange={(event) => setImapPort(Number(event.target.value))} required />
              </label>
              <label className="checkbox-field">
                <input type="checkbox" checked={secure} onChange={(event) => setSecure(event.target.checked)} />
                <span>使用 TLS 加密连接</span>
              </label>
            </div>
          </div>
        )}

        <div className="provider-help">
          <ShieldCheck size={17} />
          <div><strong>{selectedProvider.name}</strong><span>{selectedProvider.help}</span></div>
        </div>

        <footer className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>取消</button>
          <button className="button primary" type="submit" disabled={busy}>{busy ? '正在保存…' : account ? '保存更改' : '添加账户'}</button>
        </footer>
      </form>
    </Modal>
  );
}
