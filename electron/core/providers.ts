import type { ProviderId, ProviderPreset } from '../../src/shared/contracts';

export const PROVIDERS: ProviderPreset[] = [
  {
    id: '163',
    name: '网易 163 邮箱',
    shortName: '163',
    host: 'imap.163.com',
    port: 993,
    secure: true,
    domains: ['163.com', 'yeah.net', 'vip.163.com'],
    credentialLabel: '客户端授权码',
    help: '请在网易邮箱设置中开启 IMAP/SMTP，并使用客户端授权码。',
    accent: '#3ddc97',
  },
  {
    id: '126',
    name: '网易 126 邮箱',
    shortName: '126',
    host: 'imap.126.com',
    port: 993,
    secure: true,
    domains: ['126.com', 'vip.126.com'],
    credentialLabel: '客户端授权码',
    help: '请在 126 邮箱设置中开启 IMAP/SMTP，并使用客户端授权码。',
    accent: '#54d2d2',
  },
  {
    id: 'qq',
    name: 'QQ / Foxmail 邮箱',
    shortName: 'QQ',
    host: 'imap.qq.com',
    port: 993,
    secure: true,
    domains: ['qq.com', 'foxmail.com', 'vip.qq.com'],
    credentialLabel: 'IMAP 授权码',
    help: '请在 QQ 邮箱账户设置中开启 IMAP 服务，并粘贴生成的授权码。',
    accent: '#54a7ff',
  },
  {
    id: 'gmail',
    name: 'Google Gmail',
    shortName: 'Gmail',
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    domains: ['gmail.com', 'googlemail.com'],
    credentialLabel: '应用专用密码 / OAuth2 令牌',
    help: '推荐使用 Google 应用专用密码；若选择 OAuth2，请输入有效访问令牌。',
    accent: '#ff6b6b',
  },
  {
    id: 'aliyun',
    name: '阿里邮箱',
    shortName: '阿里',
    host: 'imap.aliyun.com',
    port: 993,
    secure: true,
    domains: ['aliyun.com', 'alibaba-inc.com'],
    credentialLabel: '邮箱密码 / 客户端密码',
    help: '企业邮箱域名也可选择阿里邮箱；用户名通常为完整邮箱地址。',
    accent: '#ffad42',
  },
  {
    id: 'outlook',
    name: 'Microsoft Outlook / 365',
    shortName: '微软',
    host: 'outlook.office365.com',
    port: 993,
    secure: true,
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'office365.com'],
    credentialLabel: '应用密码 / OAuth2 令牌',
    help: 'Microsoft 推荐 OAuth2；租户若允许应用密码也可使用。',
    accent: '#6fa8ff',
  },
  {
    id: 'mailcom',
    name: 'Mail.com',
    shortName: 'Mail',
    host: 'imap.mail.com',
    port: 993,
    secure: true,
    domains: ['mail.com', 'email.com'],
    credentialLabel: '邮箱密码 / 应用密码',
    help: '请先确认账户套餐已开启 IMAP 访问。',
    accent: '#b792ff',
  },
  {
    id: 'custom',
    name: '自定义 IMAP',
    shortName: 'IMAP',
    host: '',
    port: 993,
    secure: true,
    domains: [],
    credentialLabel: '邮箱密码 / 授权码',
    help: '适用于企业邮箱及其他支持 IMAP 的邮箱服务。',
    accent: '#93a4a0',
  },
];

export function getProvider(id: ProviderId): ProviderPreset {
  return PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[PROVIDERS.length - 1];
}

export function detectProvider(email: string): ProviderId {
  const domain = email.trim().toLowerCase().split('@').pop() ?? '';
  const found = PROVIDERS.find((provider) => provider.domains.includes(domain));
  return found?.id ?? 'custom';
}

export function resolveImapSettings(
  providerId: ProviderId,
  customHost?: string,
  customPort?: number,
  customSecure?: boolean,
): { host: string; port: number; secure: boolean } {
  const provider = getProvider(providerId);
  return {
    host: (providerId === 'custom' ? customHost : provider.host)?.trim() ?? '',
    port: providerId === 'custom' ? customPort ?? 993 : provider.port,
    secure: providerId === 'custom' ? customSecure ?? true : provider.secure,
  };
}
