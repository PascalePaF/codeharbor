import Papa from 'papaparse';
import type {
  AuthMode,
  MailAccountInput,
  ProviderId,
  ProviderPreset,
  TotpAlgorithm,
  TotpInput,
} from '../shared/contracts';

type Row = Record<string, unknown>;

const HEADER_ALIASES = {
  email: ['email', '邮箱', '邮箱地址', 'address', 'mail'],
  credential: ['credential', 'password', 'pass', '密码', '授权码', '客户端授权码', 'token', 'access_token'],
  provider: ['provider', '服务商', '邮箱类型', '类型', 'vendor'],
  label: ['label', 'name', '名称', '备注', '昵称'],
  username: ['username', 'user', '用户名', '账号'],
  authMode: ['authmode', 'auth_mode', 'auth', '认证方式'],
  host: ['imaphost', 'imap_host', 'host', 'imap服务器', '服务器'],
  port: ['imapport', 'imap_port', 'port', '端口'],
  secure: ['secure', 'tls', 'ssl', '加密'],
} as const;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function pick(row: Row, aliases: readonly string[]): string {
  const normalizedAliases = aliases.map(normalizeHeader);
  const entry = Object.entries(row).find(([key]) => normalizedAliases.includes(normalizeHeader(key)));
  return entry?.[1] === undefined || entry[1] === null ? '' : String(entry[1]).trim();
}

function booleanValue(value: string, fallback = true): boolean {
  if (!value) return fallback;
  return !['false', '0', 'no', '否', '关闭', 'off'].includes(value.trim().toLowerCase());
}

export function detectProvider(email: string, providers: ProviderPreset[]): ProviderId {
  const domain = email.trim().toLowerCase().split('@').pop() ?? '';
  return providers.find((provider) => provider.domains.includes(domain))?.id ?? 'custom';
}

export function normalizeProvider(value: string, email: string, providers: ProviderPreset[]): ProviderId {
  const normalized = value.trim().toLowerCase().replace(/[\s._-]/g, '');
  const aliases: Record<string, ProviderId> = {
    '163': '163',
    '163com': '163',
    网易163: '163',
    '126': '126',
    '126com': '126',
    网易126: '126',
    qq: 'qq',
    foxmail: 'qq',
    腾讯: 'qq',
    gmail: 'gmail',
    google: 'gmail',
    谷歌: 'gmail',
    aliyun: 'aliyun',
    alibaba: 'aliyun',
    阿里: 'aliyun',
    阿里云: 'aliyun',
    outlook: 'outlook',
    hotmail: 'outlook',
    microsoft: 'outlook',
    office365: 'outlook',
    微软: 'outlook',
    mailcom: 'mailcom',
    mail: 'mailcom',
    custom: 'custom',
    imap: 'custom',
    自定义: 'custom',
  };
  return aliases[normalized] ?? detectProvider(email, providers);
}

function normalizeAuthMode(value: string): AuthMode {
  return /oauth|token|令牌/i.test(value) ? 'oauth2' : 'password';
}

function fromMailboxRow(row: Row, providers: ProviderPreset[]): MailAccountInput {
  const email = pick(row, HEADER_ALIASES.email);
  const credential = pick(row, HEADER_ALIASES.credential);
  const provider = normalizeProvider(pick(row, HEADER_ALIASES.provider), email, providers);
  const preset = providers.find((item) => item.id === provider);
  const portValue = Number(pick(row, HEADER_ALIASES.port));
  return {
    label: pick(row, HEADER_ALIASES.label) || email,
    email,
    provider,
    username: pick(row, HEADER_ALIASES.username) || email,
    credential,
    authMode: normalizeAuthMode(pick(row, HEADER_ALIASES.authMode)),
    imapHost: pick(row, HEADER_ALIASES.host) || preset?.host,
    imapPort: Number.isInteger(portValue) && portValue > 0 ? portValue : preset?.port ?? 993,
    secure: booleanValue(pick(row, HEADER_ALIASES.secure), preset?.secure ?? true),
    enabled: true,
  };
}

function hasMailboxHeader(firstLine: string): boolean {
  const normalized = normalizeHeader(firstLine);
  return ['email', '邮箱', 'address', 'credential', 'password', '授权码'].some((word) =>
    normalized.includes(normalizeHeader(word)),
  );
}

function splitSimpleLine(line: string): string[] {
  for (const separator of ['----', '\t', '|', ',']) {
    if (line.includes(separator)) return line.split(separator).map((value) => value.trim());
  }
  return [line.trim()];
}

export function parseMailboxImport(text: string, providers: ProviderPreset[]): MailAccountInput[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const firstLine = trimmed.split(/\r?\n/, 1)[0];

  if (!hasMailboxHeader(firstLine)) {
    return trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [email = '', credential = '', providerValue = '', label = ''] = splitSimpleLine(line);
        const provider = normalizeProvider(providerValue, email, providers);
        const preset = providers.find((item) => item.id === provider);
        return {
          label: label || email,
          email,
          provider,
          username: email,
          credential,
          authMode: 'password' as const,
          imapHost: preset?.host,
          imapPort: preset?.port,
          secure: preset?.secure ?? true,
          enabled: true,
        };
      });
  }

  const parsed = Papa.parse<Row>(trimmed, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length && !parsed.data.length) throw new Error(parsed.errors[0].message);
  return parsed.data.map((row) => fromMailboxRow(row, providers));
}

function normalizeAlgorithm(value: string): TotpAlgorithm {
  const normalized = value.trim().toUpperCase();
  return ['SHA256', 'SHA512'].includes(normalized) ? (normalized as TotpAlgorithm) : 'SHA1';
}

export function parseTotpImport(text: string): TotpInput[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.every((line) => line.toLowerCase().startsWith('otpauth://'))) {
    return lines.map((secret) => ({ label: '', secret }));
  }

  const firstLine = lines[0].toLowerCase();
  if (/label|name|名称|secret|密钥|issuer/.test(firstLine)) {
    const parsed = Papa.parse<Row>(trimmed, { header: true, skipEmptyLines: 'greedy' });
    return parsed.data.map((row) => {
      const find = (aliases: string[]) => pick(row, aliases);
      const digitsValue = Number(find(['digits', '位数']));
      const periodValue = Number(find(['period', '周期']));
      return {
        label: find(['label', 'name', '名称', '项目']),
        issuer: find(['issuer', '服务', '发行方']),
        secret: find(['secret', '密钥', 'key', 'otpauth']),
        digits: digitsValue === 8 ? 8 : 6,
        period: Number.isInteger(periodValue) && periodValue > 0 ? periodValue : 30,
        algorithm: normalizeAlgorithm(find(['algorithm', '算法'])),
      };
    });
  }

  return lines.map((line) => {
    if (line.toLowerCase().startsWith('otpauth://')) return { label: '', secret: line };
    const [label = '', secret = '', issuer = ''] = splitSimpleLine(line);
    return { label, secret, issuer };
  });
}

export const MAILBOX_SAMPLE = `email,password,provider,label,username,auth_mode,imap_host,imap_port,tls
demo@163.com,在此填写授权码,163,工作邮箱,demo@163.com,password,,,true
demo@gmail.com,在此填写应用专用密码,gmail,Google 邮箱,demo@gmail.com,password,,,true
custom@example.com,在此填写密码,custom,企业邮箱,custom@example.com,password,imap.example.com,993,true`;

export const TOTP_SAMPLE = `label,secret,issuer,digits,period,algorithm
示例账户,JBSWY3DPEHPK3PXP,示例服务,6,30,SHA1`;
