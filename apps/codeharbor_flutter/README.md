# CodeHarbor 跨平台客户端

这是 CodeHarbor 验证码港的 Flutter 社区预览客户端，一套代码覆盖 Android、iOS 和 macOS。当前版本为 `1.0.3`。

## 已实现

- 本机加密邮箱与 TOTP 保险库
- ChatGPT 登录专用的只读 IMAP OTP 扫描，默认最近 5 小时
- RFC 6238 TOTP（6/8 位、SHA1/SHA256/SHA512）
- Android/iPhone 相机扫码、三端图片导入，以及 Google Authenticator 批量迁移二维码
- 与 Windows V1.0.2 兼容的密码加密 `.chbackup` 导入导出
- 黑夜/白天主题与手机、平板、桌面响应式界面

## 本地检查

```sh
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
```

iOS 与 macOS 需要 macOS/Xcode。仓库的 GitHub Actions 会在托管的 macOS runner 上编译这两个平台，并可手动运行 iPhone Simulator 烟雾测试。

完整状态、限制与社区测试说明见仓库根目录的 [`docs/MOBILE_COMMUNITY_PREVIEW.md`](../../docs/MOBILE_COMMUNITY_PREVIEW.md)。请勿在 Issue、日志或测试数据中包含真实密码、授权码、OAuth2 令牌、TOTP 密钥、验证码邮件原文或备份文件。
