import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../app_controller.dart';
import '../core/authenticator_qr.dart';
import '../core/backup_codec.dart';
import '../core/providers.dart';
import '../core/totp.dart';
import '../models/models.dart';
import 'dialogs.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.controller});
  final AppController controller;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _page = 0;
  String _search = '';

  AppController get controller => widget.controller;

  static const _destinations = [
    NavigationDestination(
      icon: Icon(Icons.inbox_outlined),
      selectedIcon: Icon(Icons.inbox),
      label: '验证码',
    ),
    NavigationDestination(icon: Icon(Icons.alternate_email), label: '邮箱'),
    NavigationDestination(
      icon: Icon(Icons.password_outlined),
      selectedIcon: Icon(Icons.password),
      label: '2FA',
    ),
    NavigationDestination(
      icon: Icon(Icons.settings_outlined),
      selectedIcon: Icon(Icons.settings),
      label: '设置',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    if (controller.startupError != null) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 540),
              child: HelpPanel(
                text: '无法打开本机保险库：${_errorText(controller.startupError!)}',
              ),
            ),
          ),
        ),
      );
    }
    if (!controller.ready) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final wide = MediaQuery.sizeOf(context).width >= 900;
    final body = _pageBody();
    return Scaffold(
      appBar: AppBar(
        titleSpacing: wide ? 22 : 16,
        title: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primary,
                borderRadius: BorderRadius.circular(11),
              ),
              child: Icon(
                Icons.shield_outlined,
                color: Theme.of(context).colorScheme.onPrimary,
                size: 21,
              ),
            ),
            const SizedBox(width: 11),
            const Flexible(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('CodeHarbor 验证码港', overflow: TextOverflow.ellipsis),
                  Text(
                    'Android · iPhone · macOS 社区预览',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.normal,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          if (_page != 3)
            SizedBox(
              width: wide ? 280 : 150,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: TextField(
                  decoration: const InputDecoration(
                    hintText: '搜索',
                    prefixIcon: Icon(Icons.search, size: 20),
                    isDense: true,
                  ),
                  onChanged: (value) =>
                      setState(() => _search = value.trim().toLowerCase()),
                ),
              ),
            ),
          const SizedBox(width: 8),
        ],
      ),
      body: Row(
        children: [
          if (wide)
            NavigationRail(
              selectedIndex: _page,
              labelType: NavigationRailLabelType.all,
              onDestinationSelected: (value) => setState(() {
                _page = value;
                _search = '';
              }),
              destinations: _destinations
                  .map(
                    (item) => NavigationRailDestination(
                      icon: item.icon,
                      selectedIcon: item.selectedIcon,
                      label: Text(item.label),
                    ),
                  )
                  .toList(),
            ),
          if (wide) const VerticalDivider(width: 1),
          Expanded(child: body),
        ],
      ),
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: _page,
              destinations: _destinations,
              onDestinationSelected: (value) => setState(() {
                _page = value;
                _search = '';
              }),
            ),
      floatingActionButton: switch (_page) {
        1 => FloatingActionButton.extended(
          onPressed: _addAccount,
          icon: const Icon(Icons.add),
          label: const Text('添加邮箱'),
        ),
        2 => FloatingActionButton.extended(
          onPressed: _addTotp,
          icon: const Icon(Icons.add),
          label: const Text('添加 2FA'),
        ),
        _ => null,
      },
    );
  }

  Widget _pageBody() => switch (_page) {
    0 => InboxPage(
      controller: controller,
      search: _search,
      onMessage: _message,
    ),
    1 => AccountsPage(
      controller: controller,
      search: _search,
      onAdd: _addAccount,
      onEdit: _editAccount,
      onDelete: _deleteAccount,
      onMessage: _message,
      onBackup: _backup,
    ),
    2 => TotpPage(
      controller: controller,
      search: _search,
      onAdd: _addTotp,
      onCameraQr: _scanTotpQr,
      onImageQr: _uploadTotpQr,
      onEdit: _editTotp,
      onDelete: _deleteTotp,
      onMessage: _message,
      onBackup: _backup,
    ),
    _ => SettingsPage(
      controller: controller,
      onMessage: _message,
      onBackup: _backup,
    ),
  };

  Future<void> _addAccount() =>
      showAccountEditor(context, onSave: controller.saveAccount);

  Future<void> _editAccount(MailAccount account) => showAccountEditor(
    context,
    account: account,
    onSave: controller.saveAccount,
  );

  Future<void> _addTotp() =>
      showTotpEditor(context, onSave: controller.saveTotp);

  Future<void> _scanTotpQr() async {
    final payload = await showAuthenticatorCameraScanner(context);
    if (payload != null && mounted) await _importTotpQrPayload(payload);
  }

  Future<void> _uploadTotpQr() async {
    try {
      final picked = await FilePicker.pickFile(
        dialogTitle: '选择验证器二维码图片',
        type: FileType.image,
      );
      if (picked == null) return;
      final path = picked.path;
      if (path == null || path.isEmpty) {
        throw const FormatException('当前平台没有返回可读取的图片路径');
      }
      final scanner = MobileScannerController(
        autoStart: false,
        formats: const [BarcodeFormat.qrCode],
      );
      BarcodeCapture? capture;
      try {
        capture = await scanner.analyzeImage(path);
      } finally {
        await scanner.dispose();
      }
      String? payload;
      for (final barcode in capture?.barcodes ?? const <Barcode>[]) {
        final value = barcode.rawValue?.trim();
        if (value != null && value.isNotEmpty) {
          payload = value;
          break;
        }
      }
      if (payload == null) {
        throw const FormatException('图片中未识别到清晰的二维码，请选择原图重试');
      }
      if (mounted) await _importTotpQrPayload(payload);
    } catch (error) {
      _message(_errorText(error), error: true);
    }
  }

  Future<void> _importTotpQrPayload(String payload) async {
    try {
      final result = parseAuthenticatorQrPayload(payload);
      if (!await confirmAuthenticatorQrImport(context, result) || !mounted) {
        return;
      }
      final summary = await controller.importAuthenticatorQr(result);
      _message('二维码导入完成：新增 ${summary.created}，更新 ${summary.updated}');
    } catch (error) {
      _message(_errorText(error), error: true);
    }
  }

  Future<void> _editTotp(TotpEntry entry) =>
      showTotpEditor(context, entry: entry, onSave: controller.saveTotp);

  Future<void> _deleteAccount(MailAccount account) async {
    if (!await _confirm('删除邮箱账户', '确定删除“${account.label}”及其本机加密凭据吗？')) return;
    await controller.removeAccount(account.id);
    _message('邮箱账户已删除');
  }

  Future<void> _deleteTotp(TotpEntry entry) async {
    if (!await _confirm('删除 2FA 项目', '确定删除“${entry.label}”及其本机加密密钥吗？')) return;
    await controller.removeTotp(entry.id);
    _message('2FA 项目已删除');
  }

  Future<bool> _confirm(String title, String body) async =>
      await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: Text(title),
          content: Text(body),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('取消'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('删除'),
            ),
          ],
        ),
      ) ??
      false;

  Future<void> _backup(BackupScope scope, bool exporting) async {
    final password = await askBackupPassword(
      context,
      scope: scope,
      exporting: exporting,
    );
    if (password == null || !mounted) return;
    try {
      if (exporting) {
        final saved = await controller.exportBackup(scope, password);
        if (saved != null) _message('加密备份已导出');
      } else {
        final imported = await controller.importBackup(scope, password);
        if (imported) _message('备份已验证并安全导入');
      }
    } catch (error) {
      _message(_errorText(error), error: true);
    }
  }

  void _message(String text, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(text),
        backgroundColor: error ? Theme.of(context).colorScheme.error : null,
      ),
    );
  }
}

class InboxPage extends StatelessWidget {
  const InboxPage({
    super.key,
    required this.controller,
    required this.search,
    required this.onMessage,
  });
  final AppController controller;
  final String search;
  final void Function(String, {bool error}) onMessage;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final accounts = controller.data.accounts
          .where((item) => _matchesAccount(item, search))
          .toList();
      final messages = controller.messages
          .where((item) => _matchesMessage(item, search))
          .toList();
      final totp = controller.data.totpEntries
          .where((item) => _matchesTotp(item, search))
          .toList();
      if (constraints.maxWidth >= 1120) {
        return Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                flex: 3,
                child: _InboxAccounts(
                  controller: controller,
                  accounts: accounts,
                  onMessage: onMessage,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(flex: 5, child: _InboxMessages(messages: messages)),
              const SizedBox(width: 14),
              Expanded(
                flex: 3,
                child: _InboxTotp(entries: totp, onMessage: onMessage),
              ),
            ],
          ),
        );
      }
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
        children: [
          _InboxAccounts(
            controller: controller,
            accounts: accounts,
            onMessage: onMessage,
            compact: true,
          ),
          const SizedBox(height: 14),
          _InboxMessages(messages: messages, compact: true),
          const SizedBox(height: 14),
          _InboxTotp(entries: totp, onMessage: onMessage, compact: true),
        ],
      );
    },
  );
}

class _InboxAccounts extends StatelessWidget {
  const _InboxAccounts({
    required this.controller,
    required this.accounts,
    required this.onMessage,
    this.compact = false,
  });
  final AppController controller;
  final List<MailAccount> accounts;
  final void Function(String, {bool error}) onMessage;
  final bool compact;

  Future<void> _scan(BuildContext context, String? id) async {
    try {
      final result = await controller.scan(accountId: id);
      final failed = result.statuses.where((item) => !item.ok).length;
      onMessage(
        failed == 0
            ? '扫描完成：找到 ${result.messages.length} 条 ChatGPT 登录验证码'
            : '扫描完成：$failed 个邮箱失败',
        error: failed > 0,
      );
    } catch (error) {
      onMessage(_errorText(error), error: true);
    }
  }

  @override
  Widget build(BuildContext context) => Pane(
    title: '邮箱账户',
    subtitle: '${accounts.length} 个账户',
    trailing: FilledButton.tonalIcon(
      onPressed: controller.busy ? null : () => _scan(context, null),
      icon: controller.scanningAccountId == 'all'
          ? const SizedBox.square(
              dimension: 15,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const Icon(Icons.refresh, size: 18),
      label: const Text('扫描全部'),
    ),
    compact: compact,
    children: accounts.isEmpty
        ? const [
            EmptyState(icon: Icons.alternate_email, text: '尚未添加或没有匹配的邮箱账户'),
          ]
        : accounts
              .map(
                (account) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: CircleAvatar(
                    child: Text(
                      providerFor(account.provider).name.characters.first,
                    ),
                  ),
                  title: Text(
                    account.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: Text(
                    account.email,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  enabled: account.enabled,
                  trailing: IconButton(
                    tooltip: '只查询这个邮箱',
                    onPressed: controller.busy
                        ? null
                        : () => _scan(context, account.id),
                    icon: controller.scanningAccountId == account.id
                        ? const SizedBox.square(
                            dimension: 17,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.search),
                  ),
                ),
              )
              .toList(),
  );
}

class _InboxMessages extends StatelessWidget {
  const _InboxMessages({required this.messages, this.compact = false});
  final List<VerificationMessage> messages;
  final bool compact;

  @override
  Widget build(BuildContext context) => Pane(
    title: 'ChatGPT 登录验证码',
    subtitle: '${messages.length} 条，仅接受 OpenAI 官方 OTP 发件地址的 6 位码',
    compact: compact,
    children: messages.isEmpty
        ? const [
            EmptyState(
              icon: Icons.mark_email_read_outlined,
              text: '扫描后，最近 5 小时的 ChatGPT 登录验证码会显示在这里',
            ),
          ]
        : messages
              .map(
                (message) => Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                message.sender,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            Text(
                              DateFormat(
                                'MM-dd HH:mm',
                              ).format(message.receivedAt.toLocal()),
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ),
                        const SizedBox(height: 5),
                        Text(
                          message.purpose,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: message.codes
                              .map(
                                (code) => ActionChip(
                                  avatar: const Icon(Icons.copy, size: 16),
                                  label: Text(
                                    code,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 2,
                                    ),
                                  ),
                                  onPressed: () => Clipboard.setData(
                                    ClipboardData(text: code),
                                  ),
                                ),
                              )
                              .toList(),
                        ),
                      ],
                    ),
                  ),
                ),
              )
              .toList(),
  );
}

class _InboxTotp extends StatelessWidget {
  const _InboxTotp({
    required this.entries,
    required this.onMessage,
    this.compact = false,
  });
  final List<TotpEntry> entries;
  final void Function(String, {bool error}) onMessage;
  final bool compact;

  @override
  Widget build(BuildContext context) => Pane(
    title: '2FA 动态码',
    subtitle: '${entries.length} 个项目',
    compact: compact,
    children: entries.isEmpty
        ? const [EmptyState(icon: Icons.password, text: '尚未添加或没有匹配的 2FA 项目')]
        : entries
              .map((entry) => TotpTile(entry: entry, onMessage: onMessage))
              .toList(),
  );
}

class AccountsPage extends StatelessWidget {
  const AccountsPage({
    super.key,
    required this.controller,
    required this.search,
    required this.onAdd,
    required this.onEdit,
    required this.onDelete,
    required this.onMessage,
    required this.onBackup,
  });
  final AppController controller;
  final String search;
  final VoidCallback onAdd;
  final void Function(MailAccount) onEdit;
  final void Function(MailAccount) onDelete;
  final void Function(String, {bool error}) onMessage;
  final Future<void> Function(BackupScope, bool) onBackup;

  @override
  Widget build(BuildContext context) {
    final accounts = controller.data.accounts
        .where((item) => _matchesAccount(item, search))
        .toList();
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 110),
      children: [
        SectionHeader(
          title: '邮箱账户',
          subtitle: '凭据只保存在本机加密保险库中。IMAP 以只读方式打开收件箱。',
          actions: [
            OutlinedButton.icon(
              onPressed: () => onBackup(BackupScope.accounts, false),
              icon: const Icon(Icons.file_upload_outlined),
              label: const Text('导入'),
            ),
            OutlinedButton.icon(
              onPressed: () => onBackup(BackupScope.accounts, true),
              icon: const Icon(Icons.file_download_outlined),
              label: const Text('导出'),
            ),
            FilledButton.icon(
              onPressed: onAdd,
              icon: const Icon(Icons.add),
              label: const Text('添加邮箱'),
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (accounts.isEmpty)
          const EmptyState(
            icon: Icons.alternate_email,
            text: '还没有邮箱账户，点击“添加邮箱”开始',
          )
        else
          ...accounts.map((account) {
            final status = controller.accountChecks[account.id];
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      CircleAvatar(
                        child: Text(
                          providerFor(account.provider).name.characters.first,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              account.label,
                              style: Theme.of(context).textTheme.titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              '${account.email} · ${account.imapHost}:${account.imapPort}',
                            ),
                            const SizedBox(height: 7),
                            Text(
                              status?.message ??
                                  (account.enabled ? '等待连接测试' : '已暂停扫描'),
                              style: TextStyle(
                                color: status == null
                                    ? null
                                    : status.ok
                                    ? Colors.green
                                    : Theme.of(context).colorScheme.error,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Switch(
                        value: account.enabled,
                        onChanged: (value) =>
                            controller.setAccountEnabled(account.id, value),
                      ),
                      PopupMenuButton<String>(
                        onSelected: (value) async {
                          if (value == 'edit') onEdit(account);
                          if (value == 'delete') onDelete(account);
                          if (value == 'test') {
                            final result = await controller.testAccount(
                              account.id,
                            );
                            onMessage(result.message, error: !result.ok);
                          }
                        },
                        itemBuilder: (_) => const [
                          PopupMenuItem(
                            value: 'test',
                            child: ListTile(
                              leading: Icon(Icons.cable),
                              title: Text('测试连接'),
                            ),
                          ),
                          PopupMenuItem(
                            value: 'edit',
                            child: ListTile(
                              leading: Icon(Icons.edit_outlined),
                              title: Text('编辑'),
                            ),
                          ),
                          PopupMenuItem(
                            value: 'delete',
                            child: ListTile(
                              leading: Icon(Icons.delete_outline),
                              title: Text('删除'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
      ],
    );
  }
}

class TotpPage extends StatelessWidget {
  const TotpPage({
    super.key,
    required this.controller,
    required this.search,
    required this.onAdd,
    required this.onCameraQr,
    required this.onImageQr,
    required this.onEdit,
    required this.onDelete,
    required this.onMessage,
    required this.onBackup,
  });
  final AppController controller;
  final String search;
  final VoidCallback onAdd;
  final VoidCallback onCameraQr;
  final VoidCallback onImageQr;
  final void Function(TotpEntry) onEdit;
  final void Function(TotpEntry) onDelete;
  final void Function(String, {bool error}) onMessage;
  final Future<void> Function(BackupScope, bool) onBackup;

  @override
  Widget build(BuildContext context) {
    final entries = controller.data.totpEntries
        .where((item) => _matchesTotp(item, search))
        .toList();
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 110),
      children: [
        SectionHeader(
          title: '2FA 动态码',
          subtitle: '支持 Base32 与 otpauth://，默认 6 位、30 秒、SHA1。',
          actions: [
            if (Platform.isAndroid || Platform.isIOS)
              OutlinedButton.icon(
                onPressed: onCameraQr,
                icon: const Icon(Icons.qr_code_scanner),
                label: const Text('扫码导入'),
              ),
            OutlinedButton.icon(
              onPressed: onImageQr,
              icon: const Icon(Icons.image_search),
              label: const Text('图片导入'),
            ),
            OutlinedButton.icon(
              onPressed: () => onBackup(BackupScope.totp, false),
              icon: const Icon(Icons.file_upload_outlined),
              label: const Text('导入'),
            ),
            OutlinedButton.icon(
              onPressed: () => onBackup(BackupScope.totp, true),
              icon: const Icon(Icons.file_download_outlined),
              label: const Text('导出'),
            ),
            FilledButton.icon(
              onPressed: onAdd,
              icon: const Icon(Icons.add),
              label: const Text('添加 2FA'),
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (entries.isEmpty)
          const EmptyState(
            icon: Icons.password,
            text: '还没有 2FA 项目，点击“添加 2FA”开始',
          )
        else
          LayoutBuilder(
            builder: (context, constraints) {
              final count = constraints.maxWidth >= 1100
                  ? 3
                  : constraints.maxWidth >= 680
                  ? 2
                  : 1;
              return GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: count,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  mainAxisExtent: 174,
                ),
                itemCount: entries.length,
                itemBuilder: (_, index) {
                  final entry = entries[index];
                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  entry.label,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              PopupMenuButton<String>(
                                onSelected: (value) => value == 'edit'
                                    ? onEdit(entry)
                                    : onDelete(entry),
                                itemBuilder: (_) => const [
                                  PopupMenuItem(
                                    value: 'edit',
                                    child: Text('编辑'),
                                  ),
                                  PopupMenuItem(
                                    value: 'delete',
                                    child: Text('删除'),
                                  ),
                                ],
                              ),
                            ],
                          ),
                          Text(
                            entry.issuer.isEmpty ? '未设置服务商' : entry.issuer,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          const Spacer(),
                          TotpTile(entry: entry, onMessage: onMessage),
                        ],
                      ),
                    ),
                  );
                },
              );
            },
          ),
      ],
    );
  }
}

class SettingsPage extends StatelessWidget {
  const SettingsPage({
    super.key,
    required this.controller,
    required this.onMessage,
    required this.onBackup,
  });
  final AppController controller;
  final void Function(String, {bool error}) onMessage;
  final Future<void> Function(BackupScope, bool) onBackup;

  @override
  Widget build(BuildContext context) {
    final settings = controller.data.settings;
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 80),
      children: [
        const SectionHeader(title: '安全与设置', subtitle: '本机保险库、扫描范围、主题和跨设备迁移。'),
        const SizedBox(height: 16),
        SettingsCard(
          title: '外观',
          icon: Icons.palette_outlined,
          child: SegmentedButton<String>(
            segments: const [
              ButtonSegment(
                value: 'dark',
                icon: Icon(Icons.dark_mode),
                label: Text('黑夜模式'),
              ),
              ButtonSegment(
                value: 'light',
                icon: Icon(Icons.light_mode),
                label: Text('白天模式'),
              ),
            ],
            selected: {settings.theme},
            onSelectionChanged: (value) => controller.updateSettings(
              settings.copyWith(theme: value.first),
            ),
          ),
        ),
        const SizedBox(height: 12),
        SettingsCard(
          title: '邮箱扫描',
          icon: Icons.manage_search,
          child: Column(
            children: [
              const ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.verified_user_outlined),
                title: Text('验证码过滤标准：ChatGPT 专用'),
                subtitle: Text('只接收 OpenAI 官方 OTP 地址发出的 6 位登录验证码，其他邮件全部忽略'),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('自动刷新'),
                subtitle: const Text('应用打开时按下面的间隔扫描所有已启用邮箱'),
                value: settings.autoRefresh,
                onChanged: (value) => controller.updateSettings(
                  settings.copyWith(autoRefresh: value),
                ),
              ),
              _SliderSetting(
                label: '刷新间隔',
                valueLabel: '${settings.pollIntervalMinutes} 分钟',
                value: settings.pollIntervalMinutes.toDouble(),
                min: 1,
                max: 60,
                divisions: 59,
                onChanged: (value) => controller.updateSettings(
                  settings.copyWith(pollIntervalMinutes: value.round()),
                ),
              ),
              _SliderSetting(
                label: '扫描时间范围（新安装默认 5 小时）',
                valueLabel: '${settings.scanWindowHours} 小时',
                value: settings.scanWindowHours.toDouble(),
                min: 1,
                max: 168,
                divisions: 167,
                onChanged: (value) => controller.updateSettings(
                  settings.copyWith(scanWindowHours: value.round()),
                ),
              ),
              _SliderSetting(
                label: '每个邮箱最多读取',
                valueLabel: '${settings.maxMessagesPerAccount} 封',
                value: settings.maxMessagesPerAccount.toDouble(),
                min: 5,
                max: 100,
                divisions: 19,
                onChanged: (value) => controller.updateSettings(
                  settings.copyWith(
                    maxMessagesPerAccount: (value / 5).round() * 5,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SettingsCard(
          title: '跨设备加密备份',
          icon: Icons.lock_outline,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('格式与 Windows V1.0.2 兼容：scrypt + AES-256-GCM。密码不会保存。'),
              const SizedBox(height: 14),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  FilledButton.icon(
                    onPressed: () => onBackup(BackupScope.all, true),
                    icon: const Icon(Icons.file_download_outlined),
                    label: const Text('导出全部'),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => onBackup(BackupScope.all, false),
                    icon: const Icon(Icons.file_upload_outlined),
                    label: const Text('导入全部'),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        const SettingsCard(
          title: '社区预览与测试',
          icon: Icons.groups_outlined,
          child: Text(
            '当前版本由 GitHub Actions 在 Android、iOS 模拟器和 macOS 上自动编译。'
            '请先用测试邮箱和测试密钥验证；真实设备、Apple 签名、通知和 OAuth 登录仍欢迎社区参与。',
          ),
        ),
        const SizedBox(height: 12),
        SettingsCard(
          title: '版本',
          icon: Icons.info_outline,
          child: Text(
            '${AppController.appVersion} · 本地优先 · 无遥测 · 无 CodeHarbor 后端',
          ),
        ),
      ],
    );
  }
}

class TotpTile extends StatelessWidget {
  const TotpTile({super.key, required this.entry, required this.onMessage});
  final TotpEntry entry;
  final void Function(String, {bool error}) onMessage;

  @override
  Widget build(BuildContext context) {
    try {
      final value = generateTotp(
        entry.secret,
        digits: entry.digits,
        period: entry.period,
        algorithm: entry.algorithm,
      );
      return InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () async {
          await Clipboard.setData(ClipboardData(text: value.code));
          onMessage('动态码已复制');
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 7),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  value.code,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    letterSpacing: 3,
                  ),
                ),
              ),
              SizedBox.square(
                dimension: 34,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    CircularProgressIndicator(
                      value: value.secondsRemaining / entry.period,
                      strokeWidth: 3,
                    ),
                    Center(
                      child: Text(
                        '${value.secondsRemaining}',
                        style: const TextStyle(fontSize: 11),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    } catch (error) {
      return Text(
        '密钥无效：${_errorText(error)}',
        style: TextStyle(color: Theme.of(context).colorScheme.error),
      );
    }
  }
}

class Pane extends StatelessWidget {
  const Pane({
    super.key,
    required this.title,
    required this.subtitle,
    required this.children,
    this.trailing,
    this.compact = false,
  });
  final String title;
  final String subtitle;
  final Widget? trailing;
  final List<Widget> children;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final header = Padding(
      padding: const EdgeInsets.fromLTRB(16, 15, 12, 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
    final content = Padding(
      padding: const EdgeInsets.fromLTRB(12, 2, 12, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: children,
      ),
    );
    return Card(
      child: compact
          ? Column(mainAxisSize: MainAxisSize.min, children: [header, content])
          : Column(
              children: [
                header,
                const Divider(height: 1),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(12, 10, 12, 14),
                    children: children,
                  ),
                ),
              ],
            ),
    );
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    required this.subtitle,
    this.actions = const [],
  });
  final String title;
  final String subtitle;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) => Wrap(
    alignment: WrapAlignment.spaceBetween,
    crossAxisAlignment: WrapCrossAlignment.center,
    spacing: 16,
    runSpacing: 12,
    children: [
      ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 660),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 3),
            Text(subtitle),
          ],
        ),
      ),
      Wrap(spacing: 8, runSpacing: 8, children: actions),
    ],
  );
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 30, horizontal: 12),
    child: Column(
      children: [
        Icon(icon, size: 38, color: Theme.of(context).colorScheme.outline),
        const SizedBox(height: 10),
        Text(text, textAlign: TextAlign.center),
      ],
    ),
  );
}

class SettingsCard extends StatelessWidget {
  const SettingsCard({
    super.key,
    required this.title,
    required this.icon,
    required this.child,
  });
  final String title;
  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon),
              const SizedBox(width: 10),
              Text(
                title,
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
            ],
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    ),
  );
}

class _SliderSetting extends StatelessWidget {
  const _SliderSetting({
    required this.label,
    required this.valueLabel,
    required this.value,
    required this.min,
    required this.max,
    required this.divisions,
    required this.onChanged,
  });
  final String label;
  final String valueLabel;
  final double value;
  final double min;
  final double max;
  final int divisions;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Row(
        children: [
          Expanded(child: Text(label)),
          Text(valueLabel, style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
      Slider(
        value: value,
        min: min,
        max: max,
        divisions: divisions,
        onChanged: onChanged,
      ),
    ],
  );
}

bool _matchesAccount(MailAccount item, String search) =>
    search.isEmpty ||
    '${item.label} ${item.email} ${providerFor(item.provider).name}'
        .toLowerCase()
        .contains(search);

bool _matchesTotp(TotpEntry item, String search) =>
    search.isEmpty ||
    '${item.label} ${item.issuer}'.toLowerCase().contains(search);

bool _matchesMessage(VerificationMessage item, String search) =>
    search.isEmpty ||
    '${item.sender} ${item.accountLabel} ${item.purpose} ${item.codes.join(' ')}'
        .toLowerCase()
        .contains(search);

String _errorText(Object error) => error
    .toString()
    .replaceFirst('FormatException: ', '')
    .replaceFirst('Bad state: ', '');
