import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import 'core/backup_codec.dart';
import 'core/authenticator_qr.dart';
import 'core/providers.dart';
import 'core/totp.dart';
import 'models/models.dart';
import 'services/mail_service.dart';
import 'services/vault_repository.dart';

class AppController extends ChangeNotifier {
  AppController({
    VaultRepository? vault,
    MailService? mail,
    BackupCodec? backup,
  }) : _vault = vault ?? VaultRepository(),
       _mail = mail ?? const MailService(),
       _backup = backup ?? BackupCodec();

  static const appVersion = '1.0.3';
  final VaultRepository _vault;
  final MailService _mail;
  final BackupCodec _backup;
  final Uuid _uuid = const Uuid();

  VaultData data = const VaultData();
  List<VerificationMessage> messages = const [];
  Map<String, AccountCheck> accountChecks = const {};
  bool ready = false;
  bool busy = false;
  String? scanningAccountId;
  DateTime? lastScan;
  Object? startupError;
  Timer? _ticker;
  Timer? _automaticScan;

  Future<void> initialize() async {
    try {
      data = await _vault.initialize();
      ready = true;
      _ticker = Timer.periodic(
        const Duration(seconds: 1),
        (_) => notifyListeners(),
      );
      _configureAutomaticScan();
    } catch (error) {
      startupError = error;
    }
    notifyListeners();
  }

  Future<void> saveAccount({
    String? id,
    required String label,
    required String email,
    required ProviderId provider,
    required String username,
    required String credential,
    required AuthMode authMode,
    required String imapHost,
    required int imapPort,
    required bool secure,
    bool enabled = true,
  }) async {
    final cleanEmail = email.trim().toLowerCase();
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(cleanEmail)) {
      throw const FormatException('请输入有效的邮箱地址');
    }
    if (label.trim().isEmpty || username.trim().isEmpty) {
      throw const FormatException('账户名称和登录用户名不能为空');
    }
    MailAccount? existing;
    if (id != null) {
      for (final item in data.accounts) {
        if (item.id == id) {
          existing = item;
          break;
        }
      }
    }
    final preset = providerFor(provider);
    final host = provider == ProviderId.custom ? imapHost.trim() : preset.host;
    final port = provider == ProviderId.custom ? imapPort : preset.port;
    final useSecure = provider == ProviderId.custom ? secure : preset.secure;
    final nextCredential = credential.trim().isEmpty && existing != null
        ? existing.credential
        : credential.trim();
    if (host.isEmpty || port < 1 || port > 65535 || nextCredential.isEmpty) {
      throw const FormatException('请填写有效的 IMAP 地址、端口和认证凭据');
    }
    final now = DateTime.now().toUtc();
    final account = MailAccount(
      id: existing?.id ?? _uuid.v4(),
      label: label.trim(),
      email: cleanEmail,
      provider: provider,
      username: username.trim(),
      credential: nextCredential,
      authMode: authMode,
      imapHost: host,
      imapPort: port,
      secure: useSecure,
      enabled: enabled,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    );
    final accounts = [...data.accounts];
    final index = accounts.indexWhere(
      (item) =>
          item.id == account.id ||
          (item.email == account.email && item.provider == account.provider),
    );
    if (index < 0) {
      if (accounts.length >= 500) {
        throw const FormatException('最多保存 500 个邮箱账户');
      }
      accounts.add(account);
    } else {
      accounts[index] = account;
    }
    await _replace(data.copyWith(accounts: accounts));
  }

  Future<void> removeAccount(String id) async {
    await _replace(
      data.copyWith(
        accounts: data.accounts.where((item) => item.id != id).toList(),
      ),
    );
    messages = messages.where((item) => item.accountId != id).toList();
    notifyListeners();
  }

  Future<void> setAccountEnabled(String id, bool enabled) async {
    final accounts = data.accounts
        .map(
          (item) => item.id == id
              ? item.copyWith(
                  enabled: enabled,
                  updatedAt: DateTime.now().toUtc(),
                )
              : item,
        )
        .toList();
    await _replace(data.copyWith(accounts: accounts));
  }

  Future<AccountCheck> testAccount(String id) async {
    final account = data.accounts.firstWhere((item) => item.id == id);
    final check = await _mail.testAccount(account);
    accountChecks = {...accountChecks, id: check};
    notifyListeners();
    return check;
  }

  Future<MailScanResult> scan({String? accountId, bool silent = false}) async {
    if (busy) {
      throw StateError('已有扫描任务正在进行');
    }
    busy = true;
    scanningAccountId = accountId ?? 'all';
    notifyListeners();
    try {
      final targets = accountId == null
          ? data.accounts
          : data.accounts.where((item) => item.id == accountId).toList();
      final result = await _mail.scan(targets, settings: data.settings);
      final nextChecks = {...accountChecks};
      for (final check in result.statuses) {
        nextChecks[check.accountId] = check;
      }
      accountChecks = nextChecks;
      messages =
          accountId == null
                ? result.messages
                : [
                    ...messages.where((item) => item.accountId != accountId),
                    ...result.messages,
                  ]
            ..sort((a, b) => b.receivedAt.compareTo(a.receivedAt));
      lastScan = result.scannedAt;
      return result;
    } finally {
      busy = false;
      scanningAccountId = null;
      notifyListeners();
    }
  }

  Future<void> saveTotp({
    String? id,
    required String label,
    required String issuer,
    required String source,
    required int digits,
    required int period,
    required TotpAlgorithm algorithm,
  }) async {
    TotpEntry? existing;
    if (id != null) {
      for (final item in data.totpEntries) {
        if (item.id == id) {
          existing = item;
          break;
        }
      }
    }
    if (source.trim().isEmpty && existing == null) {
      throw const FormatException('请输入 Base32 密钥或 otpauth:// 链接');
    }
    final parsed = source.trim().isEmpty
        ? ParsedTotp(
            secret: existing!.secret,
            label: existing.label,
            issuer: existing.issuer,
            digits: existing.digits,
            period: existing.period,
            algorithm: existing.algorithm,
          )
        : parseTotp(source);
    final cleanLabel = label.trim().isEmpty
        ? parsed.label?.trim() ?? ''
        : label.trim();
    if (cleanLabel.isEmpty) throw const FormatException('请输入 2FA 名称');
    final now = DateTime.now().toUtc();
    final entry = TotpEntry(
      id: existing?.id ?? _uuid.v4(),
      label: cleanLabel,
      issuer: issuer.trim().isEmpty
          ? parsed.issuer?.trim() ?? ''
          : issuer.trim(),
      secret: parsed.secret,
      digits: source.trim().toLowerCase().startsWith('otpauth://')
          ? parsed.digits
          : digits,
      period: source.trim().toLowerCase().startsWith('otpauth://')
          ? parsed.period
          : period,
      algorithm: source.trim().toLowerCase().startsWith('otpauth://')
          ? parsed.algorithm
          : algorithm,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    );
    final entries = [...data.totpEntries];
    final index = entries.indexWhere(
      (item) =>
          item.id == entry.id ||
          (item.label.toLowerCase() == entry.label.toLowerCase() &&
              item.issuer.toLowerCase() == entry.issuer.toLowerCase()),
    );
    if (index < 0) {
      if (entries.length >= 500) {
        throw const FormatException('最多保存 500 个 2FA 项目');
      }
      entries.add(entry);
    } else {
      entries[index] = entry;
    }
    await _replace(data.copyWith(totpEntries: entries));
  }

  Future<({int created, int updated})> importAuthenticatorQr(
    AuthenticatorQrResult result,
  ) async {
    if (result.entries.isEmpty || result.entries.length > 500) {
      throw const FormatException('二维码中没有项目或超过 500 项限制');
    }
    final entries = [...data.totpEntries];
    var created = 0;
    var updated = 0;
    for (final item in result.entries) {
      final label = item.label.trim();
      final issuer = item.issuer.trim();
      if (label.isEmpty || label.length > 100 || issuer.length > 100) {
        throw const FormatException('二维码中的账户名称为空或超过 100 个字符');
      }
      final secret = normalizeBase32(item.secret);
      decodeBase32(secret);
      if (item.digits != 6 && item.digits != 8) {
        throw const FormatException('TOTP 位数仅支持 6 或 8 位');
      }
      if (item.period < 15 || item.period > 120) {
        throw const FormatException('TOTP 周期必须在 15–120 秒之间');
      }
      final index = entries.indexWhere(
        (entry) =>
            entry.label.toLowerCase() == label.toLowerCase() &&
            entry.issuer.toLowerCase() == issuer.toLowerCase(),
      );
      final now = DateTime.now().toUtc();
      final existing = index < 0 ? null : entries[index];
      final next = TotpEntry(
        id: existing?.id ?? _uuid.v4(),
        label: label,
        issuer: issuer,
        secret: secret,
        digits: item.digits,
        period: item.period,
        algorithm: item.algorithm,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      );
      if (index < 0) {
        if (entries.length >= 500) {
          throw const FormatException('最多保存 500 个 2FA 项目');
        }
        entries.add(next);
        created += 1;
      } else {
        entries[index] = next;
        updated += 1;
      }
    }
    await _replace(data.copyWith(totpEntries: entries));
    return (created: created, updated: updated);
  }

  Future<void> removeTotp(String id) async {
    await _replace(
      data.copyWith(
        totpEntries: data.totpEntries.where((item) => item.id != id).toList(),
      ),
    );
  }

  Future<void> updateSettings(AppSettings settings) async {
    await _replace(data.copyWith(settings: settings));
    _configureAutomaticScan();
  }

  Future<Uri?> exportBackup(BackupScope scope, String password) async {
    final bytes = _backup.encrypt(
      data,
      password,
      appVersion: appVersion,
      scope: scope,
    );
    final date = DateTime.now().toIso8601String().substring(0, 10);
    final prefix = switch (scope) {
      BackupScope.all => 'CodeHarbor-Backup',
      BackupScope.accounts => 'CodeHarbor-Mailboxes',
      BackupScope.totp => 'CodeHarbor-2FA',
    };
    return FilePicker.saveFile(
      fileName: '$prefix-$date.chbackup',
      bytes: bytes,
      mimeType: 'application/octet-stream',
    );
  }

  Future<bool> importBackup(BackupScope scope, String password) async {
    final picked = await FilePicker.pickFile(
      dialogTitle: '选择 CodeHarbor 加密备份',
      type: FileType.custom,
      allowedExtensions: const ['chbackup'],
    );
    if (picked == null) return false;
    final length = await picked.length();
    if (length < 1 || length > 25 * 1024 * 1024) {
      throw const FormatException('备份文件为空或超过 25 MiB 安全限制');
    }
    final bytes = await picked.readAsBytes();
    final incoming = _backup.decrypt(bytes, password);
    await _replace(_backup.merge(data, incoming, scope));
    messages = const [];
    lastScan = null;
    notifyListeners();
    return true;
  }

  Future<void> _replace(VaultData next) async {
    await _vault.save(next);
    data = next;
    notifyListeners();
  }

  void _configureAutomaticScan() {
    _automaticScan?.cancel();
    if (!data.settings.autoRefresh) return;
    _automaticScan = Timer.periodic(
      Duration(minutes: data.settings.pollIntervalMinutes),
      (_) {
        if (!busy && data.accounts.any((item) => item.enabled)) {
          unawaited(
            scan(silent: true).catchError(
              (_) => MailScanResult(const [], const [], DateTime.now().toUtc()),
            ),
          );
        }
      },
    );
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _automaticScan?.cancel();
    super.dispose();
  }
}
