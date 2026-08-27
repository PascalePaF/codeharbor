import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

import '../models/models.dart';

const _alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

String normalizeBase32(String value) =>
    value.toUpperCase().replaceAll(RegExp(r'[\s=-]'), '');

Uint8List decodeBase32(String value) {
  final normalized = normalizeBase32(value);
  if (normalized.isEmpty || RegExp(r'[^A-Z2-7]').hasMatch(normalized)) {
    throw const FormatException('2FA 密钥不是有效的 Base32 格式');
  }
  var buffer = 0;
  var bits = 0;
  final output = <int>[];
  for (final unit in normalized.codeUnits) {
    buffer = (buffer << 5) | _alphabet.indexOf(String.fromCharCode(unit));
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.add((buffer >> bits) & 0xff);
    }
  }
  return Uint8List.fromList(output);
}

class ParsedTotp {
  const ParsedTotp({
    required this.secret,
    this.label,
    this.issuer,
    this.digits = 6,
    this.period = 30,
    this.algorithm = TotpAlgorithm.sha1,
  });

  final String secret;
  final String? label;
  final String? issuer;
  final int digits;
  final int period;
  final TotpAlgorithm algorithm;
}

ParsedTotp parseTotp(String input) {
  final trimmed = input.trim();
  if (!trimmed.toLowerCase().startsWith('otpauth://')) {
    final secret = normalizeBase32(trimmed);
    decodeBase32(secret);
    return ParsedTotp(secret: secret);
  }
  final uri = Uri.tryParse(trimmed);
  if (uri == null ||
      uri.scheme != 'otpauth' ||
      uri.host.toLowerCase() != 'totp') {
    throw const FormatException('仅支持 TOTP 类型的 otpauth 链接');
  }
  final rawLabel = Uri.decodeComponent(uri.path.replaceFirst('/', ''));
  final parts = rawLabel.split(':');
  final issuerFromLabel = parts.length > 1 ? parts.removeAt(0).trim() : null;
  final label = parts.join(':').trim();
  final secret = normalizeBase32(uri.queryParameters['secret'] ?? '');
  final digits = int.tryParse(uri.queryParameters['digits'] ?? '6');
  final period = int.tryParse(uri.queryParameters['period'] ?? '30');
  final algorithmName = (uri.queryParameters['algorithm'] ?? 'SHA1')
      .toUpperCase();
  if (digits == null || period == null) {
    throw const FormatException('TOTP 位数或周期格式不正确');
  }
  if (digits != 6 && digits != 8) {
    throw const FormatException('TOTP 位数仅支持 6 或 8 位');
  }
  if (period < 15 || period > 120) {
    throw const FormatException('TOTP 周期必须在 15–120 秒之间');
  }
  if (!const ['SHA1', 'SHA256', 'SHA512'].contains(algorithmName)) {
    throw const FormatException('不支持该 TOTP 算法');
  }
  final algorithm = TotpAlgorithm.fromWire(algorithmName);
  decodeBase32(secret);
  return ParsedTotp(
    secret: secret,
    label: label.isEmpty ? null : label,
    issuer: (uri.queryParameters['issuer'] ?? issuerFromLabel)?.trim(),
    digits: digits,
    period: period,
    algorithm: algorithm,
  );
}

class TotpCode {
  const TotpCode(this.code, this.secondsRemaining);
  final String code;
  final int secondsRemaining;
}

TotpCode generateTotp(
  String secret, {
  DateTime? now,
  int digits = 6,
  int period = 30,
  TotpAlgorithm algorithm = TotpAlgorithm.sha1,
}) {
  final seconds = (now ?? DateTime.now()).millisecondsSinceEpoch ~/ 1000;
  final counter = seconds ~/ period;
  final counterBytes = ByteData(8)..setUint64(0, counter, Endian.big);
  final hmac = switch (algorithm) {
    TotpAlgorithm.sha1 => Hmac(sha1, decodeBase32(secret)),
    TotpAlgorithm.sha256 => Hmac(sha256, decodeBase32(secret)),
    TotpAlgorithm.sha512 => Hmac(sha512, decodeBase32(secret)),
  };
  final digest = hmac.convert(counterBytes.buffer.asUint8List()).bytes;
  final offset = digest.last & 0x0f;
  final binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
  final modulus = digits == 8 ? 100000000 : 1000000;
  return TotpCode(
    (binary % modulus).toString().padLeft(digits, '0'),
    period - (seconds % period),
  );
}

String totpUri(TotpEntry entry) {
  final label = entry.issuer.isEmpty
      ? entry.label
      : '${entry.issuer}:${entry.label}';
  return Uri(
    scheme: 'otpauth',
    host: 'totp',
    path: '/$label',
    queryParameters: {
      'secret': entry.secret,
      if (entry.issuer.isNotEmpty) 'issuer': entry.issuer,
      'digits': entry.digits.toString(),
      'period': entry.period.toString(),
      'algorithm': entry.algorithm.wireName,
    },
  ).toString();
}

String prettyJson(Object? value) =>
    const JsonEncoder.withIndent('  ').convert(value);
