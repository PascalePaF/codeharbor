enum ProviderId {
  netease163('163'),
  netease126('126'),
  qq('qq'),
  gmail('gmail'),
  aliyun('aliyun'),
  aliyunEnterprise('aliyun-enterprise'),
  outlook('outlook'),
  mailcom('mailcom'),
  custom('custom');

  const ProviderId(this.wireName);
  final String wireName;

  static ProviderId fromWire(String? value) => values.firstWhere(
    (item) => item.wireName == value,
    orElse: () => ProviderId.custom,
  );
}

enum AuthMode {
  password('password'),
  oauth2('oauth2');

  const AuthMode(this.wireName);
  final String wireName;

  static AuthMode fromWire(String? value) =>
      value == 'oauth2' ? AuthMode.oauth2 : AuthMode.password;
}

enum TotpAlgorithm {
  sha1('SHA1'),
  sha256('SHA256'),
  sha512('SHA512');

  const TotpAlgorithm(this.wireName);
  final String wireName;

  static TotpAlgorithm fromWire(String? value) => values.firstWhere(
    (item) => item.wireName == value?.toUpperCase(),
    orElse: () => TotpAlgorithm.sha1,
  );
}

class MailAccount {
  const MailAccount({
    required this.id,
    required this.label,
    required this.email,
    required this.provider,
    required this.username,
    required this.credential,
    required this.authMode,
    required this.imapHost,
    required this.imapPort,
    required this.secure,
    required this.enabled,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String label;
  final String email;
  final ProviderId provider;
  final String username;
  final String credential;
  final AuthMode authMode;
  final String imapHost;
  final int imapPort;
  final bool secure;
  final bool enabled;
  final DateTime createdAt;
  final DateTime updatedAt;

  MailAccount copyWith({
    String? label,
    String? email,
    ProviderId? provider,
    String? username,
    String? credential,
    AuthMode? authMode,
    String? imapHost,
    int? imapPort,
    bool? secure,
    bool? enabled,
    DateTime? updatedAt,
  }) => MailAccount(
    id: id,
    label: label ?? this.label,
    email: email ?? this.email,
    provider: provider ?? this.provider,
    username: username ?? this.username,
    credential: credential ?? this.credential,
    authMode: authMode ?? this.authMode,
    imapHost: imapHost ?? this.imapHost,
    imapPort: imapPort ?? this.imapPort,
    secure: secure ?? this.secure,
    enabled: enabled ?? this.enabled,
    createdAt: createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );

  Map<String, Object?> toJson() => {
    'id': id,
    'label': label,
    'email': email,
    'provider': provider.wireName,
    'username': username,
    'credential': credential,
    'authMode': authMode.wireName,
    'imapHost': imapHost,
    'imapPort': imapPort,
    'secure': secure,
    'enabled': enabled,
    'createdAt': createdAt.toUtc().toIso8601String(),
    'updatedAt': updatedAt.toUtc().toIso8601String(),
  };

  factory MailAccount.fromJson(Map<String, Object?> json) => MailAccount(
    id: json['id'] as String,
    label: json['label'] as String,
    email: json['email'] as String,
    provider: ProviderId.fromWire(json['provider'] as String?),
    username: json['username'] as String,
    credential: json['credential'] as String,
    authMode: AuthMode.fromWire(json['authMode'] as String?),
    imapHost: json['imapHost'] as String,
    imapPort: (json['imapPort'] as num).toInt(),
    secure: json['secure'] as bool? ?? true,
    enabled: json['enabled'] as bool? ?? true,
    createdAt: DateTime.parse(json['createdAt'] as String),
    updatedAt: DateTime.parse(json['updatedAt'] as String),
  );
}

class TotpEntry {
  const TotpEntry({
    required this.id,
    required this.label,
    required this.issuer,
    required this.secret,
    required this.digits,
    required this.period,
    required this.algorithm,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String label;
  final String issuer;
  final String secret;
  final int digits;
  final int period;
  final TotpAlgorithm algorithm;
  final DateTime createdAt;
  final DateTime updatedAt;

  Map<String, Object?> toJson() => {
    'id': id,
    'label': label,
    'issuer': issuer,
    'secret': secret,
    'digits': digits,
    'period': period,
    'algorithm': algorithm.wireName,
    'createdAt': createdAt.toUtc().toIso8601String(),
    'updatedAt': updatedAt.toUtc().toIso8601String(),
  };

  factory TotpEntry.fromJson(Map<String, Object?> json) => TotpEntry(
    id: json['id'] as String,
    label: json['label'] as String,
    issuer: json['issuer'] as String? ?? '',
    secret: json['secret'] as String,
    digits: (json['digits'] as num?)?.toInt() == 8 ? 8 : 6,
    period: (json['period'] as num?)?.toInt() ?? 30,
    algorithm: TotpAlgorithm.fromWire(json['algorithm'] as String?),
    createdAt: DateTime.parse(json['createdAt'] as String),
    updatedAt: DateTime.parse(json['updatedAt'] as String),
  );
}

class AppSettings {
  const AppSettings({
    this.pollIntervalMinutes = 2,
    this.scanWindowHours = 24,
    this.maxMessagesPerAccount = 30,
    this.autoRefresh = false,
    this.theme = 'dark',
  });

  final int pollIntervalMinutes;
  final int scanWindowHours;
  final int maxMessagesPerAccount;
  final bool autoRefresh;
  final String theme;

  AppSettings copyWith({
    int? pollIntervalMinutes,
    int? scanWindowHours,
    int? maxMessagesPerAccount,
    bool? autoRefresh,
    String? theme,
  }) => AppSettings(
    pollIntervalMinutes: pollIntervalMinutes ?? this.pollIntervalMinutes,
    scanWindowHours: scanWindowHours ?? this.scanWindowHours,
    maxMessagesPerAccount: maxMessagesPerAccount ?? this.maxMessagesPerAccount,
    autoRefresh: autoRefresh ?? this.autoRefresh,
    theme: theme ?? this.theme,
  );

  Map<String, Object?> toJson() => {
    'pollIntervalMinutes': pollIntervalMinutes,
    'scanWindowHours': scanWindowHours,
    'maxMessagesPerAccount': maxMessagesPerAccount,
    'autoRefresh': autoRefresh,
    'theme': theme,
  };

  factory AppSettings.fromJson(Map<String, Object?> json) => AppSettings(
    pollIntervalMinutes: ((json['pollIntervalMinutes'] as num?)?.toInt() ?? 2)
        .clamp(1, 60),
    scanWindowHours: ((json['scanWindowHours'] as num?)?.toInt() ?? 24).clamp(
      1,
      168,
    ),
    maxMessagesPerAccount:
        ((json['maxMessagesPerAccount'] as num?)?.toInt() ?? 30).clamp(5, 100),
    autoRefresh: json['autoRefresh'] as bool? ?? false,
    theme: json['theme'] == 'light' ? 'light' : 'dark',
  );
}

class VerificationMessage {
  const VerificationMessage({
    required this.id,
    required this.accountId,
    required this.accountLabel,
    required this.accountEmail,
    required this.provider,
    required this.sender,
    required this.receivedAt,
    required this.codes,
    required this.purpose,
  });

  final String id;
  final String accountId;
  final String accountLabel;
  final String accountEmail;
  final ProviderId provider;
  final String sender;
  final DateTime receivedAt;
  final List<String> codes;
  final String purpose;
}

class VaultData {
  const VaultData({
    this.accounts = const [],
    this.totpEntries = const [],
    this.settings = const AppSettings(),
  });

  final List<MailAccount> accounts;
  final List<TotpEntry> totpEntries;
  final AppSettings settings;

  VaultData copyWith({
    List<MailAccount>? accounts,
    List<TotpEntry>? totpEntries,
    AppSettings? settings,
  }) => VaultData(
    accounts: accounts ?? this.accounts,
    totpEntries: totpEntries ?? this.totpEntries,
    settings: settings ?? this.settings,
  );

  Map<String, Object?> toJson() => {
    'schemaVersion': 1,
    'accounts': accounts.map((item) => item.toJson()).toList(),
    'totpEntries': totpEntries.map((item) => item.toJson()).toList(),
    'settings': settings.toJson(),
  };

  factory VaultData.fromJson(Map<String, Object?> json) {
    if (json['schemaVersion'] != 1) {
      throw const FormatException('不支持的保险库版本');
    }
    final rawAccounts = json['accounts'] as List<Object?>? ?? const [];
    final rawTotp = json['totpEntries'] as List<Object?>? ?? const [];
    if (rawAccounts.length > 500 || rawTotp.length > 500) {
      throw const FormatException('保险库项目超过 500 项安全限制');
    }
    return VaultData(
      accounts: rawAccounts
          .map((item) => MailAccount.fromJson(item! as Map<String, Object?>))
          .toList(growable: false),
      totpEntries: rawTotp
          .map((item) => TotpEntry.fromJson(item! as Map<String, Object?>))
          .toList(growable: false),
      settings: AppSettings.fromJson(json['settings']! as Map<String, Object?>),
    );
  }
}
