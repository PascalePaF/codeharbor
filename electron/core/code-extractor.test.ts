import { describe, expect, it } from 'vitest';
import {
  extractChatGptLoginCodes,
  extractVerificationCodes,
  isOfficialChatGptOtpSender,
  makePreview,
  makeVerificationPurpose,
  stripHtml,
} from './code-extractor';

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

  it('ignores ordinary mail numbers without verification context', () => {
    expect(extractVerificationCodes('Your order has shipped', 'Tracking reference 482913 is on the way.'))
      .toEqual([]);
  });

  it('turns HTML into a concise text preview', () => {
    const text = stripHtml('<style>.x{}</style><p>Hello&nbsp;<b>world</b></p>');
    expect(text).toBe('Hello world');
    expect(makePreview('a'.repeat(180), 20)).toHaveLength(20);
  });

  it('builds a short purpose label without repeating the code', () => {
    expect(makeVerificationPurpose('Your ChatGPT login code is 482913', 'OpenAI <noreply@openai.com>', ['482913']))
      .toBe('Your ChatGPT login code is');
  });

  it('accepts only six-digit ChatGPT OTPs from the two official sender addresses', () => {
    expect(isOfficialChatGptOtpSender('OpenAI <noreply@tm.openai.com>')).toBe(true);
    expect(isOfficialChatGptOtpSender('otp@tm1.openai.com')).toBe(true);
    expect(extractChatGptLoginCodes(
      'OpenAI <otp@tm1.openai.com>',
      'Your ChatGPT code is 482 913',
      'Use this login code to continue.',
    )).toEqual(['482913']);
    expect(extractChatGptLoginCodes(
      'OpenAI Support <security@openai.example>',
      'Your ChatGPT verification code is 482913',
      '',
    )).toEqual([]);
    expect(extractChatGptLoginCodes(
      'noreply@tm.openai.com',
      'Workspace invitation',
      'Your invitation reference is 482913.',
    )).toEqual([]);
    expect(extractChatGptLoginCodes(
      'otp@tm1.openai.com',
      'Your login code is 48291312',
      '',
    )).toEqual([]);
  });
});
