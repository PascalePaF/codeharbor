import { describe, expect, it } from 'vitest';
import { extractVerificationCodes, makePreview, stripHtml } from './code-extractor';

describe('verification code extraction', () => {
  it('prioritizes a six-digit code near a Chinese keyword', () => {
    const codes = extractVerificationCodes('您的登录验证码是 482 913', '该验证码 10 分钟内有效，请勿分享。');
    expect(codes[0]).toBe('482913');
  });

  it('extracts an alphanumeric code only when contextualized', () => {
    expect(extractVerificationCodes('Security code: A7F9K2', 'Use this code to sign in.')).toContain('A7F9K2');
    expect(extractVerificationCodes('Newsletter ABCDEF', 'A normal marketing message.')).not.toContain('ABCDEF');
  });

  it('filters likely years', () => {
    expect(extractVerificationCodes('2026 年度报告', '这不是验证码邮件')).not.toContain('2026');
  });

  it('turns HTML into a concise text preview', () => {
    const text = stripHtml('<style>.x{}</style><p>Hello&nbsp;<b>world</b></p>');
    expect(text).toBe('Hello world');
    expect(makePreview('a'.repeat(180), 20)).toHaveLength(20);
  });
});
