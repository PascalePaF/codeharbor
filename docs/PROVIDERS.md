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

推荐开启 Google 两步验证后生成[应用专用密码](https://support.google.com/accounts/answer/185833)，并选择“授权码 / 应用密码”。若组织策略禁用应用专用密码，可选择 OAuth2 并输入有效访问令牌。

## 阿里邮箱

个人阿里邮箱预设为 `imap.aliyun.com:993`。企业邮箱若使用不同主机，可选择“自定义 IMAP”。阿里云的[官方服务器地址说明](https://help.aliyun.com/zh/document_detail/465307.html)列出了加密与非加密端口；CodeHarbor 推荐 993/TLS。

## Microsoft Outlook / 365

Microsoft 推荐 OAuth2。CodeHarbor V1.0.0 可使用现有 OAuth2 访问令牌，但不内置授权注册或刷新流程；令牌过期后需要更新。企业管理员可参考 Microsoft 的[IMAP OAuth 官方说明](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth)。仅在账户或租户仍允许时使用应用密码。

## Mail.com

使用 `imap.mail.com:993` 和 SSL/TLS。根据 Mail.com 的[官方帮助](https://support.mail.com/premium/imap/server.html)，需要先启用 POP3/IMAP；部分套餐可能不提供该功能。启用 2FA 后应使用应用专用密码。

## 自定义 IMAP

- 主机只填写域名，例如 `imap.example.com`，不要带 `https://`。
- TLS 直连通常使用端口 993。
- CodeHarbor 不接受无效或自签名证书，以避免中间人攻击。
- 若登录失败，优先确认 IMAP 已开启、用户名格式正确、授权码未过期，以及服务商没有限制第三方客户端。
