import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';

import '../models/models.dart';

class VaultRepository {
  VaultRepository({
    FlutterSecureStorage? secureStorage,
    Future<Directory> Function()? directoryProvider,
  }) : _secureStorage = secureStorage ?? const FlutterSecureStorage(),
       _directoryProvider = directoryProvider ?? getApplicationSupportDirectory;

  static const _masterKeyName = 'codeharbor.vault.master.v1';
  static const _aad = 'CodeHarbor device vault v1';
  final FlutterSecureStorage _secureStorage;
  final Future<Directory> Function() _directoryProvider;
  final AesGcm _algorithm = AesGcm.with256bits();

  late File _vaultFile;
  late SecretKey _masterKey;

  Future<VaultData> initialize() async {
    final directory = await _directoryProvider();
    await directory.create(recursive: true);
    _vaultFile = File('${directory.path}${Platform.pathSeparator}vault-v1.enc');
    _masterKey = SecretKey(await _loadOrCreateMasterKey());
    if (!await _vaultFile.exists()) {
      const empty = VaultData();
      await save(empty);
      return empty;
    }
    try {
      return await _decrypt(await _vaultFile.readAsString());
    } catch (_) {
      throw StateError('无法解密本机保险库。请不要删除系统钥匙串中的 CodeHarbor 密钥。');
    }
  }

  Future<void> save(VaultData data) async {
    final cleartext = Uint8List.fromList(
      utf8.encode(jsonEncode(data.toJson())),
    );
    final box = await _algorithm.encrypt(
      cleartext,
      secretKey: _masterKey,
      aad: utf8.encode(_aad),
    );
    final envelope = jsonEncode({
      'format': 'codeharbor-device-vault',
      'version': 1,
      'nonce': base64Encode(box.nonce),
      'mac': base64Encode(box.mac.bytes),
      'ciphertext': base64Encode(box.cipherText),
    });
    final temporary = File('${_vaultFile.path}.tmp');
    await temporary.writeAsString(envelope, flush: true);
    if (await _vaultFile.exists()) await _vaultFile.delete();
    await temporary.rename(_vaultFile.path);
  }

  Future<VaultData> _decrypt(String serialized) async {
    final envelope = jsonDecode(serialized) as Map<String, Object?>;
    if (envelope['format'] != 'codeharbor-device-vault' ||
        envelope['version'] != 1) {
      throw const FormatException('不支持的保险库格式');
    }
    final cleartext = await _algorithm.decrypt(
      SecretBox(
        base64Decode(envelope['ciphertext']! as String),
        nonce: base64Decode(envelope['nonce']! as String),
        mac: Mac(base64Decode(envelope['mac']! as String)),
      ),
      secretKey: _masterKey,
      aad: utf8.encode(_aad),
    );
    return VaultData.fromJson(
      jsonDecode(utf8.decode(cleartext)) as Map<String, Object?>,
    );
  }

  Future<Uint8List> _loadOrCreateMasterKey() async {
    final stored = await _secureStorage.read(key: _masterKeyName);
    if (stored != null) {
      final decoded = base64Decode(stored);
      if (decoded.length == 32) return decoded;
      throw StateError('系统钥匙串中的 CodeHarbor 主密钥无效');
    }
    final random = Random.secure();
    final key = Uint8List.fromList(
      List.generate(32, (_) => random.nextInt(256)),
    );
    await _secureStorage.write(key: _masterKeyName, value: base64Encode(key));
    return key;
  }
}
