# 批量导入格式

## 邮箱账户

最简单的 TXT 格式是一行一个账户：

```text
demo@163.com----客户端授权码
demo@qq.com----IMAP授权码
```

也支持 `|`、Tab 或英文逗号作为分隔符。若需要指定更多字段，使用带表头的 UTF-8 CSV：

```csv
email,password,provider,label,username,auth_mode,imap_host,imap_port,tls
demo@163.com,在此填写授权码,163,工作邮箱,demo@163.com,password,,,true
custom@example.com,在此填写密码,custom,企业邮箱,custom@example.com,password,imap.example.com,993,true
```

字段说明：

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `email` | 是 | 完整邮箱地址，也是自动识别服务商的依据 |
| `password` | 是 | 授权码、应用专用密码、邮箱密码或 OAuth2 访问令牌 |
| `provider` | 否 | `163`、`126`、`qq`、`gmail`、`aliyun`、`outlook`、`mailcom`、`custom` |
| `label` | 否 | 界面显示名称，默认等于邮箱地址 |
| `username` | 否 | IMAP 登录用户名，默认等于完整邮箱地址 |
| `auth_mode` | 否 | `password` 或 `oauth2`，默认 `password` |
| `imap_host` | 自定义时必填 | 自定义 IMAP 主机名 |
| `imap_port` | 否 | 默认 993 |
| `tls` | 否 | `true` / `false`，默认 `true` |

中文表头也可使用：`邮箱`、`授权码`、`服务商`、`名称`、`用户名`、`认证方式`、`服务器`、`端口`、`加密`。

同一“邮箱 + 服务商”重复导入时会更新现有账户。单次最多 500 行；错误行会在导入结果中单独列出，不影响其他有效行。

## TOTP 2FA

可每行粘贴一个标准链接：

```text
otpauth://totp/Example:alice@example.com?secret=BASE32SECRET&issuer=Example
```

或使用简单文本格式：

```text
主账户----BASE32SECRET----示例服务
备用账户----ANOTHERBASE32SECRET----示例服务
```

CSV 格式：

```csv
label,secret,issuer,digits,period,algorithm
示例账户,JBSWY3DPEHPK3PXP,示例服务,6,30,SHA1
```

`digits` 支持 6 或 8；`period` 支持 15–120 秒；`algorithm` 支持 SHA1、SHA256、SHA512。

## 安全提示

- 导入文件包含可直接访问邮箱或生成 2FA 的敏感信息。
- 完成导入后请安全删除明文文件，不要上传到网盘、聊天工具、Issue 或 Git 仓库。
- 仓库的 `.gitignore` 已忽略 `.env`、密钥与证书文件，但不能替代人工检查。
