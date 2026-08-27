const KEYWORDS = [
  'verification code',
  'security code',
  'login code',
  'sign-in code',
  'one-time code',
  'one time password',
  'passcode',
  'otp',
  '验证码',
  '校验码',
  '动态码',
  '登录码',
  '安全码',
  '認証コード',
  '確認コード',
  '인증 코드',
  'sign in',
  'log in',
  'authenticate',
  'confirm your identity',
  'confirm your email',
  '登录',
  '身份验证',
  '验证身份',
  '確認',
  '認証',
];

const KEYWORD_PATTERN = new RegExp(KEYWORDS.join('|'), 'i');
const CHATGPT_OTP_SENDERS = new Set([
  'noreply@tm.openai.com',
  'otp@tm1.openai.com',
]);
const CHATGPT_OTP_CONTEXT = /chatgpt|verification|security|login|log[ -]?in|sign[ -]?in|one[ -]?time|passcode|\botp\b|验证码|登录|验证|認証|確認|인증/i;

function normalizeCandidate(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

function looksLikeYear(value: string): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  return year >= 1900 && year <= 2099;
}

function surroundingText(input: string, start: number, length: number, radius = 48): string {
  return input.slice(Math.max(0, start - radius), Math.min(input.length, start + length + radius));
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractVerificationCodes(subject: string, body: string): string[] {
  const haystacks = [
    { text: subject ?? '', subject: true },
    { text: body ?? '', subject: false },
  ];
  const scored = new Map<string, number>();

  for (const { text, subject: isSubject } of haystacks) {
    const patterns = [
      /(?<!\d)(\d(?:[\s-]?\d){3,7})(?!\d)/g,
      /(?<![A-Z0-9])([A-Z0-9]{6,10})(?![A-Z0-9])/gi,
    ];

    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const raw = match[1] ?? match[0];
        const code = normalizeCandidate(raw);
        if (code.length < 4 || code.length > 10 || looksLikeYear(code)) continue;
        const isAlphanumeric = /[A-Z]/.test(code) && /\d/.test(code);
        const isNumeric = /^\d+$/.test(code);
        if (!isNumeric && !isAlphanumeric) continue;

        const context = surroundingText(text, match.index ?? 0, raw.length, 96);
        const nearKeyword = KEYWORD_PATTERN.test(context);
        // A number alone is not enough evidence: order IDs, prices and tracking
        // numbers in ordinary mail must never enter the verification inbox.
        if (!nearKeyword) continue;

        let score = 0;
        if (isSubject) score += 6;
        if (nearKeyword) score += 8;
        if (code.length === 6) score += 5;
        if (code.length === 8) score += 3;
        if (isNumeric) score += 2;
        if (/^(\d)\1+$/.test(code)) score -= 4;
        scored.set(code, Math.max(scored.get(code) ?? Number.NEGATIVE_INFINITY, score));
      }
    }
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code]) => code);
}

export function isOfficialChatGptOtpSender(sender: string): boolean {
  const addresses = sender.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi) ?? [];
  const address = addresses.at(-1)?.toLowerCase() ?? '';
  return CHATGPT_OTP_SENDERS.has(address);
}

export function extractChatGptLoginCodes(sender: string, subject: string, body: string): string[] {
  if (!isOfficialChatGptOtpSender(sender)) return [];
  const results: string[] = [];
  for (const text of [subject ?? '', body ?? '']) {
    for (const match of text.matchAll(/(?<!\d)(\d(?:[\s-]?\d){5})(?!\d)/g)) {
      const raw = match[1] ?? match[0];
      const context = surroundingText(text, match.index ?? 0, raw.length, 128);
      if (!CHATGPT_OTP_CONTEXT.test(context)) continue;
      const code = normalizeCandidate(raw);
      if (!results.includes(code)) results.push(code);
      if (results.length >= 3) return results;
    }
  }
  return results;
}

export function makePreview(text: string, maxLength = 150): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

export function makeVerificationPurpose(subject: string, sender: string, codes: string[]): string {
  let cleaned = (subject || '').replace(/\s+/g, ' ').trim();
  for (const code of codes) {
    const flexibleCode = code.split('').map((character) =>
      character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    ).join('[\\s-]*');
    cleaned = cleaned.replace(new RegExp(flexibleCode, 'gi'), ' ');
  }
  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .replace(/[\s:：|—–-]+$/g, '')
    .trim();
  if (cleaned && cleaned !== '(无主题)' && cleaned.length <= 100) return cleaned;

  const senderName = sender.split('<')[0].replace(/["']/g, '').trim();
  if (senderName && !senderName.includes('@')) return `${senderName} 的验证码`;
  const address = sender.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+)/i);
  return address?.[1] ? `${address[1]} 的验证码` : '账户登录验证码';
}
