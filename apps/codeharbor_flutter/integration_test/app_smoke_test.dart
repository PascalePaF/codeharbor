import 'dart:io';

import 'package:codeharbor_app/app_controller.dart';
import 'package:codeharbor_app/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('opens an encrypted empty vault and renders the shell', (
    tester,
  ) async {
    final controller = AppController();
    await controller.initialize();
    expect(controller.startupError, isNull);

    await tester.pumpWidget(CodeHarborApp(controller: controller));
    await tester.pump(const Duration(seconds: 2));

    expect(find.text('CodeHarbor 验证码港'), findsOneWidget);
    expect(find.text('扫描全部'), findsOneWidget);

    await tester.tap(find.text('2FA'));
    await tester.pumpAndSettle();
    expect(find.text('图片导入'), findsOneWidget);
    if (Platform.isAndroid || Platform.isIOS) {
      expect(find.text('扫码导入'), findsOneWidget);
    }
    controller.dispose();
  });
}
