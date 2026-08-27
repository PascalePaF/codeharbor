import decodeQR from 'qr/decode.js';

export function decodeQrPixels(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): string {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('二维码图片尺寸无效');
  }
  if (data.length !== width * height * 4) {
    throw new Error('二维码图片像素数据不完整');
  }
  let result: string;
  try {
    result = decodeQR({ data, width, height });
  } catch {
    throw new Error('图片中未识别到清晰的二维码，请尝试原图或提高对比度');
  }
  if (!result) throw new Error('图片中未识别到清晰的二维码，请尝试原图或提高对比度');
  return result;
}
