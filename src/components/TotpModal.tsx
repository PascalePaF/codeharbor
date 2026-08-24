import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { PublicTotpEntry, TotpAlgorithm, TotpInput } from '../shared/contracts';
import { Modal } from './Modal';

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
            <span>项目名称</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如：主账户" required={!secret.toLowerCase().startsWith('otpauth://')} autoFocus />
          </label>
          <label>
            <span>服务 / 发行方</span>
            <input value={issuer} onChange={(event) => setIssuer(event.target.value)} placeholder="例如：OpenAI" />
          </label>
          <label className="full-span">
            <span>{entry ? '新密钥（更新时必填）' : '2FA 密钥'}</span>
            <div className="input-with-action">
              <input type={showSecret ? 'text' : 'password'} value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="Base32 密钥或 otpauth:// 链接" required autoComplete="off" />
              <button type="button" onClick={() => setShowSecret((value) => !value)} aria-label="显示或隐藏密钥">{showSecret ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
          </label>
          <label>
            <span>位数</span>
            <select value={digits} onChange={(event) => setDigits(Number(event.target.value) as 6 | 8)}><option value={6}>6 位</option><option value={8}>8 位</option></select>
          </label>
          <label>
            <span>周期（秒）</span>
            <input type="number" min="15" max="120" value={period} onChange={(event) => setPeriod(Number(event.target.value))} />
          </label>
          <label>
            <span>算法</span>
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
