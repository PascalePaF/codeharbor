import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
} from 'node:crypto';
import type {
  AppSettings,
  AuthMode,
  ProviderId,
  TotpAlgorithm,
} from '../../src/shared/contracts';

const BACKUP_AAD = Buffer.from('CodeHarbor encrypted backup v1', 'utf8');
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const MAX_BACKUP_ITEMS = 500;

export interface PortableMailAccount {
  id: string;
  label: string;
  email: string;
  provider: ProviderId;
  username: string;
  credential: string;
  authMode: AuthMode;
  imapHost: string;
  imapPort: number;
  secure: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PortableTotpEntry {
  id: string;
  label: string;
  issuer: string;
  secret: string;
  digits: 6 | 8;
  period: number;
  algorithm: TotpAlgorithm;
  createdAt: string;
  updatedAt: string;
}

export interface PortableVaultBackup {
  format: 'codeharbor-portable-vault';
  schemaVersion: 1;
  appVersion: string;
  exportedAt: string;
  accounts: PortableMailAccount[];
  totpEntries: PortableTotpEntry[];
  settings: AppSettings;
}

interface BackupEnvelope {
  format: 'codeharbor-encrypted-backup';
  version: 1;
  kdf: {
    name: 'scrypt';
    salt: string;
    n: number;
    r: number;
    p: number;
  };
  cipher: {
    name: 'aes-256-gcm';
    iv: string;
    tag: string;
  };
  ciphertext: string;
}

export function validateBackupPassword(password: string): void {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('备份密码至少需要 8 个字符');
  }
  if (password.length > 128) throw new Error('备份密码不能超过 128 个字符');
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      32,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validatePortablePayload(value: unknown): PortableVaultBackup {
  if (!isRecord(value) || value.format !== 'codeharbor-portable-vault' || value.schemaVersion !== 1) {
    throw new Error('备份内容格式不受支持');
  }
  if (!Array.isArray(value.accounts) || !Array.isArray(value.totpEntries) || !isRecord(value.settings)) {
    throw new Error('备份内容不完整');
  }
  if (value.accounts.length > MAX_BACKUP_ITEMS || value.totpEntries.length > MAX_BACKUP_ITEMS) {
    throw new Error('备份项目数量超过 500 项限制');
  }
  return value as unknown as PortableVaultBackup;
}

export async function encryptPortableBackup(
  payload: PortableVaultBackup,
  password: string,
): Promise<Buffer> {
  validateBackupPassword(password);
  validatePortablePayload(payload);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(BACKUP_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const envelope: BackupEnvelope = {
    format: 'codeharbor-encrypted-backup',
    version: 1,
    kdf: {
      name: 'scrypt',
      salt: salt.toString('base64'),
      n: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    },
    cipher: {
      name: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    },
    ciphertext: ciphertext.toString('base64'),
  };
  return Buffer.from(`${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
}

export async function decryptPortableBackup(
  serialized: Buffer | string,
  password: string,
): Promise<PortableVaultBackup> {
  validateBackupPassword(password);
  let envelope: BackupEnvelope;
  try {
    envelope = JSON.parse(Buffer.isBuffer(serialized) ? serialized.toString('utf8') : serialized) as BackupEnvelope;
  } catch {
    throw new Error('这不是有效的 CodeHarbor 备份文件');
  }
  if (
    envelope?.format !== 'codeharbor-encrypted-backup' ||
    envelope.version !== 1 ||
    envelope.kdf?.name !== 'scrypt' ||
    envelope.kdf.n !== SCRYPT_N ||
    envelope.kdf.r !== SCRYPT_R ||
    envelope.kdf.p !== SCRYPT_P ||
    envelope.cipher?.name !== 'aes-256-gcm'
  ) {
    throw new Error('备份文件版本或加密参数不受支持');
  }

  try {
    const salt = Buffer.from(envelope.kdf.salt, 'base64');
    const iv = Buffer.from(envelope.cipher.iv, 'base64');
    const tag = Buffer.from(envelope.cipher.tag, 'base64');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16 || !ciphertext.length) {
      throw new Error('invalid envelope');
    }
    const key = await deriveKey(password, salt);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(BACKUP_AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return validatePortablePayload(JSON.parse(plaintext.toString('utf8')));
  } catch (error) {
    if (error instanceof Error && /备份内容/.test(error.message)) throw error;
    throw new Error('备份密码不正确，或备份文件已经损坏');
  }
}
