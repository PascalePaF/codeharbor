import { LoaderCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccountModal } from './components/AccountModal';
import { BackupModal } from './components/BackupModal';
import { MailImportModal } from './components/MailImportModal';
import { Sidebar, type PageId } from './components/Sidebar';
import { ToastStack, type ToastMessage } from './components/Toast';
import { Topbar } from './components/Topbar';
import { TotpImportModal } from './components/TotpImportModal';
import { TotpModal } from './components/TotpModal';
import { TotpQrImportModal } from './components/TotpQrImportModal';
import { friendlyError } from './lib/format';
import { AccountsPage } from './pages/AccountsPage';
import { InboxPage } from './pages/InboxPage';
import { SettingsPage } from './pages/SettingsPage';
import { TotpPage } from './pages/TotpPage';
import type {
  AppBootstrap,
  AppSettings,
  BackupScope,
  MailAccountInput,
  PublicMailAccount,
  PublicTotpEntry,
  TotpCode,
  TotpInput,
  UpdateState,
  VerificationMessage,
} from './shared/contracts';

type ModalState =
  | { type: 'account'; account?: PublicMailAccount }
  | { type: 'mail-import' }
  | { type: 'totp'; entry?: PublicTotpEntry }
  | { type: 'totp-import' }
  | { type: 'totp-qr-import' }
  | { type: 'backup-export'; scope: BackupScope }
  | { type: 'backup-import'; scope: BackupScope }
  | null;

export default function App() {
  const [data, setData] = useState<AppBootstrap | null>(null);
  const [page, setPage] = useState<PageId>('inbox');
  const [search, setSearch] = useState('');
  const [messages, setMessages] = useState<VerificationMessage[]>([]);
  const [totpCodes, setTotpCodes] = useState<TotpCode[]>([]);
  const [lastScan, setLastScan] = useState<string>();
  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);
  const [scanningTarget, setScanningTarget] = useState('');
  const [updateState, setUpdateState] = useState<UpdateState>();
  const [testingId, setTestingId] = useState('');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastId = useRef(0);
  const scanGuard = useRef(false);

  const toast = useCallback((message: string, kind: ToastMessage['kind'] = 'success') => {
    const id = ++toastId.current;
    setToasts((items) => [...items, { id, message, kind }].slice(-4));
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4200);
  }, []);

  const reload = useCallback(async () => {
    const next = await window.codeHarbor.bootstrap();
    setData(next);
    return next;
  }, []);

  useEffect(() => {
    void reload().catch((error) => toast(friendlyError(error), 'error'));
  }, [reload, toast]);

  useEffect(() => {
    void window.codeHarbor.updater.status().then(setUpdateState).catch(() => undefined);
    return window.codeHarbor.updater.onStatus(setUpdateState);
  }, []);

  useEffect(() => {
    if (!data?.settings.theme) return;
    document.documentElement.dataset.theme = data.settings.theme;
    document.documentElement.style.colorScheme = data.settings.theme;
  }, [data?.settings.theme]);

  const refreshTotp = useCallback(async () => {
    try { setTotpCodes(await window.codeHarbor.totp.codes()); }
    catch (error) { toast(friendlyError(error), 'error'); }
  }, [toast]);

  useEffect(() => {
    if (!data?.totpEntries.length) { setTotpCodes([]); return; }
    void refreshTotp();
    const timer = window.setInterval(() => void refreshTotp(), 1000);
    return () => window.clearInterval(timer);
  }, [data?.totpEntries.length, refreshTotp]);

  const scanMail = useCallback(async (silent = false, accountId?: string) => {
    if (scanGuard.current) return;
    scanGuard.current = true;
    setScanningTarget(accountId ?? 'all');
    try {
      const result = await window.codeHarbor.mail.scan(accountId ? [accountId] : undefined);
      setMessages((current) => accountId
        ? [...current.filter((message) => message.accountId !== accountId), ...result.messages]
            .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))
        : result.messages,
      );
      setLastScan(result.scannedAt);
      await reload();
      const failures = result.statuses.filter((status) => status.state === 'error').length;
      if (!silent) {
        toast(
          failures
            ? `扫描完成：找到 ${result.messages.length} 条验证码，${failures} 个邮箱失败`
            : `扫描完成：找到 ${result.messages.length} 条验证码`,
          failures ? 'info' : 'success',
        );
      }
    } catch (error) {
      toast(friendlyError(error), 'error');
    } finally {
      scanGuard.current = false;
      setScanningTarget('');
    }
  }, [reload, toast]);

  useEffect(() => {
    if (!data?.settings.autoRefresh || !data.accounts.some((account) => account.enabled)) return;
    const timer = window.setInterval(
      () => void scanMail(true),
      data.settings.pollIntervalMinutes * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, [data?.settings.autoRefresh, data?.settings.pollIntervalMinutes, data?.accounts, scanMail]);

  const saveAccount = async (input: MailAccountInput) => {
    setBusy(true);
    try {
      await window.codeHarbor.accounts.save(input);
      await reload();
      setModal(null);
      toast(input.id ? '邮箱账户已更新' : '邮箱账户已安全保存');
    } catch (error) { toast(friendlyError(error), 'error'); }
    finally { setBusy(false); }
  };

  const bulkAccounts = async (inputs: MailAccountInput[]) => {
    setBusy(true);
    try {
      const result = await window.codeHarbor.accounts.bulkSave(inputs);
      await reload();
      setModal(null);
      toast(`导入完成：新增 ${result.created}，更新 ${result.updated}${result.failed.length ? `，失败 ${result.failed.length}` : ''}`, result.failed.length ? 'info' : 'success');
      if (result.failed.length) toast(result.failed.slice(0, 2).map((item) => `第 ${item.row} 行：${item.error}`).join('；'), 'error');
    } catch (error) { toast(friendlyError(error), 'error'); }
    finally { setBusy(false); }
  };

  const deleteAccount = async (account: PublicMailAccount) => {
    if (!window.confirm(`确定删除“${account.label}”吗？\n加密保存的邮箱凭据也会一并移除。`)) return;
    try {
      await window.codeHarbor.accounts.remove(account.id);
      setMessages((items) => items.filter((message) => message.accountId !== account.id));
      await reload();
      toast('邮箱账户已删除', 'info');
    } catch (error) { toast(friendlyError(error), 'error'); }
  };

  const toggleAccount = async (account: PublicMailAccount) => {
    try {
      await window.codeHarbor.accounts.setEnabled(account.id, !account.enabled);
      await reload();
      toast(account.enabled ? '账户已暂停扫描' : '账户已启用');
    } catch (error) { toast(friendlyError(error), 'error'); }
  };

  const testAccount = async (account: PublicMailAccount) => {
    setTestingId(account.id);
    try {
      const result = await window.codeHarbor.accounts.test(account.id);
      await reload();
      toast(result.message, result.state === 'ok' ? 'success' : 'error');
    } catch (error) { toast(friendlyError(error), 'error'); }
    finally { setTestingId(''); }
  };

  const saveTotp = async (input: TotpInput) => {
    setBusy(true);
    try {
      await window.codeHarbor.totp.save(input);
      await reload();
      await refreshTotp();
      setModal(null);
      toast(input.id ? '2FA 项目已更新' : '2FA 项目已加密保存');
    } catch (error) { toast(friendlyError(error), 'error'); }
    finally { setBusy(false); }
  };

  const bulkTotp = async (inputs: TotpInput[]) => {
    setBusy(true);
    try {
      const result = await window.codeHarbor.totp.bulkSave(inputs);
      await reload();
      await refreshTotp();
      setModal(null);
      toast(`导入完成：新增 ${result.created}，更新 ${result.updated}${result.failed.length ? `，失败 ${result.failed.length}` : ''}`, result.failed.length ? 'info' : 'success');
      if (result.failed.length) toast(result.failed.slice(0, 2).map((item) => `第 ${item.row} 行：${item.error}`).join('；'), 'error');
    } catch (error) { toast(friendlyError(error), 'error'); }
    finally { setBusy(false); }
  };

  const deleteTotp = async (entry: PublicTotpEntry) => {
    if (!window.confirm(`确定删除“${entry.label}”吗？\n对应的加密 2FA 密钥将一并移除。`)) return;
    try {
      await window.codeHarbor.totp.remove(entry.id);
      await reload();
      toast('2FA 项目已删除', 'info');
    } catch (error) { toast(friendlyError(error), 'error'); }
  };

  const saveSettings = async (settings: Partial<AppSettings>) => {
    setBusy(true);
    try {
      const next = await window.codeHarbor.settings.update(settings);
      setData((current) => current ? { ...current, settings: next } : current);
      toast('设置已保存');
    } catch (error) { toast(friendlyError(error), 'error'); }
    finally { setBusy(false); }
  };

  const exportBackup = async (scope: BackupScope, password: string) => {
    setBusy(true);
    try {
      const result = await window.codeHarbor.backup.exportScope(scope, password);
      setModal(null);
      if (!result.canceled) toast(`加密备份已导出：${result.accountCount} 个邮箱，${result.totpCount} 个 2FA`);
    } catch (error) { toast(friendlyError(error), 'error'); }
    finally { setBusy(false); }
  };

  const importBackup = async (scope: BackupScope, password: string) => {
    setBusy(true);
    try {
      const result = await window.codeHarbor.backup.importScope(scope, password);
      if (result.canceled) { setModal(null); return; }
      await reload();
      await refreshTotp();
      setMessages([]);
      setLastScan(undefined);
      setModal(null);
      toast(`备份导入完成：邮箱新增 ${result.accountsCreated} / 更新 ${result.accountsUpdated}，2FA 新增 ${result.totpCreated} / 更新 ${result.totpUpdated}`);
    } catch (error) { toast(friendlyError(error), 'error'); }
    finally { setBusy(false); }
  };

  const openExternal = async (url: string) => {
    try { await window.codeHarbor.system.openExternal(url); }
    catch (error) { toast(friendlyError(error), 'error'); }
  };

  const copy = async (value: string) => {
    try { await window.codeHarbor.system.copy(value); toast('验证码已复制'); }
    catch (error) { toast(friendlyError(error), 'error'); }
  };

  const changePage = (next: PageId) => { setPage(next); setSearch(''); };

  const checkForUpdates = async () => {
    try { setUpdateState(await window.codeHarbor.updater.check()); }
    catch (error) { toast(friendlyError(error), 'error'); }
  };

  if (!data) {
    return <main className="splash"><div className="splash-mark"><LoaderCircle size={30} className="spin" /></div><strong>CodeHarbor</strong><span>正在打开本地保险库…</span></main>;
  }

  return (
    <div className="app-shell">
      <Sidebar page={page} onChange={changePage} accountCount={data.accounts.length} codeCount={data.totpEntries.length} version={data.version} />
      <main className="main-column">
        <Topbar page={page} search={search} onSearch={setSearch} />
        <div className="page-scroll">
          {page === 'inbox' && <InboxPage accounts={data.accounts} messages={messages} providers={data.providers} totpCodes={totpCodes} search={search} scanningTarget={scanningTarget} lastScan={lastScan} onScanAll={() => scanMail(false)} onScanAccount={(accountId) => scanMail(false, accountId)} onCopy={copy} onGoAccounts={() => changePage('accounts')} />}
          {page === 'accounts' && <AccountsPage accounts={data.accounts} providers={data.providers} search={search} testingId={testingId} onAdd={() => setModal({ type: 'account' })} onBulk={() => setModal({ type: 'mail-import' })} onSecureImport={() => setModal({ type: 'backup-import', scope: 'accounts' })} onSecureExport={() => setModal({ type: 'backup-export', scope: 'accounts' })} onEdit={(account) => setModal({ type: 'account', account })} onDelete={deleteAccount} onToggle={toggleAccount} onTest={testAccount} />}
          {page === 'totp' && <TotpPage entries={data.totpEntries} codes={totpCodes} search={search} onAdd={() => setModal({ type: 'totp' })} onBulk={() => setModal({ type: 'totp-import' })} onQrImport={() => setModal({ type: 'totp-qr-import' })} onSecureImport={() => setModal({ type: 'backup-import', scope: 'totp' })} onSecureExport={() => setModal({ type: 'backup-export', scope: 'totp' })} onEdit={(entry) => setModal({ type: 'totp', entry })} onDelete={deleteTotp} onCopy={copy} />}
          {page === 'settings' && <SettingsPage settings={data.settings} vault={data.vault} providers={data.providers} version={data.version} updateState={updateState} busy={busy} onSave={saveSettings} onCheckUpdates={checkForUpdates} onExport={() => setModal({ type: 'backup-export', scope: 'all' })} onImport={() => setModal({ type: 'backup-import', scope: 'all' })} onOpenExternal={openExternal} />}
        </div>
      </main>

      {modal?.type === 'account' && <AccountModal providers={data.providers} account={modal.account} busy={busy} onClose={() => setModal(null)} onSave={saveAccount} onOpenExternal={openExternal} />}
      {modal?.type === 'mail-import' && <MailImportModal providers={data.providers} busy={busy} onClose={() => setModal(null)} onImport={bulkAccounts} />}
      {modal?.type === 'totp' && <TotpModal entry={modal.entry} busy={busy} onClose={() => setModal(null)} onSave={saveTotp} />}
      {modal?.type === 'totp-import' && <TotpImportModal busy={busy} onClose={() => setModal(null)} onImport={bulkTotp} />}
      {modal?.type === 'totp-qr-import' && <TotpQrImportModal busy={busy} onClose={() => setModal(null)} onImport={bulkTotp} />}
      {modal?.type === 'backup-export' && <BackupModal mode="export" scope={modal.scope} busy={busy} onClose={() => setModal(null)} onSubmit={(password) => exportBackup(modal.scope, password)} />}
      {modal?.type === 'backup-import' && <BackupModal mode="import" scope={modal.scope} busy={busy} onClose={() => setModal(null)} onSubmit={(password) => importBackup(modal.scope, password)} />}
      <ToastStack toasts={toasts} dismiss={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
    </div>
  );
}
