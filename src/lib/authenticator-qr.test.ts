import { describe, expect, it } from 'vitest';
import { parseAuthenticatorQrPayload } from './authenticator-qr';

function varint(value: number): number[] {
  const result: number[] = [];
  let current = value;
  do {
    let byte = current & 0x7f;
    current = Math.floor(current / 128);
    if (current) byte |= 0x80;
    result.push(byte);
  } while (current);
  return result;
}

function bytesField(field: number, value: Uint8Array | string): number[] {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...varint((field << 3) | 2), ...varint(bytes.length), ...bytes];
}

function numberField(field: number, value: number): number[] {
  return [...varint(field << 3), ...varint(value)];
}

describe('authenticator QR import', () => {
  it('parses a standard otpauth TOTP QR payload', () => {
    const source = 'otpauth://totp/Example:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&digits=8&algorithm=SHA256';
    const result = parseAuthenticatorQrPayload(source);
    expect(result.format).toBe('otpauth');
    expect(result.entries).toEqual([{
      label: 'alice@example.com',
      issuer: 'Example',
      secret: source,
      digits: 8,
      period: 30,
      algorithm: 'SHA256',
    }]);
  });

  it('parses Google Authenticator migration protobuf and reports multi-QR batches', () => {
    const otp = Uint8Array.from([
      ...bytesField(1, Uint8Array.from([72, 101, 108, 108, 111, 33, 222, 173, 190, 239])),
      ...bytesField(2, 'Example:alice@example.com'),
      ...bytesField(3, 'Example'),
      ...numberField(4, 1),
      ...numberField(5, 1),
      ...numberField(6, 2),
    ]);
    const migration = Uint8Array.from([
      ...bytesField(1, otp),
      ...numberField(2, 1),
      ...numberField(3, 2),
      ...numberField(4, 0),
      ...numberField(5, 12345),
    ]);
    const data = Buffer.from(migration).toString('base64url');
    const result = parseAuthenticatorQrPayload(`otpauth-migration://offline?data=${data}`);
    expect(result.format).toBe('google-authenticator');
    expect(result.entries[0]).toMatchObject({
      label: 'alice@example.com',
      issuer: 'Example',
      secret: 'JBSWY3DPEHPK3PXP',
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
    });
    expect(result.warnings[0]).toContain('第 1/2 张');
  });

  it('rejects login and recovery QR codes', () => {
    expect(() => parseAuthenticatorQrPayload('https://chatgpt.com/auth/login?token=test'))
      .toThrow('仅支持 TOTP');
    expect(() => parseAuthenticatorQrPayload(
      'otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&algorithm=MD5',
    )).toThrow('不支持');
  });
});
