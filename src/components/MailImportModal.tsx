import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { MAILBOX_SAMPLE, parseMailboxImport } from '../lib/importers';
import type { MailAccountInput, ProviderPreset } from '../shared/contracts';
import { Modal } from './Modal';

interface MailImportModalProps {
  providers: ProviderPreset[];
  busy: boolean;
  onClose: () => void;
  onImport: (inputs: MailAccountInput[]) => Promise<void>;
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function MailImportModal({ providers, busy, onClose, onImport }: MailImportModalProps) {
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => {
    try {
      return { rows: parseMailboxImport(text, providers), error: '' };
    } catch (error) {
      return { rows: [], error: error instanceof Error ? error.message : '无法解析导入内容' };
    }
  }, [text, providers]);

  const readFile = async (file?: File) => {
    if (!file) return;
    setText(await file.text());
  };

  return (
    <Modal title="批量导入邮箱" description="支持 CSV、TXT、JSON，最多一次导入 500 个账户。" onClose={onClose} wide>
      <div className="import-toolbar">
        <button className="button secondary" type="button" onClick={() => fileRef.current?.click()}><Upload size={16} /> 选择文件</button>
        <button className="button ghost" type="button" onClick={() => downloadText('codeharbor-mailbox-sample.csv', MAILBOX_SAMPLE)}><Download size={16} /> 下载模板</button>
        <input ref={fileRef} hidden type="file" accept=".csv,.txt,.json,text/csv,text/plain,application/json" onChange={(event) => void readFile(event.target.files?.[0])} />
      </div>
      <label className="import-area">
        <span>粘贴 CSV，或每行使用 <code>邮箱----授权码</code></span>
        <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={'demo@163.com----客户端授权码\ndemo@qq.com----IMAP 授权码'} autoFocus />
      </label>
      <div className={`import-summary ${parsed.error ? 'has-error' : ''}`}>
        <FileSpreadsheet size={18} />
        <div>
          <strong>{parsed.error || `已识别 ${parsed.rows.length} 个邮箱账户`}</strong>
          <span>{parsed.error ? '请检查 CSV 表头或分隔符。' : '会按“邮箱 + 服务商”更新重复账户。'}</span>
        </div>
      </div>
      {parsed.rows.length > 0 && (
        <div className="import-preview">
          {parsed.rows.slice(0, 5).map((row, index) => (
            <div key={`${row.email}-${index}`}><span>{row.email || '缺少邮箱'}</span><em>{providers.find((item) => item.id === row.provider)?.shortName}</em></div>
          ))}
          {parsed.rows.length > 5 && <small>还有 {parsed.rows.length - 5} 项未显示</small>}
        </div>
      )}
      <footer className="modal-actions">
        <button className="button secondary" type="button" onClick={onClose}>取消</button>
        <button className="button primary" type="button" disabled={busy || !parsed.rows.length || Boolean(parsed.error)} onClick={() => onImport(parsed.rows)}>{busy ? '正在导入…' : `导入 ${parsed.rows.length || ''} 个账户`}</button>
      </footer>
    </Modal>
  );
}
