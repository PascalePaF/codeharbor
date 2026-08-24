import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppBootstrap,
  AppSettings,
  BulkSaveResult,
  CodeHarborBridge,
  MailAccountInput,
  PublicMailAccount,
  PublicTotpEntry,
  ScanResult,
  TotpCode,
  TotpInput,
  AccountScanStatus,
  BackupExportResult,
  BackupImportResult,
} from '../src/shared/contracts';

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args);

const bridge: CodeHarborBridge = {
  bootstrap: () => invoke<AppBootstrap>('app:bootstrap'),
  accounts: {
    save: (input: MailAccountInput) => invoke<PublicMailAccount>('accounts:save', input),
    bulkSave: (inputs: MailAccountInput[]) =>
      invoke<BulkSaveResult>('accounts:bulk-save', inputs),
    remove: (id: string) => invoke<void>('accounts:remove', id),
    setEnabled: (id: string, enabled: boolean) =>
      invoke<PublicMailAccount>('accounts:set-enabled', id, enabled),
    test: (id: string) => invoke<AccountScanStatus>('accounts:test', id),
  },
  mail: {
    scan: (accountIds?: string[]) => invoke<ScanResult>('mail:scan', accountIds),
  },
  totp: {
    save: (input: TotpInput) => invoke<PublicTotpEntry>('totp:save', input),
    bulkSave: (inputs: TotpInput[]) => invoke<BulkSaveResult>('totp:bulk-save', inputs),
    remove: (id: string) => invoke<void>('totp:remove', id),
    codes: () => invoke<TotpCode[]>('totp:codes'),
  },
  settings: {
    update: (input: Partial<AppSettings>) => invoke<AppSettings>('settings:update', input),
  },
  backup: {
    exportAll: (password: string) => invoke<BackupExportResult>('backup:export', password),
    importAll: (password: string) => invoke<BackupImportResult>('backup:import', password),
  },
  system: {
    copy: (text: string) => invoke<void>('system:copy', text),
    openExternal: (url: string) => invoke<void>('system:open-external', url),
  },
};

contextBridge.exposeInMainWorld('codeHarbor', bridge);
