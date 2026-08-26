import 'dart:async';

import 'package:enough_mail/enough_mail.dart' hide MailAccount;

import '../core/code_extractor.dart';
import '../models/models.dart';

class AccountCheck {
  const AccountCheck({
    required this.accountId,
    required this.ok,
    required this.message,
    this.messageCount = 0,
  });

  final String accountId;
  final bool ok;
  final String message;
  final int messageCount;
}

class MailScanResult {
  const MailScanResult(this.statuses, this.messages, this.scannedAt);
  final List<AccountCheck> statuses;
  final List<VerificationMessage> messages;
  final DateTime scannedAt;
}

class MailService {
  const MailService();

  Future<AccountCheck> testAccount(MailAccount account) async {
    final stopwatch = Stopwatch()..start();
    ImapClient? client;
    try {
      client = await _connect(account);
      await _examineInbox(client);
      return AccountCheck(
        accountId: account.id,
        ok: true,
        message: '连接、认证和只读收件箱检查成功（${stopwatch.elapsedMilliseconds} ms）',
      );
    } catch (error) {
      return AccountCheck(
        accountId: account.id,
        ok: false,
        message: _friendlyError(error),
      );
    } finally {
      await _close(client);
    }
  }

  Future<MailScanResult> scan(
    List<MailAccount> accounts, {
    required AppSettings settings,
  }) async {
    final queue = accounts.where((item) => item.enabled).toList();
    final statuses = <AccountCheck>[];
    final messages = <VerificationMessage>[];
    var next = 0;

    Future<void> worker() async {
      while (next < queue.length) {
        final account = queue[next++];
        final result = await _scanAccount(account, settings);
        statuses.add(result.$1);
        messages.addAll(result.$2);
      }
    }

    await Future.wait(List.generate(queue.length.clamp(0, 3), (_) => worker()));
    messages.sort((a, b) => b.receivedAt.compareTo(a.receivedAt));
    return MailScanResult(statuses, messages, DateTime.now().toUtc());
  }

  Future<(AccountCheck, List<VerificationMessage>)> _scanAccount(
    MailAccount account,
    AppSettings settings,
  ) async {
    ImapClient? client;
    final stopwatch = Stopwatch()..start();
    try {
      client = await _connect(account);
      await _examineInbox(client);
      final result = await client.fetchRecentMessages(
        messageCount: settings.maxMessagesPerAccount,
        criteria: '(UID ENVELOPE BODY.PEEK[])',
        responseTimeout: const Duration(seconds: 20),
      );
      final since = DateTime.now().toUtc().subtract(
        Duration(hours: settings.scanWindowHours),
      );
      final messages = <VerificationMessage>[];
      for (final message in result.messages) {
        final receivedAt = (message.decodeDate() ?? DateTime.now()).toUtc();
        if (receivedAt.isBefore(since)) continue;
        final subject = message.decodeSubject() ?? '(无主题)';
        final plain = message.decodeTextPlainPart() ?? '';
        final html = stripHtml(message.decodeTextHtmlPart() ?? '');
        final codes = extractVerificationCodes(subject, '$plain $html');
        if (codes.isEmpty) continue;
        final sender = _sender(message);
        messages.add(
          VerificationMessage(
            id: '${account.id}:${message.uid ?? message.sequenceId ?? messages.length}',
            accountId: account.id,
            accountLabel: account.label,
            accountEmail: account.email,
            provider: account.provider,
            sender: sender,
            receivedAt: receivedAt,
            codes: codes,
            purpose: makeVerificationPurpose(subject, sender, codes),
          ),
        );
      }
      return (
        AccountCheck(
          accountId: account.id,
          ok: true,
          message:
              '扫描完成：找到 ${messages.length} 封验证码邮件（${stopwatch.elapsedMilliseconds} ms）',
          messageCount: messages.length,
        ),
        messages,
      );
    } catch (error) {
      return (
        AccountCheck(
          accountId: account.id,
          ok: false,
          message: _friendlyError(error),
        ),
        const <VerificationMessage>[],
      );
    } finally {
      await _close(client);
    }
  }

  Future<ImapClient> _connect(MailAccount account) async {
    final client = ImapClient(
      isLogEnabled: false,
      defaultWriteTimeout: const Duration(seconds: 15),
      defaultResponseTimeout: const Duration(seconds: 20),
    );
    await client.connectToServer(
      account.imapHost,
      account.imapPort,
      isSecure: account.secure,
      timeout: const Duration(seconds: 15),
    );
    if (account.authMode == AuthMode.oauth2) {
      await client.authenticateWithOAuth2(account.username, account.credential);
    } else {
      await client.login(account.username, account.credential);
    }
    return client;
  }

  Future<void> _examineInbox(ImapClient client) async {
    final mailboxes = await client.listMailboxes();
    Mailbox? inbox;
    for (final mailbox in mailboxes) {
      if (mailbox.isInbox || mailbox.path.toUpperCase() == 'INBOX') {
        inbox = mailbox;
        break;
      }
    }
    if (inbox == null) throw StateError('服务器没有返回 INBOX 收件箱');
    await client.examineMailbox(inbox);
  }

  Future<void> _close(ImapClient? client) async {
    if (client == null) return;
    try {
      await client.logout().timeout(const Duration(seconds: 4));
    } catch (_) {
      client.disconnect();
    }
  }

  String _sender(MimeMessage message) {
    final addresses = message.from;
    final address = addresses == null || addresses.isEmpty
        ? null
        : addresses.first;
    if (address == null) return '未知发件方';
    final name = address.personalName?.trim();
    return name == null || name.isEmpty
        ? address.email
        : '$name <${address.email}>';
  }

  String _friendlyError(Object error) {
    final raw = error.toString().replaceAll(RegExp(r'[\r\n]+'), ' ');
    final lower = raw.toLowerCase();
    if (lower.contains('certificate') || lower.contains('handshake')) {
      return 'TLS 证书校验失败，请检查系统时间、网络代理和服务器地址。';
    }
    if (lower.contains('authentication') ||
        lower.contains('login') ||
        lower.contains('credentials')) {
      return '认证失败，请检查授权码、应用专用密码或 OAuth2 令牌。';
    }
    if (lower.contains('timed out') || lower.contains('timeout')) {
      return '连接超时，请检查网络、代理以及 IMAP 主机和端口。';
    }
    return '连接失败：${raw.length > 180 ? raw.substring(0, 180) : raw}';
  }
}
