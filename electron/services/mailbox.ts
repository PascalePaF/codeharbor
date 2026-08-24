import { ImapFlow, type FetchMessageObject, type MessageAddressObject } from 'imapflow';
import type {
  AccountScanStatus,
  ScanResult,
  VerificationMessage,
} from '../../src/shared/contracts';
import { extractVerificationCodes, makePreview, stripHtml } from '../core/code-extractor';
import type { VaultStore } from './vault';

type DecryptedAccount = Awaited<ReturnType<VaultStore['getDecryptedAccount']>>;
type MailboxStage = 'prepare' | 'connect' | 'mailbox' | 'search' | 'fetch' | 'parse';

interface ConnectionAccountHint {
  provider: string;
  authMode: 'password' | 'oauth2';
  imapHost: string;
  imapPort: number;
}

interface MailboxSession {
  connect(): Promise<void>;
  openInbox(): Promise<string>;
  searchRecent(since: Date): Promise<number[]>;
  fetchSource(uid: number): Promise<FetchMessageObject | undefined>;
  lastTransportError(): Error | undefined;
  close(): Promise<void>;
}

type MailboxSessionFactory = (account: DecryptedAccount) => MailboxSession;

interface AccountMessageCache {
  identity: string;
  entries: Map<number, VerificationMessage | null>;
}

const MAX_MESSAGE_BYTES = 1024 * 1024;
const CONNECT_TIMEOUT_MS = 15_000;
const SOCKET_TIMEOUT_MS = 40_000;
const LOGOUT_TIMEOUT_MS = 2_000;

function formatAddress(address: MessageAddressObject | undefined): string {
  if (!address) return '未知发件人';
  if (address.name && address.address) return `${address.name} <${address.address}>`;
  return address.address || address.name || '未知发件人';
}

interface ParsedAddress {
  name?: string;
  address?: string;
  group?: Array<{ name?: string; address?: string }>;
}

function formatParsedAddress(address: ParsedAddress | undefined): string {
  if (!address) return '';
  if (address.group) return address.group.map((item) => formatAddress(item)).join(', ');
  return formatAddress(address);
}

function errorDetails(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const extended = error as Error & {
    code?: string;
    responseText?: string;
    response?: string;
    serverResponseCode?: string;
    reason?: string;
    _err?: Error;
  };
  return [
    extended.code,
    extended.serverResponseCode,
    extended.message,
    extended.responseText,
    extended.response,
    extended.reason,
    extended._err?.message,
  ]
    .filter(Boolean)
    .join(' · ');
}

function stageName(stage: MailboxStage): string {
  return {
    prepare: '读取本地账户',
    connect: '连接并认证',
    mailbox: '打开收件箱',
    search: '搜索最近邮件',
    fetch: '读取邮件',
    parse: '解析邮件',
  }[stage];
}

export function friendlyConnectionError(
  error: unknown,
  account?: ConnectionAccountHint,
  stage: MailboxStage = 'connect',
): string {
  const message = errorDetails(error).replace(/[\r\n]+/g, ' ').slice(0, 260);
  if (/auth|login|credential|password|invalid user|authenticationfailed|AUTHENTICATE/i.test(message)) {
    if (account?.provider === 'gmail') {
      return '服务器可达，但 Gmail 认证失败：请填写 16 位应用专用密码，不要填写 Google 登录密码或 6 位 2FA 动态码';
    }
    if (account?.provider === 'outlook') {
      return '服务器可达，但 Microsoft 认证失败：Outlook/365 需要有效的 OAuth2 令牌和 IMAP 权限';
    }
    if (['163', '126', 'qq', 'aliyun-enterprise'].includes(account?.provider ?? '')) {
      return '服务器可达，但认证失败：请确认已开启 IMAP，并填写客户端授权码/安全密码，不要填写网页登录密码';
    }
    return '服务器可达，但认证失败：请检查完整用户名、邮箱密码/授权码或 OAuth2 令牌';
  }
  if (/imap.*disabled|not enabled|disabled for this user/i.test(message)) {
    return '服务器已认证，但该邮箱尚未开启 IMAP 服务';
  }
  if (/too many|maximum.*connection|rate limit/i.test(message)) {
    return '邮箱服务器连接数过多，请关闭其他邮件客户端后稍等再试';
  }
  if (/ENOTFOUND|getaddrinfo|EAI_AGAIN/i.test(message)) {
    return '无法解析 IMAP 服务器地址，请检查网络或服务器填写是否正确';
  }
  if (/ECONNREFUSED/i.test(message)) {
    return 'IMAP 服务器拒绝连接，请检查主机、端口和邮箱端 IMAP 开关';
  }
  if (/timeout|ETIMEDOUT|ETIMEOUT|CONNECT_TIMEOUT|SocketTimeout/i.test(message)) {
    const endpoint = account ? `${account.imapHost}:${account.imapPort}` : 'IMAP 服务器';
    return `连接 ${endpoint} 超时（${stageName(stage)}）：请检查代理、防火墙或稍后重试`;
  }
  if (/ECONNRESET|EPIPE|socket.*closed|Connection closed/i.test(message)) {
    return `连接被服务器中断（${stageName(stage)}），请稍后重试并确认 IMAP 已开启`;
  }
  if (/certificate|self signed|unable to verify|ERR_TLS/i.test(message)) {
    return 'IMAP 服务器证书校验失败，为保护凭据已停止连接';
  }
  if (/mailbox.*not found|NONEXISTENT|cannot open mailbox/i.test(message)) {
    return '账户已连接，但服务器无法以只读方式打开 INBOX 收件箱';
  }
  return `连接失败（${stageName(stage)}）：${message || '未知错误'}`;
}

function withTimeout<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Operation timeout')), milliseconds);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

class ImapFlowSession implements MailboxSession {
  private readonly client: ImapFlow;
  private transportError?: Error;

  constructor(account: DecryptedAccount) {
    const auth = account.authMode === 'oauth2'
      ? { user: account.username, accessToken: account.credential }
      : { user: account.username, pass: account.credential };

    this.client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.secure,
      auth,
      logger: false,
      disableAutoIdle: true,
      connectionTimeout: CONNECT_TIMEOUT_MS,
      greetingTimeout: CONNECT_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
      maxLiteralSize: MAX_MESSAGE_BYTES + 512 * 1024,
      maxResponseSize: MAX_MESSAGE_BYTES + 2 * 1024 * 1024,
      clientInfo: {
        name: 'CodeHarbor',
        version: '1.0.1',
        vendor: 'CodeHarbor',
      },
      tls: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
      },
    });

    // ImapFlow forwards transport failures through EventEmitter. Keeping this listener for
    // the complete session lifetime turns network failures into ordinary account results.
    this.client.on('error', (error: Error) => {
      this.transportError = error;
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async openInbox(): Promise<string> {
    const mailbox = await this.client.mailboxOpen('INBOX', { readOnly: true });
    return mailbox.uidValidity.toString();
  }

  async searchRecent(since: Date): Promise<number[]> {
    const found = await this.client.search({ since }, { uid: true });
    return found === false ? [] : found;
  }

  async fetchSource(uid: number): Promise<FetchMessageObject | undefined> {
    const fetched = await this.client.fetchOne(
      String(uid),
      {
        uid: true,
        envelope: true,
        internalDate: true,
        source: { start: 0, maxLength: MAX_MESSAGE_BYTES },
      },
      { uid: true },
    );
    return fetched === false ? undefined : fetched;
  }

  lastTransportError(): Error | undefined {
    return this.transportError;
  }

  async close(): Promise<void> {
    if (!this.client.usable) {
      this.client.close();
      return;
    }
    try {
      await withTimeout(this.client.logout(), LOGOUT_TIMEOUT_MS);
    } catch {
      this.client.close();
    }
  }
}

function createSession(account: DecryptedAccount): MailboxSession {
  return new ImapFlowSession(account);
}

export function normalizeRecentUids(values: number[], limit: number): number[] {
  return [...new Set(values.filter((value) => Number.isSafeInteger(value) && value > 0))]
    .sort((left, right) => left - right)
    .slice(-Math.max(0, limit))
    .reverse();
}

export class MailboxService {
  private readonly accountJobs = new Map<string, Promise<void>>();
  private readonly messageCache = new Map<string, AccountMessageCache>();
  private activeFullScan?: Promise<ScanResult>;

  constructor(
    private readonly vault: VaultStore,
    private readonly sessionFactory: MailboxSessionFactory = createSession,
  ) {}

  async testAccount(accountId: string): Promise<AccountScanStatus> {
    return this.runAccountJob(accountId, () => this.testAccountNow(accountId));
  }

  async scan(accountIds?: string[]): Promise<ScanResult> {
    const isFullScan = !accountIds?.length;
    if (isFullScan && this.activeFullScan) return this.activeFullScan;

    const operation = this.scanNow(accountIds);
    if (!isFullScan) return operation;

    this.activeFullScan = operation;
    try {
      return await operation;
    } finally {
      if (this.activeFullScan === operation) this.activeFullScan = undefined;
    }
  }

  private async testAccountNow(accountId: string): Promise<AccountScanStatus> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    let stage: MailboxStage = 'prepare';
    let account: DecryptedAccount | undefined;
    let session: MailboxSession | undefined;
    this.vault.setAccountStatus(accountId, { state: 'checking', message: '正在读取本地账户…' });

    try {
      account = await this.vault.getDecryptedAccount(accountId);
      this.vault.setAccountStatus(accountId, {
        state: 'checking',
        message: `正在连接 ${account.imapHost}:${account.imapPort}…`,
      });
      session = this.sessionFactory(account);
      stage = 'connect';
      await session.connect();
      stage = 'mailbox';
      await session.openInbox();

      const status: AccountScanStatus = {
        accountId,
        state: 'ok',
        message: `连接、认证和只读收件箱检查成功（${Date.now() - startedAt} ms）`,
        checkedAt,
        messageCount: 0,
      };
      this.vault.setAccountStatus(accountId, {
        state: 'ok',
        message: status.message,
        checkedAt,
      });
      return status;
    } catch (error) {
      const message = friendlyConnectionError(session?.lastTransportError() ?? error, account, stage);
      this.vault.setAccountStatus(accountId, { state: 'error', message, checkedAt });
      return { accountId, state: 'error', message, checkedAt, messageCount: 0 };
    } finally {
      await session?.close();
    }
  }

  private async scanNow(accountIds?: string[]): Promise<ScanResult> {
    const ids = accountIds?.length
      ? [...new Set(accountIds)]
      : this.vault.getEnabledAccountIds();
    const statuses: AccountScanStatus[] = [];
    const messages: VerificationMessage[] = [];
    const queue = [...ids];
    const workerCount = Math.min(3, queue.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (queue.length) {
          const id = queue.shift();
          if (!id) break;
          const result = await this.runAccountJob(id, () => this.scanAccountNow(id));
          statuses.push(result.status);
          messages.push(...result.messages);
        }
      }),
    );

    messages.sort((left, right) =>
      new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime(),
    );
    return { statuses, messages, scannedAt: new Date().toISOString() };
  }

  private async scanAccountNow(
    accountId: string,
  ): Promise<{ status: AccountScanStatus; messages: VerificationMessage[] }> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    let stage: MailboxStage = 'prepare';
    let account: DecryptedAccount | undefined;
    let session: MailboxSession | undefined;
    this.vault.setAccountStatus(accountId, { state: 'checking', message: '正在准备扫描…' });

    try {
      account = await this.vault.getDecryptedAccount(accountId);
      if (!account.enabled) {
        return {
          status: { accountId, state: 'skipped', message: '账户已停用', checkedAt, messageCount: 0 },
          messages: [],
        };
      }

      this.vault.setAccountStatus(accountId, {
        state: 'checking',
        message: `正在连接 ${account.imapHost}:${account.imapPort}…`,
      });
      session = this.sessionFactory(account);
      stage = 'connect';
      await session.connect();
      stage = 'mailbox';
      const uidValidity = await session.openInbox();
      stage = 'search';

      const settings = this.vault.getSettings();
      const since = new Date(Date.now() - settings.scanWindowHours * 60 * 60 * 1000);
      const found = await session.searchRecent(since);
      const uids = normalizeRecentUids(found, settings.maxMessagesPerAccount);
      const cacheIdentity = `${account.updatedAt}:${uidValidity}`;
      const previousCache = this.messageCache.get(accountId);
      const cachedEntries = previousCache?.identity === cacheIdentity
        ? previousCache.entries
        : new Map<number, VerificationMessage | null>();
      const nextEntries = new Map<number, VerificationMessage | null>();
      const verificationMessages: VerificationMessage[] = [];
      let reused = 0;
      let skipped = 0;

      for (const uid of uids) {
        if (cachedEntries.has(uid)) {
          const cached = cachedEntries.get(uid) ?? null;
          nextEntries.set(uid, cached);
          if (cached) verificationMessages.push(cached);
          reused += 1;
          continue;
        }

        try {
          stage = 'fetch';
          const fetched = await session.fetchSource(uid);
          if (!fetched?.source) {
            nextEntries.set(uid, null);
            continue;
          }
          stage = 'parse';
          const parsedMessage = await this.parseMessage(account, uid, fetched);
          nextEntries.set(uid, parsedMessage);
          if (parsedMessage) verificationMessages.push(parsedMessage);
        } catch {
          // One malformed or temporarily unavailable message must not fail the whole mailbox.
          skipped += 1;
        }
      }

      this.messageCache.set(accountId, { identity: cacheIdentity, entries: nextEntries });
      const details = [
        `找到 ${verificationMessages.length} 封验证码邮件`,
        `${Date.now() - startedAt} ms`,
      ];
      if (reused) details.push(`复用 ${reused} 封本地结果`);
      if (skipped) details.push(`跳过 ${skipped} 封异常邮件`);
      const message = `扫描完成：${details.join('，')}`;
      this.vault.setAccountStatus(accountId, { state: 'ok', message, checkedAt });
      return {
        status: {
          accountId,
          state: 'ok',
          message,
          checkedAt,
          messageCount: verificationMessages.length,
        },
        messages: verificationMessages,
      };
    } catch (error) {
      const message = friendlyConnectionError(session?.lastTransportError() ?? error, account, stage);
      this.vault.setAccountStatus(accountId, { state: 'error', message, checkedAt });
      return {
        status: { accountId, state: 'error', message, checkedAt, messageCount: 0 },
        messages: [],
      };
    } finally {
      await session?.close();
    }
  }

  private async parseMessage(
    account: DecryptedAccount,
    uid: number,
    fetched: FetchMessageObject,
  ): Promise<VerificationMessage | null> {
    if (!fetched.source) return null;
    const { default: PostalMime } = await import('postal-mime');
    const parsed = await PostalMime.parse(fetched.source, {
      attachmentEncoding: 'arraybuffer',
      maxNestingDepth: 50,
      maxHeadersSize: 256 * 1024,
      maxRfc822NestingDepth: 0,
    });
    const subject = parsed.subject ?? fetched.envelope?.subject ?? '(无主题)';
    const html = typeof parsed.html === 'string' ? stripHtml(parsed.html) : '';
    const body = [parsed.text ?? '', html].filter(Boolean).join(' ');
    const codes = extractVerificationCodes(subject, body);
    if (!codes.length) return null;

    const sender = formatParsedAddress(parsed.from) || formatAddress(fetched.envelope?.from?.[0]);
    const receivedValue = parsed.date ?? fetched.internalDate ?? fetched.envelope?.date ?? new Date();
    const receivedDate = new Date(receivedValue);
    return {
      id: `${account.id}:${uid}`,
      accountId: account.id,
      accountLabel: account.label,
      accountEmail: account.email,
      provider: account.provider,
      subject,
      sender,
      receivedAt: Number.isNaN(receivedDate.getTime())
        ? new Date().toISOString()
        : receivedDate.toISOString(),
      codes,
      preview: makePreview(body || subject),
    };
  }

  private async runAccountJob<T>(accountId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.accountJobs.get(accountId) ?? Promise.resolve();
    const operation = previous.catch(() => undefined).then(task);
    const gate = operation.then(() => undefined, () => undefined);
    this.accountJobs.set(accountId, gate);
    try {
      return await operation;
    } finally {
      if (this.accountJobs.get(accountId) === gate) this.accountJobs.delete(accountId);
    }
  }
}
