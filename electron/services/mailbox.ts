import { ImapFlow } from 'imapflow';
import type {
  AccountScanStatus,
  ScanResult,
  VerificationMessage,
} from '../../src/shared/contracts';
import { extractVerificationCodes, makePreview, stripHtml } from '../core/code-extractor';
import type { VaultStore } from './vault';

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

function friendlyConnectionError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.replace(/[\r\n]+/g, ' ').slice(0, 220);
  if (/auth|login|credential|password|invalid user|authenticationfailed/i.test(message)) {
    return '认证失败，请检查邮箱地址、授权码或 OAuth2 令牌';
  }
  if (/imap.*disabled|not enabled/i.test(message)) return '该邮箱尚未开启 IMAP 服务';
  if (/too many|maximum.*connection/i.test(message)) return '邮箱服务器连接数过多，请稍后重试';
  if (/ENOTFOUND|getaddrinfo/i.test(message)) return '无法解析 IMAP 服务器地址';
  if (/ECONNREFUSED/i.test(message)) return 'IMAP 服务器拒绝连接';
  if (/timeout|ETIMEDOUT/i.test(message)) return '连接超时，请检查网络或服务器设置';
  if (/certificate|self signed|unable to verify/i.test(message)) return 'IMAP 服务器证书校验失败';
  return `连接失败：${message || '未知错误'}`;
}

export class MailboxService {
  constructor(private readonly vault: VaultStore) {}

  async testAccount(accountId: string): Promise<AccountScanStatus> {
    const checkedAt = new Date().toISOString();
    this.vault.setAccountStatus(accountId, { state: 'checking', message: '正在连接…' });
    let client: ImapFlow | undefined;
    try {
      const account = await this.vault.getDecryptedAccount(accountId);
      client = this.createClient(account);
      await client.connect();
      const lock = await client.getMailboxLock('INBOX', { readOnly: true });
      lock.release();
      const status: AccountScanStatus = {
        accountId,
        state: 'ok',
        message: '连接成功',
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
      const message = friendlyConnectionError(error);
      this.vault.setAccountStatus(accountId, { state: 'error', message, checkedAt });
      return { accountId, state: 'error', message, checkedAt, messageCount: 0 };
    } finally {
      if (client?.usable) await client.logout().catch(() => undefined);
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
    try {
      const account = await this.vault.getDecryptedAccount(accountId);
      if (!account.enabled) {
        return {
          status: { accountId, state: 'skipped', message: '账户已停用', checkedAt, messageCount: 0 },
          messages: [],
        };
      }
      client = this.createClient(account);
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
      const message = friendlyConnectionError(error);
      this.vault.setAccountStatus(accountId, { state: 'error', message, checkedAt });
      return {
        status: { accountId, state: 'error', message, checkedAt, messageCount: 0 },
        messages: [],
      };
    } finally {
      if (client?.usable) await client.logout().catch(() => undefined);
    }
  }

  private createClient(account: Awaited<ReturnType<VaultStore['getDecryptedAccount']>>): ImapFlow {
    const auth =
      account.authMode === 'oauth2'
        ? { user: account.username, accessToken: account.credential }
        : { user: account.username, pass: account.credential };
    return new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.secure,
      auth,
      logger: false,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      tls: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
      },
    });
  }
}
