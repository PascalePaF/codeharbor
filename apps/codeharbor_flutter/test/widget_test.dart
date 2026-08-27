import 'package:codeharbor_app/app_controller.dart';
import 'package:codeharbor_app/main.dart';
import 'package:codeharbor_app/models/models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('renders the cross-platform shell', (tester) async {
    final controller = AppController()..ready = true;
    await tester.pumpWidget(CodeHarborApp(controller: controller));
    await tester.pump();

    expect(find.text('CodeHarbor 验证码港'), findsOneWidget);
    expect(find.text('扫描全部'), findsOneWidget);
    expect(find.text('ChatGPT 登录验证码'), findsOneWidget);

    controller.dispose();
  });

  testWidgets('adapts inbox across phone, compact desktop and wide desktop', (
    tester,
  ) async {
    final now = DateTime.utc(2026, 8, 28);
    final controller = AppController()
      ..ready = true
      ..data = VaultData(
        accounts: [
          MailAccount(
            id: 'responsive-account',
            label: '非常长的跨设备工作邮箱账户名称用于响应式布局测试',
            email: 'responsive-long-account@example.com',
            provider: ProviderId.netease163,
            username: 'responsive-long-account@example.com',
            credential: 'test-only-credential',
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
            id: 'responsive-totp',
            label: '非常长的 2FA 账户名称用于测试大字体和窄窗口',
            issuer: '非常长的身份验证服务商名称',
            secret: 'JBSWY3DPEHPK3PXP',
            digits: 8,
            period: 30,
            algorithm: TotpAlgorithm.sha1,
            createdAt: now,
            updatedAt: now,
          ),
        ],
      )
      ..messages = [
        VerificationMessage(
          id: 'responsive-message',
          accountId: 'responsive-account',
          accountLabel: '测试工作邮箱',
          accountEmail: 'responsive@example.com',
          provider: ProviderId.netease163,
          sender: 'ChatGPT <noreply@tm.openai.com>',
          receivedAt: now,
          codes: const ['702434', '876543'],
          purpose: 'ChatGPT 登录验证码',
        ),
      ];
    addTearDown(controller.dispose);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    tester.view.devicePixelRatio = 1;
    for (final testCase in const [
      (size: Size(320, 568), scale: 2.0),
      (size: Size(360, 800), scale: 1.35),
      (size: Size(667, 375), scale: 2.0),
      (size: Size(900, 650), scale: 1.35),
      (size: Size(1440, 900), scale: 1.35),
    ]) {
      tester.view.physicalSize = testCase.size;
      tester.platformDispatcher.textScaleFactorTestValue = testCase.scale;
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpWidget(CodeHarborApp(controller: controller));
      await tester.pump();
      if (find.text('702434').evaluate().isEmpty) {
        await tester.drag(find.byType(ListView).first, const Offset(0, -420));
        await tester.pump();
      }
      expect(find.text('702434'), findsOneWidget);
      expect(find.text('876543'), findsOneWidget);
      if (testCase.size.width >= 1000) {
        expect(
          tester.getCenter(find.text('702434')).dx,
          greaterThan(
            tester.getCenter(find.text('ChatGPT <noreply@tm.openai.com>')).dx,
          ),
        );
      }
      expect(
        tester.takeException(),
        isNull,
        reason:
            'layout overflow at ${testCase.size} with ${testCase.scale}x text',
      );
    }

    tester.view.physicalSize = const Size(320, 568);
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    await tester.pumpWidget(CodeHarborApp(controller: controller));
    await tester.tap(find.text('邮箱'));
    await tester.pumpAndSettle();
    expect(find.text('非常长的跨设备工作邮箱账户名称用于响应式布局测试'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('2FA'));
    await tester.pumpAndSettle();
    if (find.text('非常长的 2FA 账户名称用于测试大字体和窄窗口').evaluate().isEmpty) {
      await tester.drag(find.byType(ListView).first, const Offset(0, -520));
      await tester.pump();
    }
    expect(find.text('非常长的 2FA 账户名称用于测试大字体和窄窗口'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
