import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { safeStorage } from 'electron';
import type {
  AccountStatus,
  AppSettings,
  BulkSaveResult,
  MailAccountInput,
  PublicMailAccount,
  PublicTotpEntry,
  TotpCode,
  TotpInput,
  VaultInfo,
} from '../../src/shared/contracts';
import type {
  PortableMailAccount,
  PortableTotpEntry,
  PortableVaultBackup,
} from '../core/backup';
import { decodeBase32, generateTotp, normalizeBase32, parseTotpInput } from '../core/totp';
import { getProvider, resolveImapSettings } from '../core/providers';

interface StoredMailAccount extends Omit<PublicMailAccount, 'hasCredential' | 'status'> {
  credentialCiphertext: string;
}

interface StoredTotpEntry extends PublicTotpEntry {
  secretCiphertext: string;
}

interface VaultPayload {
  schemaVersion: 1;
  accounts: StoredMailAccount[];
  totpEntries: StoredTotpEntry[];
  settings: AppSettings;
}

interface DecryptedMailAccount extends Omit<StoredMailAccount, 'credentialCiphertext'> {
  credential: string;
}

export interface PortableImportSummary {
  accountsCreated: number;
  accountsUpdated: number;
  totpCreated: number;
  totpUpdated: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  pollIntervalMinutes: 2,
  scanWindowHours: 24,
  maxMessagesPerAccount: 30,
  autoRefresh: false,
};

const DEFAULT_VAULT: VaultPayload = {
  schemaVersion: 1,
  accounts: [],
  totpEntries: [],
  settings: DEFAULT_SETTINGS,
};

function idleStatus(): AccountStatus {
  return { state: 'idle', message: '等待检查' };
}

function cleanText(value: string | undefined, maxLength: number): string {
  return (value ?? '').trim().slice(0, maxLength);
}

function validateEmail(value: string): string {
  const email = cleanText(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('请输入有效的邮箱地址');
  }
  return email;
}

function toPublicAccount(account: StoredMailAccount, status: AccountStatus): PublicMailAccount {
  const { credentialCiphertext: _credentialCiphertext, ...publicFields } = account;
  return {
    ...publicFields,
    hasCredential: Boolean(account.credentialCiphertext),
    status,
  };
}

function toPublicTotp(entry: StoredTotpEntry): PublicTotpEntry {
  const { secretCiphertext: _secretCiphertext, ...publicFields } = entry;
  return publicFields;
}

export class VaultStore {
  private payload: VaultPayload = structuredClone(DEFAULT_VAULT);
  private readonly statuses = new Map<string, AccountStatus>();
  private writeQueue: Promise<void> = Promise.resolve();
  private loaded = false;

  constructor(private readonly storagePath: string) {}

  async initialize(): Promise<void> {
    if (this.loaded) return;
    await mkdir(dirname(this.storagePath), { recursive: true });
    try {
      const serialized = await readFile(this.storagePath, 'utf8');
      const parsed = JSON.parse(serialized) as Partial<VaultPayload>;
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.accounts) || !Array.isArray(parsed.totpEntries)) {
        throw new Error('保险库格式无法识别');
      }
      this.payload = {
        schemaVersion: 1,
        accounts: parsed.accounts,
        totpEntries: parsed.totpEntries,
        settings: this.normalizeSettings(parsed.settings ?? {}),
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw new Error(`无法读取本地保险库，请先备份文件后处理：${this.storagePath}`);
      }
      this.payload = structuredClone(DEFAULT_VAULT);
      await this.persist();
    }
    this.loaded = true;
  }

  getSettings(): AppSettings {
    return { ...this.payload.settings };
  }

  async updateSettings(input: Partial<AppSettings>): Promise<AppSettings> {
    const next = this.normalizeSettings(input, this.payload.settings);
    this.payload.settings = next;
    await this.persist();
    return this.getSettings();
  }

  private normalizeSettings(input: Partial<AppSettings>, base = DEFAULT_SETTINGS): AppSettings {
    const next = { ...base };
    if (typeof input.pollIntervalMinutes === 'number' && Number.isFinite(input.pollIntervalMinutes)) {
      next.pollIntervalMinutes = Math.min(60, Math.max(1, Math.round(input.pollIntervalMinutes)));
    }
    if (typeof input.scanWindowHours === 'number' && Number.isFinite(input.scanWindowHours)) {
      next.scanWindowHours = Math.min(168, Math.max(1, Math.round(input.scanWindowHours)));
    }
    if (typeof input.maxMessagesPerAccount === 'number' && Number.isFinite(input.maxMessagesPerAccount)) {
      next.maxMessagesPerAccount = Math.min(100, Math.max(5, Math.round(input.maxMessagesPerAccount)));
    }
    if (input.autoRefresh !== undefined) next.autoRefresh = Boolean(input.autoRefresh);
    return next;
  }

  listAccounts(): PublicMailAccount[] {
    return this.payload.accounts
      .map((account) => toPublicAccount(account, this.statuses.get(account.id) ?? idleStatus()))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
  }

  async saveAccount(input: MailAccountInput): Promise<PublicMailAccount> {
    const existingIndex = this.payload.accounts.findIndex(
      (account) =>
        account.id === input.id ||
        (account.email.toLowerCase() === input.email.trim().toLowerCase() && account.provider === input.provider),
    );
    const existing = existingIndex >= 0 ? this.payload.accounts[existingIndex] : undefined;
    const stored = await this.buildStoredAccount(input, existing);

    if (existingIndex >= 0) this.payload.accounts[existingIndex] = stored;
    else this.payload.accounts.push(stored);
    await this.persist();
    this.statuses.set(stored.id, idleStatus());
    return toPublicAccount(stored, idleStatus());
  }

  async bulkSaveAccounts(inputs: MailAccountInput[]): Promise<BulkSaveResult> {
    if (inputs.length > 500) throw new Error('单次最多导入 500 个邮箱账户');
    const result: BulkSaveResult = { created: 0, updated: 0, failed: [] };
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      const wasExisting = this.payload.accounts.some(
        (account) =>
          account.id === input.id ||
          (account.email.toLowerCase() === input.email.trim().toLowerCase() &&
            account.provider === input.provider),
      );
      try {
        await this.saveAccount(input);
        if (wasExisting) result.updated += 1;
        else result.created += 1;
      } catch (error) {
        result.failed.push({
          row: index + 1,
          identifier: input.email || input.label || `第 ${index + 1} 行`,
          error: error instanceof Error ? error.message : '导入失败',
        });
      }
    }
    return result;
  }

  async removeAccount(id: string): Promise<void> {
    const next = this.payload.accounts.filter((account) => account.id !== id);
    if (next.length === this.payload.accounts.length) throw new Error('邮箱账户不存在');
    this.payload.accounts = next;
    this.statuses.delete(id);
    await this.persist();
  }

  async setAccountEnabled(id: string, enabled: boolean): Promise<PublicMailAccount> {
    const account = this.payload.accounts.find((item) => item.id === id);
    if (!account) throw new Error('邮箱账户不存在');
    account.enabled = Boolean(enabled);
    account.updatedAt = new Date().toISOString();
    await this.persist();
    return toPublicAccount(account, this.statuses.get(id) ?? idleStatus());
  }

  setAccountStatus(id: string, status: AccountStatus): void {
    if (this.payload.accounts.some((account) => account.id === id)) {
      this.statuses.set(id, status);
    }
  }

  async getDecryptedAccount(id: string): Promise<DecryptedMailAccount> {
    const account = this.payload.accounts.find((item) => item.id === id);
    if (!account) throw new Error('邮箱账户不存在');
    const { credentialCiphertext, ...fields } = account;
    return { ...fields, credential: await this.decrypt(credentialCiphertext) };
  }

  getEnabledAccountIds(): string[] {
    return this.payload.accounts.filter((account) => account.enabled).map((account) => account.id);
  }

  listTotpEntries(): PublicTotpEntry[] {
    return this.payload.totpEntries
      .map(toPublicTotp)
      .sort((a, b) => `${a.issuer}${a.label}`.localeCompare(`${b.issuer}${b.label}`, 'zh-CN'));
  }

  async saveTotp(input: TotpInput): Promise<PublicTotpEntry> {
    const existingIndex = this.payload.totpEntries.findIndex(
      (entry) =>
        entry.id === input.id ||
        (entry.label.toLowerCase() === input.label.trim().toLowerCase() &&
          entry.issuer.toLowerCase() === (input.issuer ?? '').trim().toLowerCase()),
    );
    const existing = existingIndex >= 0 ? this.payload.totpEntries[existingIndex] : undefined;
    const stored = await this.buildStoredTotp(input, existing);
    if (existingIndex >= 0) this.payload.totpEntries[existingIndex] = stored;
    else this.payload.totpEntries.push(stored);
    await this.persist();
    return toPublicTotp(stored);
  }

  async bulkSaveTotp(inputs: TotpInput[]): Promise<BulkSaveResult> {
    if (inputs.length > 500) throw new Error('单次最多导入 500 个 2FA 项目');
    const result: BulkSaveResult = { created: 0, updated: 0, failed: [] };
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      const wasExisting = this.payload.totpEntries.some(
        (entry) =>
          entry.id === input.id ||
          (entry.label.toLowerCase() === input.label.trim().toLowerCase() &&
            entry.issuer.toLowerCase() === (input.issuer ?? '').trim().toLowerCase()),
      );
      try {
        await this.saveTotp(input);
        if (wasExisting) result.updated += 1;
        else result.created += 1;
      } catch (error) {
        result.failed.push({
          row: index + 1,
          identifier: input.label || `第 ${index + 1} 行`,
          error: error instanceof Error ? error.message : '导入失败',
        });
      }
    }
    return result;
  }

  async removeTotp(id: string): Promise<void> {
    const next = this.payload.totpEntries.filter((entry) => entry.id !== id);
    if (next.length === this.payload.totpEntries.length) throw new Error('2FA 项目不存在');
    this.payload.totpEntries = next;
    await this.persist();
  }

  async generateTotpCodes(): Promise<TotpCode[]> {
    const timestamp = Date.now();
    return Promise.all(
      this.payload.totpEntries.map(async (entry) => {
        const secret = await this.decrypt(entry.secretCiphertext);
        const generated = generateTotp(secret, {
          timestamp,
          digits: entry.digits,
          period: entry.period,
          algorithm: entry.algorithm,
        });
        return { ...toPublicTotp(entry), ...generated };
      }),
    );
  }

  async exportPortableData(appVersion: string): Promise<PortableVaultBackup> {
    const accounts: PortableMailAccount[] = await Promise.all(
      this.payload.accounts.map(async (account) => {
        const { credentialCiphertext, ...fields } = account;
        return { ...fields, credential: await this.decrypt(credentialCiphertext) };
      }),
    );
    const totpEntries: PortableTotpEntry[] = await Promise.all(
      this.payload.totpEntries.map(async (entry) => {
        const { secretCiphertext, ...fields } = entry;
        return { ...fields, secret: await this.decrypt(secretCiphertext) };
      }),
    );
    return {
      format: 'codeharbor-portable-vault',
      schemaVersion: 1,
      appVersion: cleanText(appVersion, 30),
      exportedAt: new Date().toISOString(),
      accounts,
      totpEntries,
      settings: this.getSettings(),
    };
  }

  async importPortableData(backup: PortableVaultBackup): Promise<PortableImportSummary> {
    if (backup.accounts.length > 500 || backup.totpEntries.length > 500) {
      throw new Error('备份项目数量超过 500 项限制');
    }
    const next = structuredClone(this.payload);
    const summary: PortableImportSummary = {
      accountsCreated: 0,
      accountsUpdated: 0,
      totpCreated: 0,
      totpUpdated: 0,
    };

    for (const source of backup.accounts) {
      const existingIndex = next.accounts.findIndex(
        (account) =>
          account.id === source.id ||
          (account.email.toLowerCase() === String(source.email).trim().toLowerCase() &&
            account.provider === source.provider),
      );
      const existing = existingIndex >= 0 ? next.accounts[existingIndex] : undefined;
      const stored = await this.buildStoredAccount(source, existing);
      stored.createdAt = this.validTimestamp(source.createdAt) ?? stored.createdAt;
      stored.updatedAt = this.validTimestamp(source.updatedAt) ?? stored.updatedAt;
      if (existingIndex >= 0) {
        next.accounts[existingIndex] = stored;
        summary.accountsUpdated += 1;
      } else {
        next.accounts.push(stored);
        summary.accountsCreated += 1;
      }
    }

    for (const source of backup.totpEntries) {
      const existingIndex = next.totpEntries.findIndex(
        (entry) =>
          entry.id === source.id ||
          (entry.label.toLowerCase() === String(source.label).trim().toLowerCase() &&
            entry.issuer.toLowerCase() === String(source.issuer ?? '').trim().toLowerCase()),
      );
      const existing = existingIndex >= 0 ? next.totpEntries[existingIndex] : undefined;
      const stored = await this.buildStoredTotp(source, existing);
      stored.createdAt = this.validTimestamp(source.createdAt) ?? stored.createdAt;
      stored.updatedAt = this.validTimestamp(source.updatedAt) ?? stored.updatedAt;
      if (existingIndex >= 0) {
        next.totpEntries[existingIndex] = stored;
        summary.totpUpdated += 1;
      } else {
        next.totpEntries.push(stored);
        summary.totpCreated += 1;
      }
    }

    next.settings = this.normalizeSettings(backup.settings);
    const previous = this.payload;
    this.payload = next;
    try {
      await this.persist();
      this.statuses.clear();
      return summary;
    } catch (error) {
      this.payload = previous;
      throw error;
    }
  }

  async getVaultInfo(): Promise<VaultInfo> {
    const asyncAvailable =
      typeof safeStorage.isAsyncEncryptionAvailable === 'function'
        ? await safeStorage.isAsyncEncryptionAvailable()
        : safeStorage.isEncryptionAvailable();
    let backend = '系统安全存储';
    if (process.platform === 'win32') backend = 'Windows DPAPI';
    else if (process.platform === 'darwin') backend = 'macOS Keychain';
    else if (typeof safeStorage.getSelectedStorageBackend === 'function') {
      backend = safeStorage.getSelectedStorageBackend();
    }
    return { encryptionAvailable: asyncAvailable, backend, storagePath: this.storagePath };
  }

  private async buildStoredAccount(
    input: MailAccountInput,
    existing?: StoredMailAccount,
  ): Promise<StoredMailAccount> {
    const provider = getProvider(input.provider);
    if (provider.id !== input.provider) throw new Error('邮箱服务商不受支持');
    if (!provider.authModes.includes(input.authMode)) {
      throw new Error(`${provider.name} 不支持所选认证方式`);
    }
    const email = validateEmail(input.email);
    const label = cleanText(input.label, 80) || email;
    const username = cleanText(input.username, 254) || email;
    const connection = resolveImapSettings(input.provider, input.imapHost, input.imapPort, input.secure);
    if (!connection.host || !/^[a-z0-9.-]+$/i.test(connection.host)) {
      throw new Error('请输入有效的 IMAP 服务器地址');
    }
    if (!Number.isInteger(connection.port) || connection.port < 1 || connection.port > 65535) {
      throw new Error('IMAP 端口必须在 1–65535 之间');
    }
    const rawCredential = typeof input.credential === 'string' ? input.credential.trim() : '';
    const credential = input.provider === 'gmail' && input.authMode === 'password'
      ? rawCredential.replace(/\s+/g, '')
      : rawCredential;
    if (!existing && !credential) throw new Error(`请输入${provider.credentialLabel}`);
    const now = new Date().toISOString();
    return {
      id: existing?.id ?? input.id ?? randomUUID(),
      label,
      email,
      provider: input.provider,
      username,
      authMode: input.authMode,
      imapHost: connection.host,
      imapPort: connection.port,
      secure: connection.secure,
      enabled: input.enabled ?? existing?.enabled ?? true,
      credentialCiphertext: credential
        ? await this.encrypt(credential)
        : existing?.credentialCiphertext ?? '',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  }

  private async buildStoredTotp(
    input: TotpInput,
    existing?: StoredTotpEntry,
  ): Promise<StoredTotpEntry> {
    const parsed = parseTotpInput(input.secret);
    const secret = normalizeBase32(parsed.secret);
    decodeBase32(secret);
    const label = cleanText(input.label, 100) || cleanText(parsed.label, 100);
    if (!label) throw new Error('请输入 2FA 项目名称');
    const issuer = cleanText(input.issuer, 100) || cleanText(parsed.issuer, 100);
    const digits = input.digits ?? parsed.digits ?? 6;
    const period = input.period ?? parsed.period ?? 30;
    const algorithm = input.algorithm ?? parsed.algorithm ?? 'SHA1';
    if (![6, 8].includes(digits)) throw new Error('TOTP 位数仅支持 6 或 8 位');
    if (!Number.isInteger(period) || period < 15 || period > 120) {
      throw new Error('TOTP 周期必须在 15–120 秒之间');
    }
    const now = new Date().toISOString();
    return {
      id: existing?.id ?? input.id ?? randomUUID(),
      label,
      issuer,
      digits,
      period,
      algorithm,
      secretCiphertext: await this.encrypt(secret),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  }

  private validTimestamp(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  private async ensureEncryption(): Promise<void> {
    const available =
      typeof safeStorage.isAsyncEncryptionAvailable === 'function'
        ? await safeStorage.isAsyncEncryptionAvailable()
        : safeStorage.isEncryptionAvailable();
    if (!available) throw new Error('系统安全存储当前不可用，无法保存敏感信息');
    if (
      process.platform === 'linux' &&
      typeof safeStorage.getSelectedStorageBackend === 'function' &&
      safeStorage.getSelectedStorageBackend() === 'basic_text'
    ) {
      throw new Error('Linux 系统未提供安全密钥环，已拒绝以弱加密方式保存敏感信息');
    }
  }

  private async encrypt(value: string): Promise<string> {
    await this.ensureEncryption();
    if (typeof safeStorage.encryptStringAsync === 'function') {
      return (await safeStorage.encryptStringAsync(value)).toString('base64');
    }
    return safeStorage.encryptString(value).toString('base64');
  }

  private async decrypt(value: string): Promise<string> {
    await this.ensureEncryption();
    const encrypted = Buffer.from(value, 'base64');
    if (typeof safeStorage.decryptStringAsync === 'function') {
      return (await safeStorage.decryptStringAsync(encrypted)).result;
    }
    return safeStorage.decryptString(encrypted);
  }

  private async persist(): Promise<void> {
    const serialized = `${JSON.stringify(this.payload, null, 2)}\n`;
    const operation = this.writeQueue.then(() => this.writeSnapshot(serialized));
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  private async writeSnapshot(serialized: string): Promise<void> {
    const temporaryPath = `${this.storagePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, serialized, { encoding: 'utf8', mode: 0o600 });
    try {
      await rename(temporaryPath, this.storagePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST' && code !== 'EPERM') throw error;
      await copyFile(temporaryPath, this.storagePath);
      await unlink(temporaryPath);
    }
  }
}
