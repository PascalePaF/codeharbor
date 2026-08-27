import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../core/authenticator_qr.dart';
import '../core/backup_codec.dart';
import '../core/providers.dart';
import '../models/models.dart';

Future<void> showAccountEditor(
  BuildContext context, {
  required Future<void> Function({
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
    bool enabled,
  })
  onSave,
  MailAccount? account,
}) => showDialog<void>(
  context: context,
  builder: (_) => AccountEditorDialog(account: account, onSave: onSave),
);

class AccountEditorDialog extends StatefulWidget {
  const AccountEditorDialog({
    super.key,
    required this.account,
    required this.onSave,
  });

  final MailAccount? account;
  final Future<void> Function({
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
    bool enabled,
  })
  onSave;

  @override
  State<AccountEditorDialog> createState() => _AccountEditorDialogState();
}

class _AccountEditorDialogState extends State<AccountEditorDialog> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _label;
  late final TextEditingController _email;
  late final TextEditingController _username;
  late final TextEditingController _credential;
  late final TextEditingController _host;
  late final TextEditingController _port;
  late ProviderId _provider;
  late AuthMode _authMode;
  late bool _secure;
  bool _busy = false;
  bool _obscure = true;

  ProviderPreset get _preset => providerFor(_provider);

  @override
  void initState() {
    super.initState();
    final account = widget.account;
    _label = TextEditingController(text: account?.label ?? '');
    _email = TextEditingController(text: account?.email ?? '');
    _username = TextEditingController(text: account?.username ?? '');
    _credential = TextEditingController();
    _host = TextEditingController(text: account?.imapHost ?? '');
    _port = TextEditingController(text: (account?.imapPort ?? 993).toString());
    _provider = account?.provider ?? ProviderId.netease163;
    _authMode = account?.authMode ?? providerFor(_provider).defaultAuthMode;
    _secure = account?.secure ?? true;
  }

  @override
  void dispose() {
    _label.dispose();
    _email.dispose();
    _username.dispose();
    _credential.dispose();
    _host.dispose();
    _port.dispose();
    super.dispose();
  }

  void _selectProvider(ProviderId value) {
    setState(() {
      _provider = value;
      final preset = providerFor(value);
      _authMode = preset.defaultAuthMode;
      if (value != ProviderId.custom) {
        _host.text = preset.host;
        _port.text = preset.port.toString();
        _secure = preset.secure;
      }
    });
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      await widget.onSave(
        id: widget.account?.id,
        label: _label.text,
        email: _email.text,
        provider: _provider,
        username: _username.text,
        credential: _credential.text,
        authMode: _authMode,
        imapHost: _host.text,
        imapPort: int.tryParse(_port.text) ?? 993,
        secure: _secure,
        enabled: widget.account?.enabled ?? true,
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) _showError(context, error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.account == null ? '添加邮箱账户' : '编辑邮箱账户'),
    content: SizedBox(
      width: 560,
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _label,
                decoration: const InputDecoration(labelText: '账户名称'),
                validator: _required,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: '邮箱地址'),
                validator: (value) =>
                    RegExp(
                      r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
                    ).hasMatch(value?.trim() ?? '')
                    ? null
                    : '请输入有效的邮箱地址',
                onChanged: (value) {
                  if (widget.account != null) return;
                  final detected = detectProvider(value);
                  if (detected != ProviderId.custom && detected != _provider) {
                    _selectProvider(detected);
                  }
                  if (_username.text.isEmpty || !_username.text.contains('@')) {
                    _username.text = value.trim();
                  }
                },
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<ProviderId>(
                initialValue: _provider,
                decoration: const InputDecoration(labelText: '邮箱服务商'),
                items: providers
                    .map(
                      (item) => DropdownMenuItem(
                        value: item.id,
                        child: Text(item.name),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  if (value != null) _selectProvider(value);
                },
              ),
              const SizedBox(height: 8),
              HelpPanel(text: _preset.help),
              const SizedBox(height: 12),
              TextFormField(
                controller: _username,
                decoration: const InputDecoration(labelText: 'IMAP 登录用户名'),
                validator: _required,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<AuthMode>(
                initialValue: _authMode,
                decoration: const InputDecoration(labelText: '认证方式'),
                items: _preset.authModes
                    .map(
                      (mode) => DropdownMenuItem(
                        value: mode,
                        child: Text(
                          mode == AuthMode.oauth2 ? 'OAuth2 访问令牌' : '密码 / 授权码',
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (value) => setState(() => _authMode = value!),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _credential,
                obscureText: _obscure,
                autocorrect: false,
                enableSuggestions: false,
                decoration: InputDecoration(
                  labelText: _preset.credentialLabel,
                  helperText: widget.account == null ? null : '留空可保持当前凭据不变',
                  suffixIcon: IconButton(
                    tooltip: _obscure ? '显示' : '隐藏',
                    onPressed: () => setState(() => _obscure = !_obscure),
                    icon: Icon(
                      _obscure ? Icons.visibility : Icons.visibility_off,
                    ),
                  ),
                ),
                validator: (value) =>
                    widget.account == null &&
                        (value == null || value.trim().isEmpty)
                    ? '请填写认证凭据'
                    : null,
              ),
              if (_provider == ProviderId.custom) ...[
                const SizedBox(height: 12),
                TextFormField(
                  controller: _host,
                  decoration: const InputDecoration(labelText: 'IMAP 主机'),
                  validator: _required,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _port,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'IMAP 端口'),
                  validator: (value) {
                    final number = int.tryParse(value ?? '');
                    return number != null && number >= 1 && number <= 65535
                        ? null
                        : '端口必须为 1–65535';
                  },
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _secure,
                  title: const Text('直接使用 TLS'),
                  subtitle: const Text('推荐 993 + TLS；不接受无效证书'),
                  onChanged: (value) => setState(() => _secure = value),
                ),
              ],
            ],
          ),
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: _busy ? null : () => Navigator.pop(context),
        child: const Text('取消'),
      ),
      FilledButton.icon(
        onPressed: _busy ? null : _submit,
        icon: _busy
            ? const SizedBox.square(
                dimension: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.lock_outline),
        label: const Text('安全保存'),
      ),
    ],
  );
}

Future<void> showTotpEditor(
  BuildContext context, {
  required Future<void> Function({
    String? id,
    required String label,
    required String issuer,
    required String source,
    required int digits,
    required int period,
    required TotpAlgorithm algorithm,
  })
  onSave,
  TotpEntry? entry,
}) => showDialog<void>(
  context: context,
  builder: (_) => TotpEditorDialog(entry: entry, onSave: onSave),
);

class TotpEditorDialog extends StatefulWidget {
  const TotpEditorDialog({
    super.key,
    required this.entry,
    required this.onSave,
  });
  final TotpEntry? entry;
  final Future<void> Function({
    String? id,
    required String label,
    required String issuer,
    required String source,
    required int digits,
    required int period,
    required TotpAlgorithm algorithm,
  })
  onSave;

  @override
  State<TotpEditorDialog> createState() => _TotpEditorDialogState();
}

class _TotpEditorDialogState extends State<TotpEditorDialog> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _label;
  late final TextEditingController _issuer;
  late final TextEditingController _source;
  late int _digits;
  late int _period;
  late TotpAlgorithm _algorithm;
  bool _busy = false;
  bool _obscure = true;

  @override
  void initState() {
    super.initState();
    _label = TextEditingController(text: widget.entry?.label ?? '');
    _issuer = TextEditingController(text: widget.entry?.issuer ?? '');
    _source = TextEditingController();
    _digits = widget.entry?.digits ?? 6;
    _period = widget.entry?.period ?? 30;
    _algorithm = widget.entry?.algorithm ?? TotpAlgorithm.sha1;
  }

  @override
  void dispose() {
    _label.dispose();
    _issuer.dispose();
    _source.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      await widget.onSave(
        id: widget.entry?.id,
        label: _label.text,
        issuer: _issuer.text,
        source: _source.text,
        digits: _digits,
        period: _period,
        algorithm: _algorithm,
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) _showError(context, error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.entry == null ? '添加 2FA 动态码' : '编辑 2FA 动态码'),
    content: SizedBox(
      width: 540,
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              HelpPanel(
                text: widget.entry == null
                    ? '粘贴 Base32 密钥或完整 otpauth:// 链接。绝大多数服务使用 6 位、30 秒、SHA1。'
                    : '密钥留空会保留现有密钥；填写新密钥或链接则会替换。',
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _source,
                obscureText: _obscure,
                autocorrect: false,
                enableSuggestions: false,
                decoration: InputDecoration(
                  labelText: 'Base32 密钥 / otpauth:// 链接',
                  suffixIcon: IconButton(
                    tooltip: _obscure ? '显示' : '隐藏',
                    onPressed: () => setState(() => _obscure = !_obscure),
                    icon: Icon(
                      _obscure ? Icons.visibility : Icons.visibility_off,
                    ),
                  ),
                ),
                validator: (value) =>
                    widget.entry == null &&
                        (value == null || value.trim().isEmpty)
                    ? '请输入 2FA 密钥或链接'
                    : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _label,
                decoration: const InputDecoration(labelText: '账户名称'),
                validator: _required,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _issuer,
                decoration: const InputDecoration(labelText: '服务商（可选）'),
              ),
              const SizedBox(height: 12),
              LayoutBuilder(
                builder: (context, constraints) {
                  final fieldWidth = constraints.maxWidth < 420
                      ? constraints.maxWidth
                      : (constraints.maxWidth - 12) / 2;
                  return Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      SizedBox(
                        width: fieldWidth,
                        child: DropdownButtonFormField<int>(
                          initialValue: _digits,
                          decoration: const InputDecoration(labelText: '位数'),
                          items: const [
                            DropdownMenuItem(value: 6, child: Text('6 位（常用）')),
                            DropdownMenuItem(value: 8, child: Text('8 位')),
                          ],
                          onChanged: (value) =>
                              setState(() => _digits = value!),
                        ),
                      ),
                      SizedBox(
                        width: fieldWidth,
                        child: TextFormField(
                          initialValue: _period.toString(),
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(labelText: '周期（秒）'),
                          onChanged: (value) =>
                              _period = int.tryParse(value) ?? 30,
                          validator: (value) {
                            final number = int.tryParse(value ?? '');
                            return number != null &&
                                    number >= 15 &&
                                    number <= 120
                                ? null
                                : '15–120 秒';
                          },
                        ),
                      ),
                    ],
                  );
                },
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<TotpAlgorithm>(
                initialValue: _algorithm,
                decoration: const InputDecoration(labelText: '算法'),
                items: TotpAlgorithm.values
                    .map(
                      (item) => DropdownMenuItem(
                        value: item,
                        child: Text(item.wireName),
                      ),
                    )
                    .toList(),
                onChanged: (value) => setState(() => _algorithm = value!),
              ),
            ],
          ),
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: _busy ? null : () => Navigator.pop(context),
        child: const Text('取消'),
      ),
      FilledButton.icon(
        onPressed: _busy ? null : _submit,
        icon: _busy
            ? const SizedBox.square(
                dimension: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.lock_outline),
        label: const Text('安全保存'),
      ),
    ],
  );
}

Future<String?> askBackupPassword(
  BuildContext context, {
  required BackupScope scope,
  required bool exporting,
}) => showDialog<String>(
  context: context,
  builder: (_) => _BackupPasswordDialog(scope: scope, exporting: exporting),
);

class _BackupPasswordDialog extends StatefulWidget {
  const _BackupPasswordDialog({required this.scope, required this.exporting});
  final BackupScope scope;
  final bool exporting;

  @override
  State<_BackupPasswordDialog> createState() => _BackupPasswordDialogState();
}

class _BackupPasswordDialogState extends State<_BackupPasswordDialog> {
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  final _form = GlobalKey<FormState>();
  bool _obscure = true;

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.exporting ? '导出加密备份' : '导入加密备份'),
    content: SizedBox(
      width: 440,
      child: SingleChildScrollView(
        child: Form(
          key: _form,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              HelpPanel(
                text: widget.exporting
                    ? '备份密码不会保存。请使用至少 8 个字符的独立密码，忘记后无法恢复。'
                    : '先验证备份密码和完整性，成功后才会合并到本机保险库。',
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _password,
                obscureText: _obscure,
                autofocus: true,
                decoration: InputDecoration(
                  labelText: '安全密码',
                  suffixIcon: IconButton(
                    onPressed: () => setState(() => _obscure = !_obscure),
                    icon: Icon(
                      _obscure ? Icons.visibility : Icons.visibility_off,
                    ),
                  ),
                ),
                validator: (value) =>
                    (value?.length ?? 0) < 8 ? '至少需要 8 个字符' : null,
              ),
              if (widget.exporting) ...[
                const SizedBox(height: 12),
                TextFormField(
                  controller: _confirm,
                  obscureText: _obscure,
                  decoration: const InputDecoration(labelText: '再次输入安全密码'),
                  validator: (value) =>
                      value != _password.text ? '两次密码不一致' : null,
                ),
              ],
            ],
          ),
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('取消'),
      ),
      FilledButton(
        onPressed: () {
          if (_form.currentState!.validate()) {
            Navigator.pop(context, _password.text);
          }
        },
        child: Text(widget.exporting ? '继续选择保存位置' : '继续选择备份文件'),
      ),
    ],
  );
}

class HelpPanel extends StatelessWidget {
  const HelpPanel({super.key, required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: Theme.of(
        context,
      ).colorScheme.primaryContainer.withValues(alpha: .55),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.help_outline, size: 19),
          const SizedBox(width: 9),
          Expanded(child: Text(text)),
        ],
      ),
    ),
  );
}

String? _required(String? value) =>
    value == null || value.trim().isEmpty ? '此项不能为空' : null;

void _showError(BuildContext context, Object error) {
  final text = error
      .toString()
      .replaceFirst('FormatException: ', '')
      .replaceFirst('Bad state: ', '');
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
}

Future<String?> showAuthenticatorCameraScanner(BuildContext context) =>
    Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const _AuthenticatorCameraScanner()),
    );

class _AuthenticatorCameraScanner extends StatefulWidget {
  const _AuthenticatorCameraScanner();

  @override
  State<_AuthenticatorCameraScanner> createState() =>
      _AuthenticatorCameraScannerState();
}

class _AuthenticatorCameraScannerState
    extends State<_AuthenticatorCameraScanner> {
  final _controller = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  bool _handled = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _detected(BarcodeCapture capture) {
    if (_handled) return;
    for (final barcode in capture.barcodes) {
      final value = barcode.rawValue?.trim();
      if (value == null || value.isEmpty) continue;
      _handled = true;
      Navigator.pop(context, value);
      return;
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('扫描验证器二维码'),
      actions: [
        IconButton(
          tooltip: '切换闪光灯',
          onPressed: _controller.toggleTorch,
          icon: const Icon(Icons.flashlight_on_outlined),
        ),
      ],
    ),
    body: Stack(
      fit: StackFit.expand,
      children: [
        MobileScanner(controller: _controller, onDetect: _detected),
        IgnorePointer(
          child: SafeArea(
            minimum: const EdgeInsets.fromLTRB(24, 16, 24, 24),
            child: Column(
              children: [
                Expanded(
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final available = math.min(
                        constraints.maxWidth,
                        constraints.maxHeight,
                      );
                      final size = math.min(
                        300.0,
                        math.max(0.0, available - 4),
                      );
                      return Center(
                        child: Container(
                          width: size,
                          height: size,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(
                              (size * 0.09).clamp(12.0, 24.0).toDouble(),
                            ),
                            border: Border.all(
                              color: Theme.of(context).colorScheme.primary,
                              width: 3,
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 12),
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(14),
                    child: Text(
                      '对准 Google Authenticator 或其他验证器导出的二维码。二维码只在本机解析。',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}

Future<bool> confirmAuthenticatorQrImport(
  BuildContext context,
  AuthenticatorQrResult result,
) async =>
    await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('导入 ${result.entries.length} 个 2FA 项目？'),
        content: SizedBox(
          width: 520,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 420),
            child: ListView(
              shrinkWrap: true,
              children: [
                const HelpPanel(text: '二维码与密钥不会上传。确认后将直接写入本机加密保险库，密钥不会显示在预览中。'),
                const SizedBox(height: 12),
                ...result.entries
                    .take(20)
                    .map(
                      (entry) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.password),
                        title: Text(entry.label),
                        subtitle: Text(
                          '${entry.issuer.isEmpty ? '未设置服务商' : entry.issuer} · '
                          '${entry.digits} 位 · ${entry.algorithm.wireName}',
                        ),
                      ),
                    ),
                if (result.entries.length > 20)
                  Text('另有 ${result.entries.length - 20} 个项目将一起导入。'),
                ...result.warnings.map(
                  (warning) => Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      warning,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.tertiary,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          FilledButton.icon(
            onPressed: () => Navigator.pop(context, true),
            icon: const Icon(Icons.lock_outline),
            label: const Text('安全导入'),
          ),
        ],
      ),
    ) ??
    false;
