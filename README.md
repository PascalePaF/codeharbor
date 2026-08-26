<p align="center">
  <img src="build/icon.png" width="96" alt="CodeHarbor 图标" />
</p>

<h1 align="center">CodeHarbor 验证码港</h1>

<p align="center">本地优先的 Windows 多邮箱验证码收件箱与 TOTP 2FA 管理器</p>

<p align="center">
  <a href="https://github.com/PascalePaF/codeharbor/releases/latest"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/PascalePaF/codeharbor?style=flat-square"></a>
  <a href="https://github.com/PascalePaF/codeharbor/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/PascalePaF/codeharbor/ci.yml?branch=main&style=flat-square&label=CI"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20x64-2563eb?style=flat-square">
  <img alt="Version" src="https://img.shields.io/badge/version-V1.0.2-16825d?style=flat-square">
</p>

![CodeHarbor 验证码工作台](docs/screenshots/overview.png)

> CodeHarbor 只适用于你本人拥有或已获明确授权管理的邮箱与 2FA 项目。项目不提供自动登录、账号轮换、绕过平台限额或规避服务条款的功能。

## 核心能力

- 集中管理 163、126、QQ / Foxmail、Gmail、阿里个人、阿里企业、Microsoft Outlook / 365、Mail.com 和自定义 IMAP 邮箱。
- CSV / TXT 批量导入最多 500 个邮箱或 2FA 项目，并支持邮箱、2FA 各自独立的加密导入和加密导出。
- 三栏验证码工作台：左侧逐个查询邮箱，中间只显示发件方、验证码与用途，右侧显示实时 TOTP。
- “立即扫描全部邮箱”以最多 3 个并发只读连接批量扫描；普通邮件、订单号和跟踪号不会进入验证码结果。
- Base32 密钥或完整 `otpauth://` 链接生成 TOTP，支持 SHA1 / SHA256 / SHA512、6 / 8 位及 15–120 秒周期。
- 邮箱凭据和 2FA 密钥由 Windows DPAPI 等系统安全存储加密；应用没有遥测、云同步或 CodeHarbor 后端。
- `.chbackup` 使用 scrypt 密码派生和 AES-256-GCM 认证加密，可在不同电脑之间迁移。
- 安装版从 GitHub Releases 自动检查和下载新版本，下载完成后自动更新并重新启动。
- 高对比度黑夜 / 白天主题、清晰中文字体、完整页面滚动和字段悬停帮助。

| 验证码工作台 | 邮箱账户 | 2FA 动态码 | 安全与设置 |
| --- | --- | --- | --- |
| ![收件箱](docs/screenshots/overview.png) | ![邮箱账户](docs/screenshots/accounts.png) | ![2FA](docs/screenshots/totp.png) | ![设置](docs/screenshots/settings.png) |

## 安装

请从 [最新 Release](https://github.com/PascalePaF/codeharbor/releases/latest) 下载：

- `CodeHarbor-Setup-1.0.2-x64.exe`：推荐的 Windows 安装版，支持以后直接在软件内部自动更新。
- `CodeHarbor-Portable-1.0.2-x64.exe`：免安装便携版；因没有安装上下文，不支持内部自动替换。
- `SHA256SUMS.txt`：安装包校验值。

V1.0.2 是自动更新功能的起点。旧版本没有更新程序，因此需要手动安装 V1.0.2 一次；之后安装版可自动升级到后续版本。当前构建尚未使用商业代码签名证书，Windows SmartScreen 首次运行时可能显示提示。

默认数据位置：

- 安装版：安装目录下的 `CodeHarbor-Data`。
- 便携版：便携 EXE 同级的 `CodeHarbor-Data`。

卸载或更新安装版时会保留这个数据目录。仍建议定期导出密码加密备份。

## 快速开始

1. 在邮箱官网开启 IMAP，并生成该服务商要求的客户端授权码、应用专用密码或 OAuth2 访问令牌。
2. 在“邮箱账户”页面添加邮箱，先执行“测试”确认连接成功。
3. 在“验证码收件箱”左侧查询单个邮箱，或点击“立即扫描全部邮箱”。
4. 在“2FA 动态码”页面输入 Base32 密钥或粘贴 `otpauth://` 链接；通常选择 6 位、30 秒、SHA1。
5. 换电脑前，为邮箱或 2FA 单独导出加密备份，也可以在设置中导出全部数据。

完整格式见 [批量导入格式](docs/IMPORT_FORMATS.md)，服务商准备步骤见 [邮箱服务商指南](docs/PROVIDERS.md)。

## 邮箱认证说明

| 服务商 | IMAP 地址 | 应填写的凭据 | 重要说明 |
| --- | --- | --- | --- |
| 网易 163 | `imap.163.com:993` | 客户端授权码 | 先开启 IMAP/SMTP，不填网页登录密码 |
| 网易 126 | `imap.126.com:993` | 客户端授权码 | 先开启 IMAP/SMTP，不填网页登录密码 |
| QQ / Foxmail | `imap.qq.com:993` | IMAP 授权码 | 不填 QQ 登录密码 |
| Gmail | `imap.gmail.com:993` | 16 位应用专用密码，或 OAuth2 访问令牌 | Google 账户的 6 位 2FA 动态码不能用于 IMAP 登录 |
| 阿里个人邮箱 | `imap.aliyun.com:993` | 邮箱密码 | 适用于 `@aliyun.com` |
| 阿里企业邮箱 | `imap.qiye.aliyun.com:993` | 三方客户端安全密码 | 需管理员允许第三方客户端 |
| Outlook / Microsoft 365 | `outlook.office365.com:993` | OAuth2 访问令牌 | 当前版本接收已有令牌，不负责申请或刷新 |
| Mail.com | `imap.mail.com:993` | 应用密码或邮箱密码 | IMAP 可能仅向部分套餐开放 |

邮箱账户本身不需要再输入“邮箱 2FA 动态码”。2FA 用于在网页上确认登录；IMAP 客户端通常使用单独生成的授权码、应用专用密码或 OAuth2 令牌。

## 加密备份

- 导出时必须设置至少 8 个字符的独立安全密码，并再次确认。
- 每次导出都使用新的随机盐和随机 IV，通过 scrypt 派生 256 位密钥，再以 AES-256-GCM 加密并验证完整性。
- 密码不会保存；忘记密码后备份无法恢复。
- 导入时先验证密码和文件完整性，再在目标电脑上用该系统的安全存储重新加密。
- 可以导出全部数据，也可以只导出邮箱或只导出 2FA；导入时只合并所选范围。

## 安全边界

- Electron 渲染进程启用上下文隔离和沙箱，禁用 Node.js 集成，仅暴露最小化 IPC 接口。
- IMAP 强制 TLS 1.2 及以上并校验证书，以只读方式打开 `INBOX`，不会将邮件标记为已读。
- 单封邮件最多解析 1 MiB，并限制 MIME 嵌套与邮件头大小。
- 敏感字段不写入日志；仓库和发布包不包含真实账户、密钥或保险库文件。

系统安全存储无法防御同一系统用户下已经运行的恶意软件或管理员级攻击。验证码复制后可能进入 Windows 剪贴板历史。完整威胁模型见 [安全模型](docs/SECURITY_MODEL.md)，漏洞报告方式见 [SECURITY.md](SECURITY.md)。

## 本地开发

要求 Windows 10/11、Node.js 24+、npm 11+。

```powershell
npm ci
npm run dev
```

```powershell
npm run typecheck   # TypeScript 检查
npm test            # 单元测试
npm run smoke       # Electron 启动、交互和安全烟雾测试
npm run verify      # 类型检查 + 测试 + 应用构建
npm run dist        # Windows 安装版、便携版和更新清单
```

构建产物位于 `release/`。进程边界见 [架构说明](docs/ARCHITECTURE.md)。

## 已知限制

- 只扫描 `INBOX`，不遍历垃圾邮件、归档或自定义文件夹。
- 当前不内置 Google / Microsoft OAuth 授权页面和令牌刷新；需要填写现有访问令牌，Gmail 也可使用应用专用密码。
- 验证码由本地规则识别。为减少误报，没有登录/验证语义的普通数字会被忽略。
- 自动更新仅适用于 Windows 安装版；便携版需下载新文件。
- 安装包暂未使用商业代码签名证书。

## 项目管理与许可证

- [变更记录](CHANGELOG.md)
- [贡献说明](CONTRIBUTING.md)
- [安全策略](SECURITY.md)
- [V1.0.2 发布说明](docs/RELEASE_NOTES-v1.0.2.md)

本仓库公开用于透明审查和版本发布，但当前并未授予复制、修改或再分发许可；详见 [LICENSE](LICENSE)。请勿在 Issue、日志或提交中包含真实密码、授权码、OAuth2 令牌、TOTP 密钥、验证码邮件原文或保险库文件。

## 独立实现与参考

CodeHarbor 参考了 [qlerky-tui](https://github.com/Aero25x/qlerky-tui) 的本地多账户左右分栏思路、[2fast](https://github.com/2fast-team/2fast) 的单文件加密备份体验，以及 [authenticator-sh/2fa](https://github.com/authenticator-sh/2fa) 的密码保护导入导出边界。项目没有复制或打包这些项目的源码；邮箱会话、验证码筛选、界面、数据模型、加密备份和 TOTP 均为本仓库的 TypeScript 独立实现。
