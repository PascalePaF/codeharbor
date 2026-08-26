import 'package:codeharbor_app/app_controller.dart';
import 'package:codeharbor_app/main.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('renders the cross-platform shell', (tester) async {
    final controller = AppController()..ready = true;
    await tester.pumpWidget(CodeHarborApp(controller: controller));
    await tester.pump();

    expect(find.text('CodeHarbor 验证码港'), findsOneWidget);
    expect(find.text('扫描全部'), findsOneWidget);
    expect(find.text('验证码邮件'), findsOneWidget);

    controller.dispose();
  });
}
