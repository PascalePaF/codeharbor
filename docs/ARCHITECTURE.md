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
  ├─ Backup Core ── scrypt + AES-256-GCM ── .chbackup
  ├─ MailboxService ── TLS + 只读 IMAP ── 邮箱服务商
  ├─ PostalMime ── 有大小和嵌套限制的 MIME 解析
  ├─ TOTP Core ── Node.js HMAC，本机离线计算
  └─ UpdateService ── GitHub Releases ── NSIS 差分更新与重启
```

## 关键边界

- `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`。
- 预加载脚本只暴露固定 IPC 方法，不暴露任意文件系统或网络能力。
- 渲染进程能提交新凭据，但列表接口只返回 `hasCredential`，不能读取秘密。
- IMAP 连接的日志被关闭；错误信息经过截断与友好化处理。
- IMAP 客户端始终注册传输层错误监听器，超时和断线会转成账户状态而不是未捕获异常。
- 每个账户只有一个操作队列；测试、手动扫描和自动扫描不会同时登录同一邮箱。
- 全量扫描采用 single-flight 合并，连续点击只复用正在进行的扫描任务。
- 最近 UID 经过排序和去重；同一邮箱 UIDVALIDITY 未变化时复用内存中的解析结果。
- 单封邮件的读取或 MIME 解析错误会单独跳过，不影响该邮箱其余邮件。
- 保险库写入通过队列串行化，并使用独立临时文件，避免批量操作时发生竞争。
- 导入先在内存中校验并构造新保险库，持久化失败时回滚，不留下半导入状态。
- 邮件扫描最多并发 3 个账户，单账户默认读取最近 24 小时、最多 30 封邮件。
- 验证码提取必须同时满足候选格式和登录/验证上下文；渲染进程只接收发件方、验证码、用途、账户与时间。

## 数据文件

安装版保险库位于可执行文件同目录下的 `CodeHarbor-Data/vault.json`；electron-builder 便携版根据 `PORTABLE_EXECUTABLE_DIR` 保存到启动 EXE 旁，而不是临时解包目录。实际路径可在“安全与设置”页面查看。

V1.0.1 首次启动会把 V1.0.0 用户数据目录中的有效保险库一次性复制、逐字节校验后迁移。安装版卸载脚本删除程序文件时会跳过 `CodeHarbor-Data`。邮箱凭据和 TOTP 密钥以系统加密密文保存；账户名称、邮箱地址、IMAP 主机和偏好设置属于非秘密元数据。

跨电脑导出不能直接复制绑定本机用户的 DPAPI 密文，因此主进程会短暂解密敏感字段，并立即用用户提供的独立备份密码重新加密为 `.chbackup`。导入后再用目标电脑的 safeStorage 加密。明文不会通过 IPC 返回渲染进程。

V1.0.2 继续使用保险库 `schemaVersion: 1`，加密备份有独立的格式版本。遇到无法识别或损坏的保险库时，应用不会静默覆盖原文件。

## 自动更新

安装包内包含由 electron-builder 生成的 GitHub 更新配置。安装版启动后由主进程检查 `latest.yml`，根据 SHA-512 校验并可利用 `.blockmap` 下载差异内容；下载完成后调用 NSIS 静默替换程序文件并重新启动。卸载宏跳过 `CodeHarbor-Data`，更新不会删除用户保险库。开发环境、烟雾测试和便携版返回明确的“不支持”状态，不执行替换。
