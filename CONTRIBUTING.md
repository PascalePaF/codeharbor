# Contributing

## 开发流程

1. 从 `main` 创建短生命周期分支：`feat/...`、`fix/...`、`docs/...`。
2. 保持改动聚焦，不提交真实邮箱、凭据、保险库或导入文件。
3. 桌面端改动提交前运行 `npm run verify` 和 `npm audit --audit-level=high`；跨平台客户端改动运行 `flutter analyze` 与 `flutter test`。
4. 使用清晰的提交前缀，例如 `feat:`、`fix:`、`test:`、`docs:`、`chore:`。
5. 通过 Pull Request 合并，说明安全影响、测试证据和界面变化。

## 安全要求

- 新的 IPC 方法必须在预加载层显式列入允许清单，并验证参数。
- 不得把凭据或邮件正文写入日志、异常遥测、Issue 或测试快照。
- 邮箱访问保持只读；任何写邮件、删邮件、标记已读功能都需要单独安全评审。
- 引入依赖前检查维护状态、传递依赖和已知漏洞。
- 移动端 Issue、测试截图和 Actions artifact 不得包含真实邮箱、授权码、OAuth2 令牌、TOTP 密钥或备份文件。

## Android、iOS 与 macOS

跨平台客户端位于 `apps/codeharbor_flutter`：

```powershell
cd apps/codeharbor_flutter
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
```

没有 Mac 也可以贡献共用逻辑和界面。Pull Request 会由 GitHub 的 macOS runner 编译 iOS Simulator 和 macOS 版本。真实 Apple 设备测试、正式签名和公证请按 [移动端社区预览说明](docs/MOBILE_COMMUNITY_PREVIEW.md) 提交脱敏证据。

## 版本规则

- 补丁版本：缺陷、安全修复，不改变导入格式。
- 次版本：向后兼容的新服务商或功能。
- 主版本：保险库格式、导入格式或安全边界存在不兼容变更。
