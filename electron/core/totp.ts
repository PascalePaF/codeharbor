import { createHmac } from 'node:crypto';
import type { TotpAlgorithm } from '../../src/shared/contracts';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export interface ParsedTotpSecret {
  secret: string;
  label?: string;
  issuer?: string;
  digits?: 6 | 8;
  period?: number;
  algorithm?: TotpAlgorithm;
}

export function normalizeBase32(input: string): string {
  return input.toUpperCase().replace(/[\s=-]/g, '');
}

export function decodeBase32(input: string): Buffer {
  const normalized = normalizeBase32(input);
  if (!normalized || /[^A-Z2-7]/.test(normalized)) {
    throw new Error('2FA 密钥不是有效的 Base32 格式');
  }

  let bits = '';
  for (const character of normalized) {
    bits += BASE32_ALPHABET.indexOf(character).toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

export function parseTotpInput(input: string): ParsedTotpSecret {
  const trimmed = input.trim();
  if (!trimmed.toLowerCase().startsWith('otpauth://')) {
    return { secret: normalizeBase32(trimmed) };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('otpauth 链接格式不正确');
  }
  if (url.protocol !== 'otpauth:' || url.hostname.toLowerCase() !== 'totp') {
    throw new Error('仅支持 TOTP 类型的 otpauth 链接');
  }

  const rawLabel = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const labelParts = rawLabel.split(':');
  const issuerFromLabel = labelParts.length > 1 ? labelParts.shift()?.trim() : undefined;
  const label = labelParts.join(':').trim() || rawLabel;
  const secret = normalizeBase32(url.searchParams.get('secret') ?? '');
  const issuer = url.searchParams.get('issuer')?.trim() || issuerFromLabel;
  const digitsValue = Number(url.searchParams.get('digits') ?? 6);
  const periodValue = Number(url.searchParams.get('period') ?? 30);
  const algorithmValue = (url.searchParams.get('algorithm') ?? 'SHA1').toUpperCase();

  if (![6, 8].includes(digitsValue)) throw new Error('TOTP 位数仅支持 6 或 8 位');
  if (!Number.isInteger(periodValue) || periodValue < 15 || periodValue > 120) {
    throw new Error('TOTP 周期必须在 15–120 秒之间');
  }
  if (!['SHA1', 'SHA256', 'SHA512'].includes(algorithmValue)) {
    throw new Error('不支持该 TOTP 算法');
  }

  decodeBase32(secret);
  return {
    secret,
    label,
    issuer,
    digits: digitsValue as 6 | 8,
    period: periodValue,
    algorithm: algorithmValue as TotpAlgorithm,
  };
}

export function generateTotp(
  secret: string,
  options: {
    timestamp?: number;
    digits?: 6 | 8;
    period?: number;
    algorithm?: TotpAlgorithm;
  } = {},
): { code: string; secondsRemaining: number } {
  const timestamp = options.timestamp ?? Date.now();
  const digits = options.digits ?? 6;
  const period = options.period ?? 30;
  const algorithm = options.algorithm ?? 'SHA1';
  const counter = Math.floor(timestamp / 1000 / period);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac(algorithm.toLowerCase(), decodeBase32(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  const code = String(binary % 10 ** digits).padStart(digits, '0');
  const elapsed = Math.floor(timestamp / 1000) % period;
  return { code, secondsRemaining: period - elapsed };
}
