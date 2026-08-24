# CodeHarbor V1.0.0

首个可用版本，提供本地优先的多邮箱验证码收件箱与 TOTP 2FA 动态码。

## 主要功能

- 163、126、QQ / Foxmail、Gmail、阿里、Outlook / Microsoft 365、Mail.com 及自定义 IMAP。
- CSV、TXT 和简洁文本格式批量导入，单次最多 500 项。
- 只读并发扫描最近邮件，提取验证码候选并一键复制。
- Base32 和 `otpauth://` TOTP，默认 6 位 / 30 秒 / SHA1，并兼容标准扩展。
- Windows DPAPI 加密保险库；没有遥测或云端同步。
- Windows x64 安装版与免安装便携版。

## 下载

- `CodeHarbor-Setup-1.0.0-x64.exe`：安装版。
- `CodeHarbor-Portable-1.0.0-x64.exe`：便携版。
- `SHA256SUMS.txt`：构建校验和。

## 验证结果

- TypeScript 检查通过。
- 13 项单元测试通过。
- Electron 开发构建与封装后 EXE 冒烟测试通过。
- 测试凭据未以明文落盘。
- 发布时 `npm audit` 为 0 个已知漏洞。

## 注意事项

- 仅用于本人拥有或明确获授权的邮箱与账户。
- 应用不提供自动登录、账号轮换或规避第三方平台规则的能力。
- Windows 文件尚未使用商业代码签名证书，SmartScreen 可能提示“未知发布者”。
- V1.0.0 能使用已有 OAuth2 访问令牌，但尚未内置 Google / Microsoft 授权和令牌刷新。
- Mail.com 的 IMAP 可能只向 Premium 套餐开放。
