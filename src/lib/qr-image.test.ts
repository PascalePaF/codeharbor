import encodeQR from 'qr';
import { describe, expect, it } from 'vitest';
import { decodeQrPixels } from './qr-image';

describe('desktop QR image decoder', () => {
  it('decodes an authenticator payload from image pixels', () => {
    const payload = 'otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&issuer=Example';
    const matrix = encodeQR(payload, 'raw', { scale: 8, border: 4 });
    const height = matrix.length;
    const width = matrix[0].length;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const color = matrix[y][x] ? 0 : 255;
        const offset = (y * width + x) * 4;
        pixels[offset] = color;
        pixels[offset + 1] = color;
        pixels[offset + 2] = color;
        pixels[offset + 3] = 255;
      }
    }
    expect(decodeQrPixels(pixels, width, height)).toBe(payload);
  });

  it('rejects invalid pixel dimensions before decoding', () => {
    expect(() => decodeQrPixels(new Uint8ClampedArray(4), 2, 2))
      .toThrow('像素数据不完整');
  });
});
