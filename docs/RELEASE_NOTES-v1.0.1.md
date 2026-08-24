# CodeHarbor V1.0.1

V1.0.1 重点解决跨电脑迁移与邮箱连接稳定性。

## 新增

- “安全与设置”中新增完整加密备份与恢复。
- 一个 `.chbackup` 文件包含全部邮箱、凭据、2FA 密钥和扫描设置。
- 导入到另一台电脑后，会使用该电脑的系统安全存储重新加密。
- 设置页新增各邮箱服务商的认证教程和官方帮助入口。
- 阿里个人邮箱与阿里企业邮箱使用独立预设。

## 修复

- 修复邮箱账户三点菜单被容器裁切、显示不全的问题。
- 修复 IMAP `Socket timeout` 触发 Electron 主进程异常弹窗的问题。
- 优化认证失败、IMAP 未开启、DNS、证书、拒绝连接和超时提示。
- Gmail 明确要求 16 位应用专用密码；6 位 2FA 动态码不能用于 IMAP 登录。
- 修复批量导入部分数据行可能被误判为 CSV 表头的问题。

## 数据位置

- 安装版：`<安装目录>\CodeHarbor-Data\vault.json`
- 便携版：`<便携 EXE 所在目录>\CodeHarbor-Data\vault.json`
- 首次运行 V1.0.1 会安全迁移 V1.0.0 的旧保险库；安装版卸载时保留新数据目录。

升级、移动或卸载前仍建议导出 `.chbackup`。备份密码不会被保存，丢失后无法恢复。

## 下载

- `CodeHarbor-Setup-1.0.1-x64.exe`：Windows 安装版。
- `CodeHarbor-Portable-1.0.1-x64.exe`：Windows x64 便携版。
- `SHA256SUMS.txt`：发布资产校验和。

Windows 构建尚未使用商业代码签名证书，首次运行可能出现 SmartScreen 提示。
