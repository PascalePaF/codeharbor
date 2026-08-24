import { ImapFlow } from 'imapflow';
import type {
  AccountScanStatus,
  ScanResult,
  VerificationMessage,
} from '../../src/shared/contracts';
import { extractVerificationCodes, makePreview, stripHtml } from '../core/code-extractor';
import type { VaultStore } from './vault';

interface ConnectionAccountHint {
  provider: string;
  authMode: 'password' | 'oauth2';
  imapHost: string;
  imapPort: number;
}

function formatAddress(address: { name?: string; address?: string } | undefined): string {
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
  if ('group' in address && address.group) {
    return address.group.map((item) => formatAddress(item)).join(', ');
  }
  return formatAddress(address);
}

function errorDetails(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const extended = error as Error & { code?: string; responseText?: string; reason?: string; _err?: Error };
  return [extended.code, extended.message, extended.responseText, extended.reason, extended._err?.message]
    .filter(Boolean)
    .join(' · ');
}

export function friendlyConnectionError(error: unknown, account?: ConnectionAccountHint): string {
  const message = errorDetails(error).replace(/[\r\n]+/g, ' ').slice(0, 260);
  if (/auth|login|credential|password|invalid user|authenticationfailed/i.test(message)) {
    if (account?.provider === 'gmail') {
      return 'Gmail 认证失败：请填写 16 位“应用专用密码”，不要填写 Google 登录密码或 6 位 2FA 动态码';
    }
    if (account?.provider === 'outlook') {
      return 'Microsoft 认证失败：Outlook/365 要求 OAuth2 现代身份验证，请检查访问令牌是否有效且包含 IMAP 权限';
    }
    if (['163', '126', 'qq', 'aliyun-enterprise'].includes(account?.provider ?? '')) {
      return '认证失败：该服务商通常要求客户端授权码/安全密码，请勿填写网页登录密码或短信验证码';
    }
    return '认证失败，请检查邮箱地址、授权码或 OAuth2 令牌';
  }
  if (/imap.*disabled|not enabled/i.test(message)) return '该邮箱尚未开启 IMAP 服务';
  if (/too many|maximum.*connection/i.test(message)) return '邮箱服务器连接数过多，请稍后重试';
  if (/ENOTFOUND|getaddrinfo/i.test(message)) return '无法解析 IMAP 服务器地址';
  if (/ECONNREFUSED/i.test(message)) return 'IMAP 服务器拒绝连接';
  if (/timeout|ETIMEDOUT|ETIMEOUT|CONNECT_TIMEOUT/i.test(message)) {
    const endpoint = account ? `${account.imapHost}:${account.imapPort}` : 'IMAP 服务器';
    return `连接 ${endpoint} 超时：请检查网络、代理或防火墙是否允许 TCP 993；也可能是服务器响应较慢`;
  }
  if (/ECONNRESET|EPIPE|socket.*closed/i.test(message)) return '连接被服务器中断，请稍后重试并确认 IMAP 已开启';
  if (/certificate|self signed|unable to verify/i.test(message)) return 'IMAP 服务器证书校验失败';
  return `连接失败：${message || '未知错误'}`;
}

export class MailboxService {
  constructor(private readonly vault: VaultStore) {}

  async testAccount(accountId: string): Promise<AccountScanStatus> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    this.vault.setAccountStatus(accountId, { state: 'checking', message: '正在连接…' });
    let client: ImapFlow | undefined;
    let account: Awaited<ReturnType<VaultStore['getDecryptedAccount']>> | undefined;
    let emittedError: Error | undefined;
    try {
      account = await this.vault.getDecryptedAccount(accountId);
      client = this.createClient(account, (error) => { emittedError = error; });
      await client.connect();
      const lock = await client.getMailboxLock('INBOX', { readOnly: true });
      lock.release();
      const status: AccountScanStatus = {
        accountId,
        state: 'ok',
        message: `连接成功（${Date.now() - startedAt} ms）`,
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
      const message = friendlyConnectionError(emittedError ?? error, account);
      this.vault.setAccountStatus(accountId, { state: 'error', message, checkedAt });
      return { accountId, state: 'error', message, checkedAt, messageCount: 0 };
    } finally {
      client?.close();
    }
  }

  async scan(accountIds?: string[]): Promise<ScanResult> {
    const ids = accountIds?.length ? [...new Set(accountIds)] : this.vault.getEnabledAccountIds();
    const statuses: AccountScanStatus[] = [];
    const messages: VerificationMessage[] = [];
    const queue = [...ids];
    const workerCount = Math.min(3, queue.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (queue.length) {
          const id = queue.shift();
          if (!id) break;
          const result = await this.scanOne(id);
          statuses.push(result.status);
          messages.push(...result.messages);
        }
      }),
    );

    messages.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
    return { statuses, messages, scannedAt: new Date().toISOString() };
  }

  private async scanOne(
    accountId: string,
  ): Promise<{ status: AccountScanStatus; messages: VerificationMessage[] }> {
    const checkedAt = new Date().toISOString();
    this.vault.setAccountStatus(accountId, { state: 'checking', message: '正在扫描…' });
    let client: ImapFlow | undefined;
    let account: Awaited<ReturnType<VaultStore['getDecryptedAccount']>> | undefined;
    let emittedError: Error | undefined;
    try {
      account = await this.vault.getDecryptedAccount(accountId);
      if (!account.enabled) {
        return {
          status: { accountId, state: 'skipped', message: '账户已停用', checkedAt, messageCount: 0 },
          messages: [],
        };
      }
      client = this.createClient(account, (error) => { emittedError = error; });
      await client.connect();
      const lock = await client.getMailboxLock('INBOX', { readOnly: true });
      const verificationMessages: VerificationMessage[] = [];
      try {
        const settings = this.vault.getSettings();
        const since = new Date(Date.now() - settings.scanWindowHours * 60 * 60 * 1000);
        const found = await client.search({ since }, { uid: true });
        const uids = Array.isArray(found) ? found.slice(-settings.maxMessagesPerAccount) : [];
        if (uids.length) {
          const fetched = await client.fetchAll(
            uids,
            {
              envelope: true,
              internalDate: true,
              source: { start: 0, maxLength: 1024 * 1024 },
            },
            { uid: true },
          );
          for (const message of fetched) {
            if (!message.source) continue;
            const { default: PostalMime } = await import('postal-mime');
            const parsed = await PostalMime.parse(message.source, {
              attachmentEncoding: 'arraybuffer',
              maxNestingDepth: 50,
              maxHeadersSize: 256 * 1024,
              maxRfc822NestingDepth: 0,
            });
            const subject = parsed.subject ?? message.envelope?.subject ?? '(无主题)';
            const html = typeof parsed.html === 'string' ? stripHtml(parsed.html) : '';
            const body = [parsed.text ?? '', html].filter(Boolean).join(' ');
            const codes = extractVerificationCodes(subject, body);
            if (!codes.length) continue;
            const envelopeSender = message.envelope?.from?.[0];
            const sender = formatParsedAddress(parsed.from) || formatAddress(envelopeSender);
            const receivedValue = parsed.date ?? message.internalDate ?? message.envelope?.date ?? new Date();
            const receivedDate = new Date(receivedValue);
            const receivedAt = Number.isNaN(receivedDate.getTime())
              ? new Date().toISOString()
              : receivedDate.toISOString();
            verificationMessages.push({
              id: `${account.id}:${message.uid}`,
              accountId: account.id,
              accountLabel: account.label,
              accountEmail: account.email,
              provider: account.provider,
              subject,
              sender,
              receivedAt,
              codes,
              preview: makePreview(body || subject),
            });
          }
        }
      } finally {
        lock.release();
      }

      const message = `扫描完成，找到 ${verificationMessages.length} 封验证码邮件`;
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
      const message = friendlyConnectionError(emittedError ?? error, account);
      this.vault.setAccountStatus(accountId, { state: 'error', message, checkedAt });
      return {
        status: { accountId, state: 'error', message, checkedAt, messageCount: 0 },
        messages: [],
      };
    } finally {
      client?.close();
    }
  }

  private createClient(
    account: Awaited<ReturnType<VaultStore['getDecryptedAccount']>>,
    onError: (error: Error) => void,
  ): ImapFlow {
    const auth =
      account.authMode === 'oauth2'
        ? { user: account.username, accessToken: account.credential }
        : { user: account.username, pass: account.credential };
    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.secure,
      auth,
      logger: false,
      disableAutoIdle: true,
      connectionTimeout: 25_000,
      greetingTimeout: 15_000,
      socketTimeout: 45_000,
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
    // ImapFlow reports transport failures through EventEmitter after connect(). Without a
    // listener, Node treats an ordinary network timeout as an uncaught main-process exception.
    client.on('error', onError);
    return client;
  }
}
