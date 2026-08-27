# CodeHarbor V1.0.3

V1.0.3 将验证码收件箱收敛为 ChatGPT 登录专用，并加入验证器二维码导入。

## 主要更新

- 仅显示来自 `noreply@tm.openai.com` 或 `otp@tm1.openai.com` 的 6 位 ChatGPT 登录 OTP，其余邮件全部忽略。
- 新安装默认扫描最近 5 小时；升级用户已有的自定义扫描范围不会被覆盖。
- Windows 可上传二维码图片，Android/iPhone 可使用相机扫码或图片导入，macOS 可选择图片导入。
- 支持标准 TOTP 二维码和 Google Authenticator 批量迁移二维码，包括多二维码批次提示。
- 二维码离线解析，确认界面不显示密钥；拒绝登录/恢复二维码和无效载荷。

## Windows 下载

- `CodeHarbor-Setup-1.0.3-x64.exe`：推荐安装版，可在以后通过应用内更新。
- `CodeHarbor-Portable-1.0.3-x64.exe`：便携版。
- `SHA256SUMS.txt`：安装包校验值。

本版本仍未使用商业代码签名证书，Windows SmartScreen 可能在首次运行时显示提示。更新或迁移前请先导出密码加密备份。

## 安全提示

验证器导出二维码包含可生成 2FA 动态码的完整密钥。请只导入本人拥有或获授权管理的项目，不要把二维码截图、真实验证码、邮箱凭据或备份文件上传到 GitHub Issue。
