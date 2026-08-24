import { describe, expect, it } from 'vitest';
import { PROVIDERS } from '../../electron/core/providers';
import { parseMailboxImport, parseTotpImport } from './importers';

describe('bulk import parsers', () => {
  it('imports simple mailbox lines and auto-detects providers', () => {
    const rows = parseMailboxImport('one@163.com----auth-one\ntwo@qq.com----auth-two', PROVIDERS);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ email: 'one@163.com', provider: '163', credential: 'auth-one' });
    expect(rows[1]).toMatchObject({ email: 'two@qq.com', provider: 'qq', credential: 'auth-two' });
  });

  it('accepts Chinese CSV headers and custom IMAP fields', () => {
    const rows = parseMailboxImport(
      '邮箱,授权码,服务商,名称,服务器,端口\nadmin@example.org,secret,自定义,企业邮箱,imap.example.org,993',
      PROVIDERS,
    );
    expect(rows[0]).toMatchObject({
      email: 'admin@example.org',
      provider: 'custom',
      label: '企业邮箱',
      imapHost: 'imap.example.org',
      imapPort: 993,
    });
  });

  it('uses the provider default authentication mode for simple imports', () => {
    const [outlook] = parseMailboxImport('demo@outlook.com----existing-oauth-token', PROVIDERS);
    expect(outlook).toMatchObject({ provider: 'outlook', authMode: 'oauth2' });
    const [enterprise] = parseMailboxImport('admin@example.cn----security-password----阿里企业', PROVIDERS);
    expect(enterprise).toMatchObject({ provider: 'aliyun-enterprise', imapHost: 'imap.qiye.aliyun.com' });
  });

  it('imports TOTP lines and otpauth links', () => {
    expect(parseTotpImport('主账户----JBSWY3DPEHPK3PXP----Example')[0]).toEqual({
      label: '主账户',
      secret: 'JBSWY3DPEHPK3PXP',
      issuer: 'Example',
    });
    const uri = 'otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP';
    expect(parseTotpImport(uri)[0]).toEqual({ label: '', secret: uri });
  });
});
