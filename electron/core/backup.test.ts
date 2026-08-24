import { describe, expect, it } from 'vitest';
import { decryptPortableBackup, encryptPortableBackup, type PortableVaultBackup } from './backup';

const sample: PortableVaultBackup = {
  format: 'codeharbor-portable-vault',
  schemaVersion: 1,
  appVersion: '1.0.1',
  exportedAt: '2026-08-24T00:00:00.000Z',
  accounts: [{
    id: 'mail-1',
    label: '测试邮箱',
    email: 'demo@gmail.com',
    provider: 'gmail',
    username: 'demo@gmail.com',
    credential: 'abcd efgh ijkl mnop',
    authMode: 'password',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    secure: true,
    enabled: true,
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
  }],
  totpEntries: [{
    id: 'totp-1',
    label: '测试 2FA',
    issuer: 'CodeHarbor',
    secret: 'JBSWY3DPEHPK3PXP',
    digits: 6,
    period: 30,
    algorithm: 'SHA1',
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
  }],
  settings: {
    pollIntervalMinutes: 2,
    scanWindowHours: 24,
    maxMessagesPerAccount: 30,
    autoRefresh: false,
  },
};

describe('portable encrypted backups', () => {
  it('round-trips all portable data without plaintext secrets in the envelope', async () => {
    const encrypted = await encryptPortableBackup(sample, 'correct horse battery staple');
    expect(encrypted.toString('utf8')).not.toContain('abcd efgh');
    expect(encrypted.toString('utf8')).not.toContain('JBSWY3DPEHPK3PXP');
    await expect(decryptPortableBackup(encrypted, 'correct horse battery staple')).resolves.toEqual(sample);
  });

  it('rejects a wrong password and tampered ciphertext', async () => {
    const encrypted = await encryptPortableBackup(sample, 'correct horse battery staple');
    await expect(decryptPortableBackup(encrypted, 'wrong password')).rejects.toThrow('备份密码不正确');
    const envelope = JSON.parse(encrypted.toString('utf8')) as { ciphertext: string };
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -4)}AAAA`;
    await expect(decryptPortableBackup(JSON.stringify(envelope), 'correct horse battery staple')).rejects.toThrow('备份密码不正确');
  });

  it('requires a meaningful backup password', async () => {
    await expect(encryptPortableBackup(sample, 'short')).rejects.toThrow('至少需要 8 个字符');
  });
});
