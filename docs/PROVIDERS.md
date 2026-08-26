# 邮箱服务商准备指南

CodeHarbor 只读取标准 IMAP，不会代替邮箱服务商完成安全验证。添加前应在对应邮箱网页端开启第三方客户端访问。

## 163 / 126

1. 登录邮箱网页版并进入 POP3/SMTP/IMAP 设置。
2. 开启 IMAP/SMTP 服务。
3. 按页面要求完成手机验证并生成客户端授权码。
4. 在 CodeHarbor 中粘贴授权码，不要填写网页登录密码。

## QQ / Foxmail

1. 打开 QQ 邮箱的“设置 → 账号与安全 / 第三方服务”。
2. 开启 IMAP/SMTP 服务并生成授权码。
3. 用户名使用完整邮箱地址，密码栏填写授权码。

## Gmail

先开启 Google 两步验证，再生成 [16 位应用专用密码](https://support.google.com/accounts/answer/185833?hl=zh-Hans)，在 CodeHarbor 中选择“应用专用密码”并粘贴它。

Google 登录密码和每 30 秒变化的 6 位 2FA 动态码都不是 IMAP 凭据。若组织策略不显示应用专用密码，可选择 OAuth2 并输入已有的有效访问令牌；V1.0.2 不负责申请或刷新令牌。

## 阿里个人邮箱

适用于 `@aliyun.com`，服务器为 `imap.aliyun.com:993`。先在邮箱设置中开启 IMAP，再填写完整邮箱地址与邮箱密码。阿里云[个人邮箱官方说明](https://help.aliyun.com/zh/document_detail/465307.html)列出了服务器和端口。

## 阿里企业邮箱

服务器为 `imap.qiye.aliyun.com:993`。管理员需允许第三方客户端，用户再生成“三方客户端安全密码”，不要直接填写网页登录密码。参见阿里云[第三方客户端安全密码说明](https://help.aliyun.com/zh/document_detail/444269.html)。

## Microsoft Outlook / 365

Microsoft 要求 OAuth2 / Modern Auth。CodeHarbor V1.0.2 可使用现有 OAuth2 访问令牌，但不内置授权注册或刷新流程；令牌过期后需要更新。先按 [Outlook IMAP 官方设置](https://support.microsoft.com/en-US/Outlook/pop-imap-and-smtp-settings-for-outlook-com)允许 IMAP，再由管理员参考 Microsoft 的 [IMAP OAuth 官方说明](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth)取得包含 IMAP 权限的令牌。普通邮箱密码加 6 位验证码不是该登录流程。

## Mail.com

使用 `imap.mail.com:993` 和 SSL/TLS。根据 Mail.com 的[官方排错说明](https://support.mail.com/pop-imap/setup-emailprogram-fails.html)，需要先启用 POP3/IMAP；部分套餐可能不提供该功能。

## 自定义 IMAP

- 主机只填写域名，例如 `imap.example.com`，不要带 `https://`。
- TLS 直连通常使用端口 993。
- CodeHarbor 不接受无效或自签名证书，以避免中间人攻击。
- 若登录失败，优先确认 IMAP 已开启、用户名格式正确、授权码未过期，以及服务商没有限制第三方客户端。

## 常见错误判断

- “认证失败”：通常是把网页登录密码、短信码或 6 位 2FA 填到了授权码字段。
- “IMAP 尚未开启”：回到邮箱网页设置中开启第三方客户端访问。
- “连接超时”：检查代理、防火墙是否允许 TCP 993；V1.0.2 会把这类错误留在账户状态，不再弹出主进程异常框。
