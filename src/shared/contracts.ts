export type ProviderId =
  | '163'
  | '126'
  | 'qq'
  | 'gmail'
  | 'aliyun'
  | 'aliyun-enterprise'
  | 'outlook'
  | 'mailcom'
  | 'custom';

export type AuthMode = 'password' | 'oauth2';
export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

export interface ProviderPreset {
  id: ProviderId;
  name: string;
  shortName: string;
  host: string;
  port: number;
  secure: boolean;
  domains: string[];
  credentialLabel: string;
  credentialHint: string;
  help: string;
  authModes: AuthMode[];
  defaultAuthMode: AuthMode;
  setupSteps: string[];
  helpUrl?: string;
  accent: string;
}

export interface AccountStatus {
  state: 'idle' | 'checking' | 'ok' | 'error';
  message: string;
  checkedAt?: string;
}

export interface MailAccountInput {
  id?: string;
  label: string;
  email: string;
  provider: ProviderId;
  username?: string;
  credential?: string;
  authMode: AuthMode;
  imapHost?: string;
  imapPort?: number;
  secure?: boolean;
  enabled?: boolean;
}

export interface PublicMailAccount {
  id: string;
  label: string;
  email: string;
  provider: ProviderId;
  username: string;
  authMode: AuthMode;
  imapHost: string;
  imapPort: number;
  secure: boolean;
  enabled: boolean;
  hasCredential: boolean;
  createdAt: string;
  updatedAt: string;
  status: AccountStatus;
}

export interface AccountScanStatus {
  accountId: string;
  state: 'ok' | 'error' | 'skipped';
  message: string;
  checkedAt: string;
  messageCount: number;
}

export interface VerificationMessage {
  id: string;
  accountId: string;
  accountLabel: string;
  accountEmail: string;
  provider: ProviderId;
  subject: string;
  sender: string;
  receivedAt: string;
  codes: string[];
  preview: string;
}

export interface ScanResult {
  statuses: AccountScanStatus[];
  messages: VerificationMessage[];
  scannedAt: string;
}

export interface TotpInput {
  id?: string;
  label: string;
  issuer?: string;
  secret: string;
  digits?: 6 | 8;
  period?: number;
  algorithm?: TotpAlgorithm;
}

export interface PublicTotpEntry {
  id: string;
  label: string;
  issuer: string;
  digits: 6 | 8;
  period: number;
  algorithm: TotpAlgorithm;
  createdAt: string;
  updatedAt: string;
}

export interface TotpCode extends PublicTotpEntry {
  code: string;
  secondsRemaining: number;
}

export interface AppSettings {
  pollIntervalMinutes: number;
  scanWindowHours: number;
  maxMessagesPerAccount: number;
  autoRefresh: boolean;
}

export interface VaultInfo {
  encryptionAvailable: boolean;
  backend: string;
  storagePath: string;
}

export interface BulkSaveResult {
  created: number;
  updated: number;
  failed: Array<{ row: number; identifier: string; error: string }>;
}

export interface BackupExportResult {
  canceled: boolean;
  fileName?: string;
  accountCount: number;
  totpCount: number;
}

export interface BackupImportResult {
  canceled: boolean;
  fileName?: string;
  accountsCreated: number;
  accountsUpdated: number;
  totpCreated: number;
  totpUpdated: number;
}

export interface AppBootstrap {
  version: string;
  accounts: PublicMailAccount[];
  totpEntries: PublicTotpEntry[];
  settings: AppSettings;
  providers: ProviderPreset[];
  vault: VaultInfo;
}

export interface CodeHarborBridge {
  bootstrap(): Promise<AppBootstrap>;
  accounts: {
    save(input: MailAccountInput): Promise<PublicMailAccount>;
    bulkSave(inputs: MailAccountInput[]): Promise<BulkSaveResult>;
    remove(id: string): Promise<void>;
    setEnabled(id: string, enabled: boolean): Promise<PublicMailAccount>;
    test(id: string): Promise<AccountScanStatus>;
  };
  mail: {
    scan(accountIds?: string[]): Promise<ScanResult>;
  };
  totp: {
    save(input: TotpInput): Promise<PublicTotpEntry>;
    bulkSave(inputs: TotpInput[]): Promise<BulkSaveResult>;
    remove(id: string): Promise<void>;
    codes(): Promise<TotpCode[]>;
  };
  settings: {
    update(input: Partial<AppSettings>): Promise<AppSettings>;
  };
  backup: {
    exportAll(password: string): Promise<BackupExportResult>;
    importAll(password: string): Promise<BackupImportResult>;
  };
  system: {
    copy(text: string): Promise<void>;
    openExternal(url: string): Promise<void>;
  };
}
