import { describe, expect, it } from 'vitest';
import { decodeBase32, generateTotp, normalizeBase32, parseTotpInput } from './totp';

describe('TOTP', () => {
  it('matches the RFC 6238 SHA1 test vector', () => {
    const result = generateTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', {
      timestamp: 59_000,
      digits: 8,
      period: 30,
      algorithm: 'SHA1',
    });
    expect(result.code).toBe('94287082');
    expect(result.secondsRemaining).toBe(1);
  });

  it('normalizes and decodes formatted Base32 secrets', () => {
    expect(normalizeBase32('jbsw-y3dp ehpk3pxp===')).toBe('JBSWY3DPEHPK3PXP');
    expect(decodeBase32('JBSWY3DPEHPK3PXP').toString('hex')).toBe('48656c6c6f21deadbeef');
  });

  it('parses otpauth URI metadata', () => {
    const parsed = parseTotpInput(
      'otpauth://totp/Example%20Co:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example%20Co&digits=8&period=60&algorithm=SHA256',
    );
    expect(parsed).toMatchObject({
      label: 'alice@example.com',
      issuer: 'Example Co',
      secret: 'JBSWY3DPEHPK3PXP',
      digits: 8,
      period: 60,
      algorithm: 'SHA256',
    });
  });

  it('rejects malformed secrets', () => {
    expect(() => decodeBase32('NOT-A-VALID-SECRET-1')).toThrow(/Base32/);
  });
});
