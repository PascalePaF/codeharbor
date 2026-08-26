import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { PublicTotpEntry, TotpAlgorithm, TotpInput } from '../shared/contracts';
import { Modal } from './Modal';
import { HelpHint } from './HelpHint';

interface TotpModalProps {
  entry?: PublicTotpEntry;
  busy: boolean;
  onClose: () => void;
  onSave: (input: TotpInput) => Promise<void>;
}

export function TotpModal({ entry, busy, onClose, onSave }: TotpModalProps) {
  const [label, setLabel] = useState(entry?.label ?? '');
  const [issuer, setIssuer] = useState(entry?.issuer ?? '');
  const [secret, setSecret] = useState('');
  const [digits, setDigits] = useState<6 | 8>(entry?.digits ?? 6);
  const [period, setPeriod] = useState(entry?.period ?? 30);
  const [algorithm, setAlgorithm] = useState<TotpAlgorithm>(entry?.algorithm ?? 'SHA1');
  const [showSecret, setShowSecret] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave({ id: entry?.id, label, issuer, secret, digits, period, algorithm });
  };

  return (
    <Modal title={entry ? '更新 2FA 项目' : '添加 2FA 项目'} description="支持 Base32 密钥和完整 otpauth:// 链接。" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="totp-hero"><KeyRound size={24} /><span>密钥只在主进程中解密，用于实时生成动态码。</span></div>
        <div className="form-grid two-columns">
          <label>
            <span className="field-label">项目名称 <HelpHint text="用于在 CodeHarbor 中辨认该账户，例如“工作 ChatGPT”。如果粘贴完整 otpauth 链接，通常会自动带出名称。" /></span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如：主账户" required={!secret.toLowerCase().startsWith('otpauth://')} autoFocus />
          </label>
          <label>
            <span className="field-label">服务 / 发行方 <HelpHint align="right" text="填写提供 2FA 的网站或应用名称，例如 OpenAI、Google。它只用于分类显示。" /></span>
            <input value={issuer} onChange={(event) => setIssuer(event.target.value)} placeholder="例如：OpenAI" />
          </label>
          <label className="full-span">
            <span className="field-label">{entry ? '新密钥（更新时必填）' : '2FA 密钥'} <HelpHint text="填写网站在启用身份验证器时给出的 Base32 密钥，或直接粘贴 otpauth:// 链接。这里不是邮箱密码，也不是当前 6 位动态码。" /></span>
            <div className="input-with-action">
              <input type={showSecret ? 'text' : 'password'} value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="Base32 密钥或 otpauth:// 链接" required autoComplete="off" />
              <button type="button" onClick={() => setShowSecret((value) => !value)} aria-label="显示或隐藏密钥">{showSecret ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
          </label>
          <label>
            <span className="field-label">位数 <HelpHint text="绝大多数服务使用 6 位动态码；只有服务明确说明为 8 位时才选择 8 位。" /></span>
            <select value={digits} onChange={(event) => setDigits(Number(event.target.value) as 6 | 8)}><option value={6}>6 位</option><option value={8}>8 位</option></select>
          </label>
          <label>
            <span className="field-label">周期（秒） <HelpHint align="right" text="动态码多久刷新一次。通常保持 30 秒；仅在服务明确给出其他周期时修改。" /></span>
            <input type="number" min="15" max="120" value={period} onChange={(event) => setPeriod(Number(event.target.value))} />
          </label>
          <label>
            <span className="field-label">算法 <HelpHint text="绝大多数服务使用 SHA1。只有服务或 otpauth 链接明确指定 SHA256 / SHA512 时才修改。" /></span>
            <select value={algorithm} onChange={(event) => setAlgorithm(event.target.value as TotpAlgorithm)}><option>SHA1</option><option>SHA256</option><option>SHA512</option></select>
          </label>
        </div>
        <footer className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>取消</button>
          <button className="button primary" type="submit" disabled={busy}>{busy ? '正在保存…' : entry ? '更新项目' : '添加项目'}</button>
        </footer>
      </form>
    </Modal>
  );
}
