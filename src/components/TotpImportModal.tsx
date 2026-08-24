import { Download, KeyRound, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { parseTotpImport, TOTP_SAMPLE } from '../lib/importers';
import type { TotpInput } from '../shared/contracts';
import { Modal } from './Modal';

interface TotpImportModalProps {
  busy: boolean;
  onClose: () => void;
  onImport: (inputs: TotpInput[]) => Promise<void>;
}

function downloadSample() {
  const url = URL.createObjectURL(new Blob([`\uFEFF${TOTP_SAMPLE}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'codeharbor-2fa-sample.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

export function TotpImportModal({ busy, onClose, onImport }: TotpImportModalProps) {
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => {
    try { return { rows: parseTotpImport(text), error: '' }; }
    catch (error) { return { rows: [], error: error instanceof Error ? error.message : '解析失败' }; }
  }, [text]);

  return (
    <Modal title="批量导入 2FA" description="可逐行粘贴 otpauth 链接，或导入 CSV / TXT。" onClose={onClose} wide>
      <div className="import-toolbar">
        <button className="button secondary" type="button" onClick={() => fileRef.current?.click()}><Upload size={16} /> 选择文件</button>
        <button className="button ghost" type="button" onClick={downloadSample}><Download size={16} /> 下载模板</button>
        <input ref={fileRef} hidden type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then(setText); }} />
      </div>
      <label className="import-area">
        <span>每行 <code>名称----Base32 密钥----发行方</code>，或每行一个 otpauth:// 链接</span>
        <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="主账户----JBSWY3DPEHPK3PXP----示例服务" autoFocus />
      </label>
      <div className={`import-summary ${parsed.error ? 'has-error' : ''}`}>
        <KeyRound size={18} /><div><strong>{parsed.error || `已识别 ${parsed.rows.length} 个 2FA 项目`}</strong><span>密钥导入后立即进入系统加密保险库。</span></div>
      </div>
      <footer className="modal-actions">
        <button className="button secondary" type="button" onClick={onClose}>取消</button>
        <button className="button primary" type="button" disabled={busy || !parsed.rows.length || Boolean(parsed.error)} onClick={() => onImport(parsed.rows)}>{busy ? '正在导入…' : `导入 ${parsed.rows.length || ''} 个项目`}</button>
      </footer>
    </Modal>
  );
}
