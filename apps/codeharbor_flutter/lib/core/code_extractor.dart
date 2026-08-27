final _keywords = RegExp(
  r'verification code|security code|login code|sign-in code|one-time code|one time password|passcode|otp|验证码|校验码|动态码|登录码|安全码|認証コード|確認コード|인증 코드|sign in|log in|authenticate|confirm your identity|confirm your email|登录|身份验证|验证身份|確認|認証',
  caseSensitive: false,
);
const _chatGptOtpSenders = {'noreply@tm.openai.com', 'otp@tm1.openai.com'};
final _chatGptOtpContext = RegExp(
  r'chatgpt|verification|security|login|log[ -]?in|sign[ -]?in|one[ -]?time|passcode|\botp\b|验证码|登录|验证|認証|確認|인증',
  caseSensitive: false,
);

String stripHtml(String html) => html
    .replaceAll(RegExp(r'<style[\s\S]*?</style>', caseSensitive: false), ' ')
    .replaceAll(RegExp(r'<script[\s\S]*?</script>', caseSensitive: false), ' ')
    .replaceAll(RegExp(r'<[^>]+>'), ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&#39;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

List<String> extractVerificationCodes(String subject, String body) {
  final scores = <String, int>{};
  for (final source in [
    (text: subject, subject: true),
    (text: body, subject: false),
  ]) {
    final matches = <RegExpMatch>[
      ...RegExp(r'(?<!\d)(\d(?:[\s-]?\d){3,7})(?!\d)').allMatches(source.text),
      ...RegExp(
        r'(?<![A-Z0-9])([A-Z0-9]{6,10})(?![A-Z0-9])',
        caseSensitive: false,
      ).allMatches(source.text),
    ];
    for (final match in matches) {
      final raw = match.group(1) ?? match.group(0) ?? '';
      final code = raw.replaceAll(RegExp(r'[\s-]'), '').toUpperCase();
      if (code.length < 4 || code.length > 10) continue;
      if (RegExp(r'^\d{4}$').hasMatch(code)) {
        final year = int.parse(code);
        if (year >= 1900 && year <= 2099) continue;
      }
      final isNumeric = RegExp(r'^\d+$').hasMatch(code);
      final isMixed =
          RegExp(r'[A-Z]').hasMatch(code) && RegExp(r'\d').hasMatch(code);
      if (!isNumeric && !isMixed) continue;
      final start = (match.start - 96).clamp(0, source.text.length);
      final end = (match.end + 96).clamp(0, source.text.length);
      if (!_keywords.hasMatch(source.text.substring(start, end))) continue;
      var score = source.subject ? 14 : 8;
      if (code.length == 6) score += 5;
      if (code.length == 8) score += 3;
      if (isNumeric) score += 2;
      if (RegExp(r'^(\d)\1+$').hasMatch(code)) score -= 4;
      if ((scores[code] ?? -999) < score) scores[code] = score;
    }
  }
  final ordered = scores.entries.toList()
    ..sort((a, b) => b.value.compareTo(a.value));
  return ordered.take(5).map((item) => item.key).toList(growable: false);
}

bool isOfficialChatGptOtpSender(String sender) {
  final matches = RegExp(
    r'[A-Z0-9._%+-]+@[A-Z0-9.-]+',
    caseSensitive: false,
  ).allMatches(sender).toList();
  final address = matches.isEmpty ? '' : matches.last.group(0)!.toLowerCase();
  return _chatGptOtpSenders.contains(address);
}

List<String> extractChatGptLoginCodes(
  String sender,
  String subject,
  String body,
) {
  if (!isOfficialChatGptOtpSender(sender)) return const [];
  final results = <String>[];
  for (final text in [subject, body]) {
    for (final match in RegExp(
      r'(?<!\d)(\d(?:[\s-]?\d){5})(?!\d)',
    ).allMatches(text)) {
      final raw = match.group(1) ?? match.group(0) ?? '';
      final start = (match.start - 128).clamp(0, text.length);
      final end = (match.end + 128).clamp(0, text.length);
      if (!_chatGptOtpContext.hasMatch(text.substring(start, end))) continue;
      final code = raw.replaceAll(RegExp(r'[\s-]'), '');
      if (!results.contains(code)) results.add(code);
      if (results.length >= 3) return results;
    }
  }
  return results;
}

String makeVerificationPurpose(
  String subject,
  String sender,
  List<String> codes,
) {
  var cleaned = subject.replaceAll(RegExp(r'\s+'), ' ').trim();
  for (final code in codes) {
    final pattern = code.split('').map(RegExp.escape).join(r'[\s-]*');
    cleaned = cleaned.replaceAll(RegExp(pattern, caseSensitive: false), ' ');
  }
  cleaned = cleaned
      .replaceAll(RegExp(r'\s+'), ' ')
      .replaceAll(RegExp(r'[\s:：|—–-]+$'), '')
      .trim();
  if (cleaned.isNotEmpty && cleaned != '(无主题)' && cleaned.length <= 100) {
    return cleaned;
  }
  final senderName = sender
      .split('<')
      .first
      .replaceAll(RegExp(r'["\x27]'), '')
      .trim();
  if (senderName.isNotEmpty && !senderName.contains('@')) {
    return '$senderName 的验证码';
  }
  final address = RegExp(
    r'@([A-Z0-9.-]+)',
    caseSensitive: false,
  ).firstMatch(sender);
  return address == null ? '账户登录验证码' : '${address.group(1)} 的验证码';
}
