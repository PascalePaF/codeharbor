# CodeHarbor Mobile & macOS Community Preview

这是 Android、iPhone/iPad 模拟器和 macOS 的 V1.0.3 社区开发预览。

## 已实现

- 同一套 Flutter 界面覆盖 Android、iOS 和 macOS，并按手机与桌面宽度自适应。
- 163、126、QQ、Gmail、阿里个人/企业、Outlook/365、Mail.com 和自定义 IMAP 配置。
- ChatGPT 登录专用只读 IMAP 扫描，只接受 OpenAI 官方 OTP 地址的 6 位码；新安装默认扫描最近 5 小时。
- 6/8 位 TOTP，支持 SHA1、SHA256、SHA512、Base32 和 `otpauth://`。
- Android/iPhone 相机扫码、Android/iOS/macOS 图片二维码导入，以及 Google Authenticator 批量迁移格式。
- Android Keystore / Apple Keychain 保护设备主密钥，本机保险库使用 AES-256-GCM。
- 与 Windows V1.0.2 字节级兼容的密码加密 `.chbackup` 导入导出。
- GitHub Actions 的无模拟器测试、Android 编译、iOS Simulator 编译和 macOS 编译。

## 下载说明

- `CodeHarbor-Android-community-debug.apk`：测试用途的 Debug 签名 APK，可以在 Android 测试设备上安装。
- `CodeHarbor-iOS-Simulator.zip`：仅供安装到 iOS Simulator，不能直接安装到实体 iPhone。
- `CodeHarbor-macOS-unsigned.zip`：未签名、未公证的开发产物，仅供开发者验证，不能视为正式 macOS 安装包。

## 测试边界

本预览尚未经过正式 Apple 签名、公证、TestFlight 或多型号真机覆盖。请仅使用测试邮箱和测试密钥，并通过 Issue 提交脱敏结果。不要公开上传任何真实凭据、验证码、邮件原文或备份文件。

验证器导出二维码等同于完整 2FA 密钥，请勿把二维码截图提交到社区。图片和二维码内容仅在设备本机解析。

完整测试与参与方法见 [Android、iPhone 与 macOS 社区预览](https://github.com/PascalePaF/codeharbor/blob/main/docs/MOBILE_COMMUNITY_PREVIEW.md)。
