import type { TotpAlgorithm, TotpInput } from '../shared/contracts';

const MAX_QR_PAYLOAD_LENGTH = 256 * 1024;
const MAX_PROTO_FIELD_LENGTH = 128 * 1024;
const MAX_TOTP_ENTRIES = 500;
const decoder = new TextDecoder('utf-8', { fatal: true });

export interface AuthenticatorQrResult {
  entries: TotpInput[];
  format: 'otpauth' | 'google-authenticator';
  warnings: string[];
  batchIndex?: number;
  batchSize?: number;
}

class ProtoReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get done(): boolean {
    return this.offset >= this.bytes.length;
  }

  readVarint(): number {
    let result = 0;
    let shift = 0;
    for (let count = 0; count < 10; count += 1) {
      if (this.offset >= this.bytes.length) throw new Error('二维码中的验证器数据不完整');
      const byte = this.bytes[this.offset++];
      if (shift >= 53 && (byte & 0x7f) !== 0) throw new Error('二维码中的数值超出安全范围');
      if (shift < 53) result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) {
        if (!Number.isSafeInteger(result)) throw new Error('二维码中的数值超出安全范围');
        return result;
      }
      shift += 7;
    }
    throw new Error('二维码中的验证器数据无效');
  }

  readBytes(): Uint8Array {
    const length = this.readVarint();
    if (length < 0 || length > MAX_PROTO_FIELD_LENGTH || this.offset + length > this.bytes.length) {
      throw new Error('二维码中的验证器字段过大或不完整');
    }
    const value = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  skip(wireType: number): void {
    if (wireType === 0) {
      this.readVarint();
      return;
    }
    if (wireType === 1) {
      this.advance(8);
      return;
    }
    if (wireType === 2) {
      this.readBytes();
      return;
    }
    if (wireType === 5) {
      this.advance(4);
      return;
    }
    throw new Error('二维码包含不支持的验证器字段');
  }

  private advance(length: number): void {
    if (this.offset + length > this.bytes.length) throw new Error('二维码中的验证器数据不完整');
    this.offset += length;
  }
}

interface MigrationOtp {
  secret?: Uint8Array;
  name?: string;
  issuer?: string;
  algorithm?: number;
  digits?: number;
  type?: number;
}

function base32Encode(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let buffer = 0;
  let bits = 0;
  let result = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(buffer >>> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) result += alphabet[(buffer << (5 - bits)) & 31];
  return result;
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.trim().replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error('Google Authenticator 二维码的 Base64 数据无效');
  }
  if (!binary.length || binary.length > MAX_QR_PAYLOAD_LENGTH) {
    throw new Error('Google Authenticator 二维码为空或超过安全限制');
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeText(bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes).trim();
  } catch {
    throw new Error('二维码中的账户名称不是有效的 UTF-8 文本');
  }
}

function parseOtpParameters(bytes: Uint8Array): MigrationOtp {
  const reader = new ProtoReader(bytes);
  const result: MigrationOtp = {};
  while (!reader.done) {
    const tag = reader.readVarint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 2) result.secret = reader.readBytes();
    else if (field === 2 && wire === 2) result.name = decodeText(reader.readBytes());
    else if (field === 3 && wire === 2) result.issuer = decodeText(reader.readBytes());
    else if (field === 4 && wire === 0) result.algorithm = reader.readVarint();
    else if (field === 5 && wire === 0) result.digits = reader.readVarint();
    else if (field === 6 && wire === 0) result.type = reader.readVarint();
    else reader.skip(wire);
  }
  return result;
}

function algorithmFromMigration(value = 1): TotpAlgorithm | undefined {
  if (value === 0 || value === 1) return 'SHA1';
  if (value === 2) return 'SHA256';
  if (value === 3) return 'SHA512';
  return undefined;
}

function cleanMigrationLabel(name: string, issuer: string): string {
  const prefix = `${issuer}:`;
  return issuer && name.toLowerCase().startsWith(prefix.toLowerCase())
    ? name.slice(prefix.length).trim()
    : name;
}

function parseGoogleMigration(url: URL): AuthenticatorQrResult {
  const data = url.searchParams.get('data');
  if (!data) throw new Error('Google Authenticator 二维码缺少迁移数据');
  const reader = new ProtoReader(decodeBase64Url(data));
  const rawEntries: MigrationOtp[] = [];
  let batchSize = 1;
  let batchIndex = 0;

  while (!reader.done) {
    const tag = reader.readVarint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 2) rawEntries.push(parseOtpParameters(reader.readBytes()));
    else if (field === 3 && wire === 0) batchSize = reader.readVarint();
    else if (field === 4 && wire === 0) batchIndex = reader.readVarint();
    else reader.skip(wire);
    if (rawEntries.length > MAX_TOTP_ENTRIES) throw new Error('二维码中的 2FA 项目超过 500 项限制');
  }

  const warnings: string[] = [];
  const entries: TotpInput[] = [];
  let ignoredHotp = 0;
  let ignoredAlgorithm = 0;
  for (const [index, item] of rawEntries.entries()) {
    if (item.type === 1) {
      ignoredHotp += 1;
      continue;
    }
    const algorithm = algorithmFromMigration(item.algorithm);
    if (!algorithm) {
      ignoredAlgorithm += 1;
      continue;
    }
    if (!item.secret?.length) continue;
    const issuer = (item.issuer ?? '').slice(0, 100);
    const name = cleanMigrationLabel((item.name ?? '').slice(0, 100), issuer);
    entries.push({
      label: name || issuer || `验证器项目 ${index + 1}`,
      issuer,
      secret: base32Encode(item.secret),
      digits: item.digits === 2 ? 8 : 6,
      period: 30,
      algorithm,
    });
  }
  if (ignoredHotp) warnings.push(`已忽略 ${ignoredHotp} 个 HOTP 项目；当前版本只支持 TOTP。`);
  if (ignoredAlgorithm) warnings.push(`已忽略 ${ignoredAlgorithm} 个使用不支持算法的项目。`);
  if (batchSize > 1) warnings.push(`这是第 ${batchIndex + 1}/${batchSize} 张迁移二维码，请逐张重复导入。`);
  if (!entries.length) throw new Error('二维码中没有可导入的 TOTP 项目');
  return { entries, format: 'google-authenticator', warnings, batchIndex, batchSize };
}

function parseStandardTotp(url: URL, source: string): AuthenticatorQrResult {
  let rawLabel: string;
  try {
    rawLabel = decodeURIComponent(url.pathname.replace(/^\//, '')).trim();
  } catch {
    throw new Error('otpauth 二维码中的账户名称编码无效');
  }
  const parts = rawLabel.split(':');
  const issuerFromLabel = parts.length > 1 ? parts.shift()?.trim() ?? '' : '';
  const label = parts.join(':').trim() || rawLabel;
  const issuer = (url.searchParams.get('issuer')?.trim() || issuerFromLabel).slice(0, 100);
  const normalizedSecret = (url.searchParams.get('secret') ?? '').toUpperCase().replace(/[\s=-]/g, '');
  if (!normalizedSecret || /[^A-Z2-7]/.test(normalizedSecret)) {
    throw new Error('otpauth 二维码没有有效的 Base32 密钥');
  }
  const digits = Number(url.searchParams.get('digits') ?? 6);
  const period = Number(url.searchParams.get('period') ?? 30);
  const algorithm = (url.searchParams.get('algorithm') ?? 'SHA1').toUpperCase();
  if (digits !== 6 && digits !== 8) throw new Error('二维码中的 TOTP 位数仅支持 6 或 8 位');
  if (!Number.isInteger(period) || period < 15 || period > 120) {
    throw new Error('二维码中的 TOTP 周期必须在 15–120 秒之间');
  }
  if (!['SHA1', 'SHA256', 'SHA512'].includes(algorithm)) {
    throw new Error('二维码使用了当前不支持的 TOTP 算法');
  }
  return {
    entries: [{
      label: (label || issuer || '二维码中的账户').slice(0, 100),
      issuer,
      secret: source,
      digits,
      period,
      algorithm: algorithm as TotpAlgorithm,
    }],
    format: 'otpauth',
    warnings: [],
  };
}

export function parseAuthenticatorQrPayload(payload: string): AuthenticatorQrResult {
  const value = payload.trim();
  if (!value || value.length > MAX_QR_PAYLOAD_LENGTH) {
    throw new Error('二维码内容为空或超过 256 KiB 安全限制');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('该图片不是受支持的验证器二维码');
  }
  if (url.protocol === 'otpauth:' && url.hostname.toLowerCase() === 'totp') {
    return parseStandardTotp(url, value);
  }
  if (url.protocol === 'otpauth-migration:' && url.hostname.toLowerCase() === 'offline') {
    return parseGoogleMigration(url);
  }
  throw new Error('仅支持 TOTP otpauth 或 Google Authenticator 导出二维码');
}
