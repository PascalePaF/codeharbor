import { describe, expect, it } from 'vitest';
import { friendlyConnectionError } from './mailbox';

describe('mailbox connection errors', () => {
  it('explains Gmail app-password authentication', () => {
    expect(friendlyConnectionError(new Error('AUTHENTICATIONFAILED Invalid credentials'), {
      provider: 'gmail',
      authMode: 'password',
      imapHost: 'imap.gmail.com',
      imapPort: 993,
    })).toContain('16 位“应用专用密码”');
  });

  it('turns socket timeouts into a recoverable diagnostic', () => {
    expect(friendlyConnectionError(Object.assign(new Error('Socket timeout'), { code: 'ETIMEOUT' }), {
      provider: '163',
      authMode: 'password',
      imapHost: 'imap.163.com',
      imapPort: 993,
    })).toBe('连接 imap.163.com:993 超时：请检查网络、代理或防火墙是否允许 TCP 993；也可能是服务器响应较慢');
  });
});
