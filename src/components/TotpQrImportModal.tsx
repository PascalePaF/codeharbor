import { ImageUp, KeyRound, QrCode, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { parseAuthenticatorQrPayload, type AuthenticatorQrResult } from '../lib/authenticator-qr';
import { decodeQrPixels } from '../lib/qr-image';
import type { TotpInput } from '../shared/contracts';
import { Modal } from './Modal';

interface TotpQrImportModalProps {
  busy: boolean;
  onClose: () => void;
  onImport: (inputs: TotpInput[]) => Promise<void>;
}

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 3_000;

async function decodeQrImage(file: File): Promise<string> {
  const allowedType = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/bmp'].includes(file.type.toLowerCase());
  const allowedExtension = /\.(?:png|jpe?g|webp|bmp)$/i.test(file.name);
  if (!allowedType && !allowedExtension) {
    throw new Error('请选择 PNG、JPG、WEBP 或 BMP 二维码图片');
  }
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    throw new Error('二维码图片为空或超过 20 MiB 安全限制');
  }
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width > 20_000 || bitmap.height > 20_000) {
      throw new Error('二维码图片尺寸无效或过大');
    }
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('当前系统无法读取二维码图片');
    context.drawImage(bitmap, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    return decodeQrPixels(image.data, width, height);
  } finally {
    bitmap.close();
  }
}

export function TotpQrImportModal({ busy, onClose, onImport }: TotpQrImportModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<AuthenticatorQrResult>();
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);

  const selectImage = async (file?: File) => {
    if (!file) return;
    setReading(true);
    setError('');
    setResult(undefined);
    setFileName(file.name);
    try {
      setResult(parseAuthenticatorQrPayload(await decodeQrImage(file)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '二维码解析失败');
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <Modal
      title="扫描验证器二维码"
      description="选择 Google Authenticator 或其他验证器导出的二维码图片；图片与密钥只在本机处理。"
      onClose={onClose}
      wide
    >
      <div className="import-toolbar">
        <button className="button primary" type="button" onClick={() => inputRef.current?.click()} disabled={reading || busy}>
          <ImageUp size={17} /> {reading ? '正在识别…' : '上传二维码图片'}
        </button>
        <span className="qr-file-name">{fileName || '支持 PNG / JPG / WEBP / BMP，最大 20 MiB'}</span>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp,image/bmp,.png,.jpg,.jpeg,.webp,.bmp"
          onChange={(event) => void selectImage(event.target.files?.[0])}
        />
      </div>

      <div className="qr-local-note">
        <ShieldCheck size={18} />
        <div><strong>本地离线识别</strong><span>不会上传图片，不显示或记录二维码中的 2FA 密钥。</span></div>
      </div>

      {error && (
        <div className="import-summary has-error">
          <QrCode size={18} /><div><strong>{error}</strong><span>请确认这是验证器导出的原始二维码，而不是登录二维码。</span></div>
        </div>
      )}

      {result && (
        <>
          <div className="import-summary">
            <KeyRound size={18} />
            <div>
              <strong>已识别 {result.entries.length} 个 TOTP 项目</strong>
              <span>{result.format === 'google-authenticator' ? 'Google Authenticator 批量迁移格式' : '标准 otpauth TOTP 格式'}</span>
            </div>
          </div>
          <div className="qr-import-preview">
            {result.entries.slice(0, 12).map((entry, index) => (
              <div key={`${entry.issuer ?? ''}:${entry.label}:${index}`}>
                <span>{entry.label || '二维码中的账户'}</span>
                <small>{entry.issuer || '未设置服务商'} · {entry.digits ?? 6} 位 · {entry.algorithm ?? 'SHA1'}</small>
              </div>
            ))}
            {result.entries.length > 12 && <p>另有 {result.entries.length - 12} 个项目将在确认后一起导入。</p>}
          </div>
          {result.warnings.map((warning) => <div className="qr-warning" key={warning}>{warning}</div>)}
        </>
      )}

      <footer className="modal-actions">
        <button className="button secondary" type="button" onClick={onClose}>取消</button>
        <button
          className="button primary"
          type="button"
          disabled={busy || reading || !result?.entries.length}
          onClick={() => result && onImport(result.entries)}
        >
          {busy ? '正在安全导入…' : result ? `确认导入 ${result.entries.length} 个项目` : '等待识别'}
        </button>
      </footer>
    </Modal>
  );
}
