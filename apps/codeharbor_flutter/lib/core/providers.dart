import '../models/models.dart';

class ProviderPreset {
  const ProviderPreset({
    required this.id,
    required this.name,
    required this.host,
    this.port = 993,
    this.secure = true,
    required this.domains,
    required this.credentialLabel,
    required this.help,
    this.authModes = const [AuthMode.password],
    this.defaultAuthMode = AuthMode.password,
  });

  final ProviderId id;
  final String name;
  final String host;
  final int port;
  final bool secure;
  final List<String> domains;
  final String credentialLabel;
  final String help;
  final List<AuthMode> authModes;
  final AuthMode defaultAuthMode;
}

const providers = <ProviderPreset>[
  ProviderPreset(
    id: ProviderId.netease163,
    name: '网易 163 邮箱',
    host: 'imap.163.com',
    domains: ['163.com', 'yeah.net', 'vip.163.com'],
    credentialLabel: '客户端授权码',
    help: '先在网页邮箱开启 IMAP，再填写网易生成的客户端授权码，不要填写网页登录密码。',
  ),
  ProviderPreset(
    id: ProviderId.netease126,
    name: '网易 126 邮箱',
    host: 'imap.126.com',
    domains: ['126.com', 'vip.126.com'],
    credentialLabel: '客户端授权码',
    help: '先在网页邮箱开启 IMAP，再填写网易生成的客户端授权码，不要填写网页登录密码。',
  ),
  ProviderPreset(
    id: ProviderId.qq,
    name: 'QQ / Foxmail 邮箱',
    host: 'imap.qq.com',
    domains: ['qq.com', 'foxmail.com', 'vip.qq.com'],
    credentialLabel: 'IMAP 授权码',
    help: '在 QQ 邮箱网页设置中开启 IMAP，并填写单独生成的授权码。',
  ),
  ProviderPreset(
    id: ProviderId.gmail,
    name: 'Google Gmail',
    host: 'imap.gmail.com',
    domains: ['gmail.com', 'googlemail.com'],
    credentialLabel: '16 位应用专用密码 / OAuth2 令牌',
    help: 'Google 的 6 位 2FA 不能作为 IMAP 密码。开启两步验证后生成 16 位应用专用密码，或使用有效 OAuth2 令牌。',
    authModes: [AuthMode.password, AuthMode.oauth2],
  ),
  ProviderPreset(
    id: ProviderId.aliyun,
    name: '阿里个人邮箱',
    host: 'imap.aliyun.com',
    domains: ['aliyun.com'],
    credentialLabel: '邮箱密码',
    help: '适用于 @aliyun.com 个人邮箱；先确认网页设置中已开启 IMAP。',
  ),
  ProviderPreset(
    id: ProviderId.aliyunEnterprise,
    name: '阿里企业邮箱',
    host: 'imap.qiye.aliyun.com',
    domains: [],
    credentialLabel: '三方客户端安全密码',
    help: '管理员需允许第三方客户端；用户填写单独生成的三方客户端安全密码。',
  ),
  ProviderPreset(
    id: ProviderId.outlook,
    name: 'Microsoft Outlook / 365',
    host: 'outlook.office365.com',
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
    credentialLabel: 'OAuth2 访问令牌',
    help: 'Microsoft IMAP 使用现代身份验证；普通密码和 6 位 2FA 不能直接用于登录。',
    authModes: [AuthMode.oauth2],
    defaultAuthMode: AuthMode.oauth2,
  ),
  ProviderPreset(
    id: ProviderId.mailcom,
    name: 'Mail.com',
    host: 'imap.mail.com',
    domains: ['mail.com', 'email.com'],
    credentialLabel: '应用密码 / 邮箱密码',
    help: '先在 Mail.com 设置中启用 IMAP；部分套餐可能不开放该功能。',
  ),
  ProviderPreset(
    id: ProviderId.custom,
    name: '自定义 IMAP',
    host: '',
    domains: [],
    credentialLabel: '邮箱密码 / 授权码 / OAuth2 令牌',
    help: '向邮箱服务商确认主机、端口、TLS 和第三方客户端凭据类型。',
    authModes: [AuthMode.password, AuthMode.oauth2],
  ),
];

ProviderPreset providerFor(ProviderId id) =>
    providers.firstWhere((item) => item.id == id);

ProviderId detectProvider(String email) {
  final domain = email.trim().toLowerCase().split('@').last;
  for (final provider in providers) {
    if (provider.domains.any(
      (known) => domain == known || domain.endsWith('.$known'),
    )) {
      return provider.id;
    }
  }
  return ProviderId.custom;
}
