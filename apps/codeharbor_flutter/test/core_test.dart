import 'dart:convert';
import 'dart:typed_data';

import 'package:codeharbor_app/core/backup_codec.dart';
import 'package:codeharbor_app/core/code_extractor.dart';
import 'package:codeharbor_app/core/totp.dart';
import 'package:codeharbor_app/models/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('TOTP', () {
    test('matches RFC 6238 SHA1 vector', () {
      final result = generateTotp(
        'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
        now: DateTime.fromMillisecondsSinceEpoch(59000, isUtc: true),
        digits: 8,
      );
      expect(result.code, '94287082');
    });

    test('parses standard otpauth URI and defaults to six digits', () {
      final parsed = parseTotp(
        'otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example',
      );
      expect(parsed.label, 'alice@example.com');
      expect(parsed.issuer, 'Example');
      expect(parsed.digits, 6);
      expect(parsed.period, 30);
    });
  });

  group('verification code extraction', () {
    test('keeps contextual codes and ignores order numbers', () {
      expect(
        extractVerificationCodes('登录验证码 384 291', '请在 10 分钟内使用该验证码。'),
        contains('384291'),
      );
      expect(
        extractVerificationCodes('订单已发货', '订单号 98374612，物流号 55199231。'),
        isEmpty,
      );
    });
  });

  group('portable backup', () {
    final now = DateTime.utc(2026, 8, 26, 12);
    final data = VaultData(
      accounts: [
        MailAccount(
          id: 'mail-1',
          label: '测试邮箱',
          email: 'test@example.com',
          provider: ProviderId.custom,
          username: 'test@example.com',
          credential: 'app-password',
          authMode: AuthMode.password,
          imapHost: 'imap.example.com',
          imapPort: 993,
          secure: true,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        ),
      ],
      totpEntries: [
        TotpEntry(
          id: 'totp-1',
          label: '测试 2FA',
          issuer: 'CodeHarbor',
          secret: 'JBSWY3DPEHPK3PXP',
          digits: 6,
          period: 30,
          algorithm: TotpAlgorithm.sha1,
          createdAt: now,
          updatedAt: now,
        ),
      ],
    );

    test('round-trips encrypted data without plaintext leakage', () {
      final codec = BackupCodec();
      final encrypted = codec.encrypt(
        data,
        'correct-horse',
        appVersion: 'test',
        now: now,
        salt: Uint8List.fromList(List.generate(16, (index) => index)),
        iv: Uint8List.fromList(List.generate(12, (index) => 20 + index)),
      );
      final serialized = String.fromCharCodes(encrypted);
      expect(serialized, isNot(contains('app-password')));
      expect(serialized, isNot(contains('JBSWY3DPEHPK3PXP')));
      final envelope = jsonDecode(serialized) as Map<String, Object?>;
      final cipher = envelope['cipher']! as Map<String, Object?>;
      // Fixture generated independently with Node.js crypto, matching the
      // Windows V1.0.2 backup implementation byte-for-byte.
      expect(cipher['tag'], 'hPAQ+tDFFXzQVUl6vjcKSw==');
      expect(
        envelope['ciphertext'],
        '/fk/Ecytt/DYF34UwIIyXTni4+neBmw7T/sp2C4omILDwC2ncr1nBpH54ikzyifeq2klY+v0eGI/N16P5E5x2+Xkb7WMsIg4Bp7P7g+9SXez5FAKEzQJx2mvsaHIy+5YtbnUQVCONvZT0gpOlfFpjIyRejOuzakinc7bFBLqplIp4KuvfQqFaxp8RqHEKZreF3n6EPflFsdYQN5lQnbxP7OlKoNFV8TAk6YjXRJvFstgZBb4722Rc+98R3tFHSb5lFs8Y1ekGGGa1f/xEg1oCCSBqBXKyKNZoFq5HaWgWYQfED5PgYniPpX0aVK1SfB60WSU36yvVEzaQ54wXtbzozrAze4xQcZFy2f4XTtiRIgrlyf+LkPDa61oyeXXJhSUjKJqwN7TpmMOgw9WtiWT5p94qV9UJQv2f35ojbs1LjUFoQxIirrB3963aO7Zgxp1JeJdD34ZyzNzfLiTw1VFcFSMlbci32GZi4Y+zm/ZQx6mjHu7vBpI6LtAw0xsEVT3QrpTe1h7/KwHhcuzNXx4zDOtgSd+h47lYFRHWGXXkGdaZkYom1M1C6GnmgYY8o3L4Z/+kdjeGqb52C8yEszt9815cvbPUrFl/5PLdxxIdkZQVLIzrLFeaVCo4ueV+mumK2vpQ/U3twwZgN+x/Biy4RBZW/8eJHjhEOFARoF5rDE4Rwm8bgGvvev+YcrAeq4J3HKPGqohsMbQs2IYDKilzz3xnyyPi6e1kUTdW+DOVOEccODwAkJAIOTojirK7qD/di/tnMGSmZDLPAdc0SyHDpswRr4G0/wWIW9bN/S8nUX2eCfcqVLzTnv1v7vuXcqK0yb0TRcKyHaQsVjq8rgePR+uWq46Ufu3zasGlLFvVGPUjQEFqjP//cbv8WSzBfWlGIrbZJB0zWEfQhdLrdSp2RkcKY7xBJxMl3fUTTs3dbm7r9zKlXIqUSqkYV2Y5kl3xcWXb8Cw8GreoTyylUbo/JDESNAB0KoebHAzjVUow2BFZjjOgX5Oh1QPkyn5cziLLSAT7HABxobfWkE2o6saYSaqK329nA==',
      );
      final restored = codec.decrypt(encrypted, 'correct-horse');
      expect(restored.accounts.single.credential, 'app-password');
      expect(restored.totpEntries.single.secret, 'JBSWY3DPEHPK3PXP');
    });

    test('rejects a wrong password', () {
      final codec = BackupCodec();
      final encrypted = codec.encrypt(
        data,
        'correct-horse',
        appVersion: 'test',
        salt: Uint8List(16),
        iv: Uint8List(12),
      );
      expect(
        () => codec.decrypt(encrypted, 'wrong-password'),
        throwsA(isA<FormatException>()),
      );
    });
  });
}
