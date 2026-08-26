import { ArchiveRestore, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import type { BackupScope } from '../shared/contracts';

interface BackupModalProps {
  mode: 'export' | 'import';
  scope: BackupScope;
  busy: boolean;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
}

const SCOPE_LABELS: Record<BackupScope, string> = {
  all: '全部数据',
  accounts: '邮箱账户',
  totp: '2FA 动态码',
};

export function BackupModal({ mode, scope, busy, onClose, onSubmit }: BackupModalProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const exporting = mode === 'export';
  const mismatch = exporting && confirmation.length > 0 && password !== confirmation;
  const scopeLabel = SCOPE_LABELS[scope];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8 || mismatch || (exporting && password !== confirmation)) return;
    void onSubmit(password);
  };

  return (
    <Modal
      title={`${exporting ? '导出' : '导入'}${scopeLabel}加密备份`}
      description={exporting
        ? `将${scopeLabel}打包为一个可跨电脑恢复的加密文件。`
        : `选择 .chbackup 文件，密码验证通过后导入其中的${scopeLabel}。`}
      onClose={onClose}
    >
      <form className="modal-form backup-form" onSubmit={submit}>
        <div className="backup-security-note">
          {exporting ? <LockKeyhole size={20} /> : <ArchiveRestore size={20} />}
          <div>
            <strong>{exporting ? '备份文件使用独立密码加密' : '不会直接复制 Windows DPAPI 密文'}</strong>
            <span>{exporting ? '密码不会保存；忘记后无法恢复。请至少使用 8 个字符，并妥善保管。' : '导入时会在本机重新加密。重复邮箱和 2FA 项目会更新，其余数据保留。'}</span>
          </div>
        </div>

        <label className="backup-password-field">
          <span>{exporting ? '设置备份密码' : '输入备份密码'}</span>
          <div className="input-with-action">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              minLength={8}
              maxLength={128}
              autoComplete={exporting ? 'new-password' : 'current-password'}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 8 个字符"
              autoFocus
              required
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="显示或隐藏备份密码">
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </label>

        {exporting && (
          <label className="backup-password-field">
            <span>再次输入备份密码</span>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmation}
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="两次输入必须一致"
              required
            />
            {mismatch && <small className="field-error">两次输入的密码不一致</small>}
          </label>
        )}

        <footer className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>取消</button>
          <button className="button primary" type="submit" disabled={busy || password.length < 8 || (exporting && password !== confirmation)}>
            {busy ? '正在处理…' : exporting ? '选择位置并导出' : '选择备份并导入'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
