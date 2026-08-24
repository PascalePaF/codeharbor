import { describe, expect, it } from 'vitest';
import { detectProvider, resolveImapSettings } from './providers';

describe('provider presets', () => {
  it('detects common providers by email domain', () => {
    expect(detectProvider('hello@163.com')).toBe('163');
    expect(detectProvider('hello@foxmail.com')).toBe('qq');
    expect(detectProvider('hello@gmail.com')).toBe('gmail');
    expect(detectProvider('hello@outlook.com')).toBe('outlook');
    expect(detectProvider('hello@example.org')).toBe('custom');
  });

  it('uses preset values and preserves custom values', () => {
    expect(resolveImapSettings('qq')).toEqual({ host: 'imap.qq.com', port: 993, secure: true });
    expect(resolveImapSettings('custom', 'imap.example.org', 143, false)).toEqual({ host: 'imap.example.org', port: 143, secure: false });
  });
});
