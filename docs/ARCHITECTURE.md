# 架构说明

CodeHarbor 使用 Electron、React 与 TypeScript，采用主进程持有秘密、渲染进程只接收脱敏数据的结构。

```text
React 渲染进程
  ├─ 账户 / 导入 / 验证码 / TOTP 界面
  └─ 最小化 window.codeHarbor API
              │ contextBridge + allowlist IPC
              ▼
Electron 主进程
  ├─ VaultStore ── 系统 safeStorage ── 加密 vault.json
  ├─ MailboxService ── TLS + 只读 IMAP ── 邮箱服务商
  ├─ PostalMime ── 有大小和嵌套限制的 MIME 解析
  └─ TOTP Core ── Node.js HMAC，本机离线计算
```

## 关键边界

- `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`。
- 预加载脚本只暴露固定 IPC 方法，不暴露任意文件系统或网络能力。
- 渲染进程能提交新凭据，但列表接口只返回 `hasCredential`，不能读取秘密。
- IMAP 连接的日志被关闭；错误信息经过截断与友好化处理。
- 保险库写入通过队列串行化，并使用独立临时文件，避免批量操作时发生竞争。
- 邮件扫描最多并发 3 个账户，单账户默认读取最近 24 小时、最多 30 封邮件。

## 数据文件

保险库由 Electron 的 `userData` 目录管理，实际路径可在“安全与设置”页面查看。邮箱凭据和 TOTP 密钥分别以 Base64 编码的系统加密密文保存；账户名称、邮箱地址、IMAP 主机和偏好设置属于非秘密元数据。

V1.0.0 使用 `schemaVersion: 1`。遇到无法识别或损坏的保险库时，应用不会静默覆盖原文件。
