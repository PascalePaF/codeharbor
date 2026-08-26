# Android、iPhone 与 macOS 社区预览

CodeHarbor 的跨平台客户端位于 [`apps/codeharbor_flutter`](../apps/codeharbor_flutter)。它使用一套 Flutter 代码覆盖 Android、iOS 和 macOS，并保持与 Windows V1.0.2 相同的核心数据语义。

## 当前可用程度

| 平台 | 当前产物 | 能验证什么 | 仍需什么 |
| --- | --- | --- | --- |
| Android | 可安装的社区 Debug APK | 编译、启动、本机加密保险库、TOTP、文件导入导出、IMAP 代码路径 | 多品牌真机、各邮箱服务商与移动网络实测；正式签名 |
| iPhone / iPad | 无签名的 iOS Simulator `.app` | iOS 编译、模拟器启动、Keychain 与界面烟雾测试 | 真机与 Apple Developer 签名；TestFlight / App Store 发布 |
| macOS | 无签名的 `.app` 开发预览 | macOS 编译、沙箱权限、Keychain、文件选择和界面 | Apple Developer ID 签名、公证、Intel 与 Apple Silicon 真机覆盖 |

这些是社区开发预览，不是商店正式版。首次测试请使用专门的测试邮箱和测试 2FA 密钥，不要直接导入日常主账号。

## 没有 Mac 或手机虚拟机时如何开发

Windows 电脑仍然可以完成大部分工作：

```powershell
cd apps/codeharbor_flutter
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
```

- `flutter analyze` 检查所有 Dart 代码和三端共用界面。
- `flutter test` 在无模拟器的情况下测试 RFC 6238 TOTP、验证码识别、备份加密兼容性和响应式界面。
- Android APK 可以在 Windows 上直接编译；如本地网络代理拦截 Gradle，可让 GitHub Actions 代为构建。
- iOS 和 macOS 必须由 macOS/Xcode 编译。本仓库使用 GitHub 托管的 macOS runner，不要求维护者本地拥有 Mac。

## GitHub 云端测试

### 每次提交自动执行

[`mobile-ci.yml`](../.github/workflows/mobile-ci.yml) 会：

1. 在 Linux 上运行静态检查、单元测试和 Widget 测试。
2. 编译 Android Debug APK，并保存为 14 天的 Actions artifact。
3. 在 GitHub 的 macOS runner 上编译 iOS Simulator 和 macOS 开发预览，并保存 artifact。

### 按需启动模拟器

维护者可在 Actions 中手动运行 [`mobile-device-smoke.yml`](../.github/workflows/mobile-device-smoke.yml)：

- Android job 启动 API 35 模拟器，并运行 `integration_test/app_smoke_test.dart`。
- iOS job 启动 GitHub macOS runner 中可用的 iPhone Simulator，并运行同一个烟雾测试。
- macOS job 直接启动构建后的应用，并运行同一个本机保险库与界面烟雾测试。

GitHub 托管 runner 会为每个任务提供干净的临时环境；构建产物可作为 workflow artifact 下载。参考 [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) 和 [workflow artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts)。

## Apple 平台的客观限制

- Flutter 可以从同一代码库构建 Android、iOS 和 macOS，支持范围见 [Flutter supported platforms](https://docs.flutter.dev/reference/supported-platforms)。
- iOS 模拟器编译不等于真机发布。真机安装至少需要 Apple ID、Xcode 和开发签名；TestFlight/App Store 需要 Apple Developer Program，见 [Flutter iOS deployment](https://docs.flutter.dev/deployment/ios)。
- 可公开下载并顺利打开的 macOS 正式包还需要 Developer ID 签名和 Apple 公证，见 [Flutter macOS deployment](https://docs.flutter.dev/deployment/macos)。
- 因此，仓库可以自动确认“能编译、能启动、核心测试通过”，但不能替代真实 iPhone、iPad、Apple Silicon Mac 和不同网络环境下的人工测试。

## 数据与安全设计

- 设备保险库：随机 256 位主密钥存入 Android Keystore 或 Apple Keychain；邮箱凭据和 TOTP 密钥放入 AES-256-GCM 加密的应用文件。
- 跨设备迁移：继续使用 `.chbackup`；scrypt 参数、AES-256-GCM AAD 和 JSON schema 与 Windows V1.0.2 兼容。
- 邮箱访问：IMAP TLS，证书必须有效；以 `EXAMINE` 只读方式打开 `INBOX`；只在最近邮件中提取具备验证语义的代码。
- 无 CodeHarbor 后端、无遥测、无云同步；备份密码不会保存。

## 社区最需要的测试

提交 Issue 时只写脱敏结果，不要上传密码、授权码、OAuth2 令牌、TOTP 密钥、邮件原文或 `.chbackup` 文件。

优先需要：

1. Android 24–37 的真机启动、文件导入导出和后台恢复。
2. iOS 15+ 真机上的 Keychain、文件选择器、横竖屏和大字体。
3. macOS 12+ 的 Intel / Apple Silicon 构建、沙箱网络和文件权限。
4. 使用测试账户验证 163、126、QQ、Gmail、阿里、Outlook 和 Mail.com 的 IMAP 行为。
5. Apple 正式签名、公证、TestFlight 流程和可复现发布。

请使用 `mobile`、`android`、`ios`、`macos` 标签提交问题或 Pull Request，并附上系统版本、设备型号、构建号、脱敏步骤和测试结果。
