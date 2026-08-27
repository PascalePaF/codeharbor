import { Check, Clipboard, Download, FileUp, KeyRound, Pencil, Plus, QrCode, RefreshCcw, Timer, Trash2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PublicTotpEntry, TotpCode } from '../shared/contracts';

interface TotpPageProps {
  entries: PublicTotpEntry[];
  codes: TotpCode[];
  search: string;
  onAdd: () => void;
  onBulk: () => void;
  onQrImport: () => void;
  onSecureImport: () => void;
  onSecureExport: () => void;
  onEdit: (entry: PublicTotpEntry) => void;
  onDelete: (entry: PublicTotpEntry) => Promise<void>;
  onCopy: (value: string) => Promise<boolean>;
}

export function TotpPage({ entries, codes, search, onAdd, onBulk, onQrImport, onSecureImport, onSecureExport, onEdit, onDelete, onCopy }: TotpPageProps) {
  const [copied, setCopied] = useState('');
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return codes.filter((entry) => !query || [entry.label, entry.issuer].some((value) => value.toLowerCase().includes(query)));
  }, [codes, search]);

  const copy = async (entry: TotpCode) => {
    if (!await onCopy(entry.code)) return;
    setCopied(entry.id);
    window.setTimeout(() => setCopied(''), 1400);
  };

  return (
    <div className="page-stack">
      <section className="page-intro totp-intro">
        <div><span className="eyebrow green">TIME-BASED AUTH</span><h2>2FA 动态验证码</h2><p>基于本机时间离线计算；添加后无需网络，也不会把密钥发往外部。</p></div>
        <div className="button-row page-actions">
          <button className="button secondary" type="button" onClick={onQrImport}><QrCode size={17} /> 二维码图片导入</button>
          <button className="button secondary" type="button" onClick={onBulk}><FileUp size={17} /> CSV 批量导入</button>
          <button className="button secondary" type="button" onClick={onSecureImport}><Upload size={17} /> 加密导入</button>
          <button className="button secondary" type="button" onClick={onSecureExport} disabled={!entries.length}><Download size={17} /> 加密导出</button>
          <button className="button primary" type="button" onClick={onAdd}><Plus size={17} /> 添加 2FA</button>
        </div>
      </section>

      <div className="sync-note"><RefreshCcw size={16} /><span><strong>时间同步很重要</strong> · 若动态码无效，请先确认 Windows 时间已自动同步。</span></div>

      {!entries.length ? (
        <section className="content-panel"><div className="empty-state tall"><div className="empty-icon"><KeyRound size={30} /></div><h3>还没有 2FA 项目</h3><p>输入 Base32 密钥或 otpauth:// 链接，即可离线生成动态码。</p><button className="button primary" type="button" onClick={onAdd}>添加第一个 2FA</button></div></section>
      ) : !filtered.length ? (
        <section className="content-panel"><div className="empty-state compact"><h3>没有匹配的 2FA 项目</h3><p>换一个关键词试试。</p></div></section>
      ) : (
        <section className="totp-grid">
          {filtered.map((entry) => {
            const progress = Math.max(0, Math.min(100, (entry.secondsRemaining / entry.period) * 100));
            return (
              <article className={`totp-card ${entry.secondsRemaining <= 5 ? 'expiring' : ''}`} key={entry.id}>
                <header><div className="totp-avatar">{(entry.issuer || entry.label).slice(0, 1).toUpperCase()}</div><div><strong>{entry.label}</strong><span>{entry.issuer || '未设置发行方'}</span></div><div className="totp-card-actions"><button type="button" onClick={() => onEdit(entry)} aria-label="编辑"><Pencil size={15} /></button><button type="button" onClick={() => void onDelete(entry)} aria-label="删除"><Trash2 size={15} /></button></div></header>
                <button className="totp-code" type="button" onClick={() => void copy(entry)} title="点击复制动态码"><span>{entry.code.slice(0, entry.code.length / 2)}</span><i /><span>{entry.code.slice(entry.code.length / 2)}</span>{copied === entry.id ? <Check size={18} /> : <Clipboard size={18} />}</button>
                <footer><div className="time-ring" style={{ '--progress': `${progress}%` } as React.CSSProperties}><span>{entry.secondsRemaining}</span></div><span><Timer size={14} /> {entry.period} 秒 · {entry.digits} 位 · {entry.algorithm}</span></footer>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
