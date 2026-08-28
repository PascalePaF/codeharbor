import { describe, expect, it } from 'vitest';
import {
  friendlyConnectionError,
  mergeCertificateAuthorities,
  normalizeRecentUids,
} from './mailbox';
import { MailboxService } from './mailbox';
import type { VaultStore } from './vault';

describe('mailbox connection errors', () => {
  it('explains Gmail app-password authentication', () => {
    expect(friendlyConnectionError(new Error('AUTHENTICATIONFAILED Invalid credentials'), {
      provider: 'gmail',
      authMode: 'password',
      imapHost: 'imap.gmail.com',
      imapPort: 993,
    })).toContain('16 位应用专用密码');
  });

  it('turns socket timeouts into a recoverable diagnostic', () => {
    expect(friendlyConnectionError(Object.assign(new Error('Socket timeout'), { code: 'ETIMEOUT' }), {
      provider: '163',
      authMode: 'password',
      imapHost: 'imap.163.com',
      imapPort: 993,
    })).toBe('连接 imap.163.com:993 超时（连接并认证）：请检查代理、防火墙或稍后重试');
  });

  it('merges bundled and system certificate authorities without duplicates', () => {
    expect(mergeCertificateAuthorities(['bundled-a', 'shared'], ['system-a', 'shared']))
      .toEqual(['bundled-a', 'shared', 'system-a']);
  });

  it('explains certificate interception without suggesting an unsafe bypass', () => {
    expect(friendlyConnectionError(Object.assign(
      new Error('self-signed certificate in certificate chain'),
      { code: 'SELF_SIGNED_CERT_IN_CHAIN' },
    ))).toBe(
      'IMAP 证书未被系统信任，为保护凭据已停止连接；请检查系统时间，以及代理或安全软件的根证书是否已正确安装',
    );
  });

  it('keeps only unique recent UIDs in newest-first order', () => {
    expect(normalizeRecentUids([8, 2, 5, 8, -1, Number.NaN, 11], 3)).toEqual([11, 8, 5]);
  });

  it('scans independently, ignores one bad message, and reuses UID results', async () => {
    const account = {
      id: 'account-1',
      label: 'Test mailbox',
      email: 'test@example.com',
      provider: 'custom' as const,
      username: 'test@example.com',
      authMode: 'password' as const,
      imapHost: 'imap.example.com',
      imapPort: 993,
      secure: true,
      enabled: true,
      credential: 'test-only',
      createdAt: '2026-08-24T00:00:00.000Z',
      updatedAt: '2026-08-24T00:00:00.000Z',
    };
    const statuses: unknown[] = [];
    const vault = {
      getDecryptedAccount: async () => account,
      getEnabledAccountIds: () => [account.id],
      getSettings: () => ({
        pollIntervalMinutes: 2,
        scanWindowHours: 5,
        maxMessagesPerAccount: 30,
        autoRefresh: false,
        theme: 'dark' as const,
      }),
      setAccountStatus: (_id: string, status: unknown) => statuses.push(status),
    } as unknown as VaultStore;
    let fetchCount = 0;
    const source = Buffer.from([
      'From: OpenAI <otp@tm1.openai.com>',
      'To: test@example.com',
      'Subject: Your ChatGPT login code is 482913',
      'Date: Mon, 24 Aug 2026 10:00:00 +0000',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Use this ChatGPT verification code 482913 to sign in.',
    ].join('\r\n'));
    const service = new MailboxService(vault, () => ({
      connect: async () => undefined,
      openInbox: async () => 'uid-validity-1',
      searchRecent: async () => [100, 101],
      fetchSource: async (uid: number) => {
        fetchCount += 1;
        if (uid === 100) throw new Error('Malformed test message');
        return { seq: 1, uid, source };
      },
      lastTransportError: () => undefined,
      close: async () => undefined,
    }));

    const first = await service.scan();
    expect(first.messages).toHaveLength(1);
    expect(first.messages[0].codes[0]).toBe('482913');
    expect(first.statuses[0].message).toContain('跳过 1 封异常邮件');

    const second = await service.scan();
    expect(second.messages[0].codes[0]).toBe('482913');
    expect(fetchCount).toBe(3);
    expect(statuses.length).toBeGreaterThan(0);
  });
});
