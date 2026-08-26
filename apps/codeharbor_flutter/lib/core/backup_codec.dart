import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:pointycastle/export.dart';

import '../models/models.dart';

enum BackupScope { all, accounts, totp }

class BackupCodec {
  static const _aad = 'CodeHarbor encrypted backup v1';
  static const _scryptN = 16384;
  static const _scryptR = 8;
  static const _scryptP = 1;
  static const _maxItems = 500;

  Uint8List encrypt(
    VaultData data,
    String password, {
    required String appVersion,
    BackupScope scope = BackupScope.all,
    DateTime? now,
    Uint8List? salt,
    Uint8List? iv,
  }) {
    _validatePassword(password);
    if (data.accounts.length > _maxItems ||
        data.totpEntries.length > _maxItems) {
      throw const FormatException('备份项目超过 500 项安全限制');
    }
    final actualSalt = salt ?? _randomBytes(16);
    final actualIv = iv ?? _randomBytes(12);
    if (actualSalt.length != 16 || actualIv.length != 12) {
      throw ArgumentError('salt/iv 长度无效');
    }
    final payload = <String, Object?>{
      'format': 'codeharbor-portable-vault',
      'schemaVersion': 1,
      'appVersion': appVersion,
      'exportedAt': (now ?? DateTime.now()).toUtc().toIso8601String(),
      'accounts': scope == BackupScope.totp
          ? const <Object?>[]
          : data.accounts.map((item) => item.toJson()).toList(),
      'totpEntries': scope == BackupScope.accounts
          ? const <Object?>[]
          : data.totpEntries.map((item) => item.toJson()).toList(),
      'settings': data.settings.toJson(),
    };
    final key = _deriveKey(password, actualSalt);
    final cipher = GCMBlockCipher(AESEngine())
      ..init(
        true,
        AEADParameters(
          KeyParameter(key),
          128,
          actualIv,
          Uint8List.fromList(utf8.encode(_aad)),
        ),
      );
    final combined = cipher.process(
      Uint8List.fromList(utf8.encode(jsonEncode(payload))),
    );
    final tag = combined.sublist(combined.length - 16);
    final ciphertext = combined.sublist(0, combined.length - 16);
    final envelope = <String, Object?>{
      'format': 'codeharbor-encrypted-backup',
      'version': 1,
      'kdf': {
        'name': 'scrypt',
        'salt': base64Encode(actualSalt),
        'n': _scryptN,
        'r': _scryptR,
        'p': _scryptP,
      },
      'cipher': {
        'name': 'aes-256-gcm',
        'iv': base64Encode(actualIv),
        'tag': base64Encode(tag),
      },
      'ciphertext': base64Encode(ciphertext),
    };
    return Uint8List.fromList(
      utf8.encode('${const JsonEncoder.withIndent('  ').convert(envelope)}\n'),
    );
  }

  VaultData decrypt(Uint8List serialized, String password) {
    _validatePassword(password);
    try {
      final envelope =
          jsonDecode(utf8.decode(serialized)) as Map<String, Object?>;
      final kdf = envelope['kdf']! as Map<String, Object?>;
      final cipherInfo = envelope['cipher']! as Map<String, Object?>;
      if (envelope['format'] != 'codeharbor-encrypted-backup' ||
          envelope['version'] != 1 ||
          kdf['name'] != 'scrypt' ||
          kdf['n'] != _scryptN ||
          kdf['r'] != _scryptR ||
          kdf['p'] != _scryptP ||
          cipherInfo['name'] != 'aes-256-gcm') {
        throw const FormatException('备份文件版本或加密参数不受支持');
      }
      final salt = base64Decode(kdf['salt']! as String);
      final iv = base64Decode(cipherInfo['iv']! as String);
      final tag = base64Decode(cipherInfo['tag']! as String);
      final ciphertext = base64Decode(envelope['ciphertext']! as String);
      if (salt.length != 16 ||
          iv.length != 12 ||
          tag.length != 16 ||
          ciphertext.isEmpty) {
        throw const FormatException('备份文件结构无效');
      }
      final cipher = GCMBlockCipher(AESEngine())
        ..init(
          false,
          AEADParameters(
            KeyParameter(_deriveKey(password, salt)),
            128,
            iv,
            Uint8List.fromList(utf8.encode(_aad)),
          ),
        );
      final combined = Uint8List.fromList([...ciphertext, ...tag]);
      final payload =
          jsonDecode(utf8.decode(cipher.process(combined)))
              as Map<String, Object?>;
      if (payload['format'] != 'codeharbor-portable-vault' ||
          payload['schemaVersion'] != 1) {
        throw const FormatException('备份内容格式不受支持');
      }
      return VaultData.fromJson({
        'schemaVersion': 1,
        'accounts': payload['accounts'],
        'totpEntries': payload['totpEntries'],
        'settings': payload['settings'],
      });
    } on FormatException {
      rethrow;
    } catch (_) {
      throw const FormatException('备份密码不正确，或备份文件已经损坏');
    }
  }

  VaultData merge(VaultData current, VaultData incoming, BackupScope scope) {
    final accounts = scope == BackupScope.totp
        ? current.accounts
        : _mergeByIdOrKey<MailAccount>(
            current.accounts,
            incoming.accounts,
            (item) => item.id,
            (item) => '${item.provider.wireName}:${item.email.toLowerCase()}',
          );
    final totpEntries = scope == BackupScope.accounts
        ? current.totpEntries
        : _mergeByIdOrKey<TotpEntry>(
            current.totpEntries,
            incoming.totpEntries,
            (item) => item.id,
            (item) =>
                '${item.issuer.toLowerCase()}:${item.label.toLowerCase()}',
          );
    return VaultData(
      accounts: accounts,
      totpEntries: totpEntries,
      settings: scope == BackupScope.all ? incoming.settings : current.settings,
    );
  }

  List<T> _mergeByIdOrKey<T>(
    List<T> current,
    List<T> incoming,
    String Function(T) idOf,
    String Function(T) keyOf,
  ) {
    final result = [...current];
    for (final item in incoming) {
      final index = result.indexWhere(
        (existing) =>
            idOf(existing) == idOf(item) || keyOf(existing) == keyOf(item),
      );
      if (index < 0) {
        result.add(item);
      } else {
        result[index] = item;
      }
    }
    if (result.length > _maxItems) {
      throw const FormatException('导入后项目超过 500 项安全限制');
    }
    return result;
  }

  Uint8List _deriveKey(String password, Uint8List salt) {
    final derivator = Scrypt()
      ..init(ScryptParameters(_scryptN, _scryptR, _scryptP, 32, salt));
    final output = Uint8List(32);
    derivator.deriveKey(
      Uint8List.fromList(utf8.encode(password)),
      0,
      output,
      0,
    );
    return output;
  }

  void _validatePassword(String password) {
    if (password.length < 8 || password.length > 128) {
      throw const FormatException('备份密码必须为 8–128 个字符');
    }
  }

  Uint8List _randomBytes(int length) {
    final random = Random.secure();
    return Uint8List.fromList(
      List.generate(length, (_) => random.nextInt(256)),
    );
  }
}
