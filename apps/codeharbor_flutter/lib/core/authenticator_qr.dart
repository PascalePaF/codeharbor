import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import '../models/models.dart';
import 'totp.dart';

const _maxQrPayloadLength = 256 * 1024;
const _maxProtoFieldLength = 128 * 1024;
const _maxTotpEntries = 500;

class AuthenticatorQrItem {
  const AuthenticatorQrItem({
    required this.label,
    required this.issuer,
    required this.secret,
    required this.digits,
    required this.period,
    required this.algorithm,
  });

  final String label;
  final String issuer;
  final String secret;
  final int digits;
  final int period;
  final TotpAlgorithm algorithm;
}

class AuthenticatorQrResult {
  const AuthenticatorQrResult({
    required this.entries,
    required this.format,
    this.warnings = const [],
    this.batchIndex,
    this.batchSize,
  });

  final List<AuthenticatorQrItem> entries;
  final String format;
  final List<String> warnings;
  final int? batchIndex;
  final int? batchSize;
}

class _ProtoReader {
  _ProtoReader(this.bytes);

  final Uint8List bytes;
  int offset = 0;

  bool get done => offset >= bytes.length;

  int readVarint() {
    var result = 0;
    var shift = 0;
    for (var count = 0; count < 10; count += 1) {
      if (offset >= bytes.length) {
        throw const FormatException('二维码中的验证器数据不完整');
      }
      final byte = bytes[offset++];
      if (shift >= 63 && (byte & 0x7f) != 0) {
        throw const FormatException('二维码中的数值超出安全范围');
      }
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) == 0) return result;
      shift += 7;
    }
    throw const FormatException('二维码中的验证器数据无效');
  }

  Uint8List readBytes() {
    final length = readVarint();
    if (length < 0 ||
        length > _maxProtoFieldLength ||
        offset + length > bytes.length) {
      throw const FormatException('二维码中的验证器字段过大或不完整');
    }
    final value = Uint8List.sublistView(bytes, offset, offset + length);
    offset += length;
    return value;
  }

  void skip(int wireType) {
    switch (wireType) {
      case 0:
        readVarint();
        return;
      case 1:
        _advance(8);
        return;
      case 2:
        readBytes();
        return;
      case 5:
        _advance(4);
        return;
      default:
        throw const FormatException('二维码包含不支持的验证器字段');
    }
  }

  void _advance(int length) {
    if (offset + length > bytes.length) {
      throw const FormatException('二维码中的验证器数据不完整');
    }
    offset += length;
  }
}

class _MigrationOtp {
  Uint8List? secret;
  String name = '';
  String issuer = '';
  int algorithm = 1;
  int digits = 1;
  int type = 0;
}

String _base32Encode(Uint8List bytes) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  var buffer = 0;
  var bits = 0;
  final output = StringBuffer();
  for (final byte in bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output.write(alphabet[(buffer >> bits) & 31]);
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) output.write(alphabet[(buffer << (5 - bits)) & 31]);
  return output.toString();
}

Uint8List _decodeBase64Url(String value) {
  var normalized = value
      .trim()
      .replaceAll(' ', '+')
      .replaceAll('-', '+')
      .replaceAll('_', '/');
  normalized = normalized.padRight((normalized.length + 3) ~/ 4 * 4, '=');
  late final Uint8List decoded;
  try {
    decoded = base64Decode(normalized);
  } on FormatException {
    throw const FormatException('Google Authenticator 二维码的 Base64 数据无效');
  }
  if (decoded.isEmpty || decoded.length > _maxQrPayloadLength) {
    throw const FormatException('Google Authenticator 二维码为空或超过安全限制');
  }
  return decoded;
}

String _decodeText(Uint8List bytes) {
  try {
    return utf8.decode(bytes, allowMalformed: false).trim();
  } on FormatException {
    throw const FormatException('二维码中的账户名称不是有效的 UTF-8 文本');
  }
}

_MigrationOtp _parseOtpParameters(Uint8List bytes) {
  final reader = _ProtoReader(bytes);
  final item = _MigrationOtp();
  while (!reader.done) {
    final tag = reader.readVarint();
    final field = tag >> 3;
    final wire = tag & 7;
    if (field == 1 && wire == 2) {
      item.secret = reader.readBytes();
    } else if (field == 2 && wire == 2) {
      item.name = _decodeText(reader.readBytes());
    } else if (field == 3 && wire == 2) {
      item.issuer = _decodeText(reader.readBytes());
    } else if (field == 4 && wire == 0) {
      item.algorithm = reader.readVarint();
    } else if (field == 5 && wire == 0) {
      item.digits = reader.readVarint();
    } else if (field == 6 && wire == 0) {
      item.type = reader.readVarint();
    } else {
      reader.skip(wire);
    }
  }
  return item;
}

TotpAlgorithm? _algorithm(int value) => switch (value) {
  0 || 1 => TotpAlgorithm.sha1,
  2 => TotpAlgorithm.sha256,
  3 => TotpAlgorithm.sha512,
  _ => null,
};

String _cleanLabel(String name, String issuer) {
  final prefix = '$issuer:';
  return issuer.isNotEmpty &&
          name.toLowerCase().startsWith(prefix.toLowerCase())
      ? name.substring(prefix.length).trim()
      : name;
}

AuthenticatorQrResult _parseGoogleMigration(Uri uri) {
  final data = uri.queryParameters['data'];
  if (data == null || data.isEmpty) {
    throw const FormatException('Google Authenticator 二维码缺少迁移数据');
  }
  final reader = _ProtoReader(_decodeBase64Url(data));
  final raw = <_MigrationOtp>[];
  var batchSize = 1;
  var batchIndex = 0;
  while (!reader.done) {
    final tag = reader.readVarint();
    final field = tag >> 3;
    final wire = tag & 7;
    if (field == 1 && wire == 2) {
      raw.add(_parseOtpParameters(reader.readBytes()));
    } else if (field == 3 && wire == 0) {
      batchSize = reader.readVarint();
    } else if (field == 4 && wire == 0) {
      batchIndex = reader.readVarint();
    } else {
      reader.skip(wire);
    }
    if (raw.length > _maxTotpEntries) {
      throw const FormatException('二维码中的 2FA 项目超过 500 项限制');
    }
  }

  final entries = <AuthenticatorQrItem>[];
  var ignoredHotp = 0;
  var ignoredAlgorithm = 0;
  for (var index = 0; index < raw.length; index += 1) {
    final item = raw[index];
    if (item.type == 1) {
      ignoredHotp += 1;
      continue;
    }
    final algorithm = _algorithm(item.algorithm);
    if (algorithm == null) {
      ignoredAlgorithm += 1;
      continue;
    }
    if (item.secret == null || item.secret!.isEmpty) continue;
    final issuer = item.issuer.substring(0, math.min(item.issuer.length, 100));
    final rawName = item.name.substring(0, math.min(item.name.length, 100));
    final name = _cleanLabel(rawName, issuer);
    entries.add(
      AuthenticatorQrItem(
        label: name.isNotEmpty
            ? name
            : issuer.isNotEmpty
            ? issuer
            : '验证器项目 ${index + 1}',
        issuer: issuer,
        secret: _base32Encode(item.secret!),
        digits: item.digits == 2 ? 8 : 6,
        period: 30,
        algorithm: algorithm,
      ),
    );
  }
  if (entries.isEmpty) {
    throw const FormatException('二维码中没有可导入的 TOTP 项目');
  }
  final warnings = <String>[
    if (ignoredHotp > 0) '已忽略 $ignoredHotp 个 HOTP 项目；当前版本只支持 TOTP。',
    if (ignoredAlgorithm > 0) '已忽略 $ignoredAlgorithm 个使用不支持算法的项目。',
    if (batchSize > 1) '这是第 ${batchIndex + 1}/$batchSize 张迁移二维码，请逐张重复导入。',
  ];
  return AuthenticatorQrResult(
    entries: entries,
    format: 'google-authenticator',
    warnings: warnings,
    batchIndex: batchIndex,
    batchSize: batchSize,
  );
}

AuthenticatorQrResult parseAuthenticatorQrPayload(String payload) {
  final value = payload.trim();
  if (value.isEmpty || value.length > _maxQrPayloadLength) {
    throw const FormatException('二维码内容为空或超过 256 KiB 安全限制');
  }
  final uri = Uri.tryParse(value);
  if (uri == null) throw const FormatException('该图片不是受支持的验证器二维码');
  if (uri.scheme.toLowerCase() == 'otpauth' &&
      uri.host.toLowerCase() == 'totp') {
    final parsed = parseTotp(value);
    return AuthenticatorQrResult(
      entries: [
        AuthenticatorQrItem(
          label: parsed.label?.trim().isNotEmpty == true
              ? parsed.label!.trim()
              : parsed.issuer?.trim().isNotEmpty == true
              ? parsed.issuer!.trim()
              : '二维码中的账户',
          issuer: parsed.issuer?.trim() ?? '',
          secret: parsed.secret,
          digits: parsed.digits,
          period: parsed.period,
          algorithm: parsed.algorithm,
        ),
      ],
      format: 'otpauth',
    );
  }
  if (uri.scheme.toLowerCase() == 'otpauth-migration' &&
      uri.host.toLowerCase() == 'offline') {
    return _parseGoogleMigration(uri);
  }
  throw const FormatException('仅支持 TOTP otpauth 或 Google Authenticator 导出二维码');
}
