# 隐私政策（PRIVACY）

最后更新：2026-08

PC Connect（"本应用"）重视你的隐私。本政策说明应用如何处理你的数据。

## 我们收集什么

- **本地配置**：用户名、界面偏好、主题、OBS WebSocket 密码（使用操作系统级加密，仅存于本机）。
- **推流数据**：当你作为主持人共享屏幕时，音视频流由本机运行的 MediaMTX 处理，并经由 Cloudflare 免费隧道（trycloudflare.com）转发给持有你分享链接的观众。

## 我们不做的事

- **无遥测**：应用不收集任何使用统计、崩溃报告或分析数据。
- **无账号**：无需注册，不保存你的身份信息到服务器。
- **无中间服务器**：视频流不经过我们控制的任何服务器；隧道由 Cloudflare 提供，链接有效期内任何人凭链接即可观看。

## 数据存储与安全

- 所有配置保存在你本机的应用数据目录。
- OBS 密码通过 Electron safeStorage（Windows DPAPI / macOS Keychain）加密存储。
- 分享链接包含流密钥，**任何拿到链接的人都能观看你的屏幕**；请仅在可信范围内分享，结束共享后请停止推流。

## 第三方

- 公网转发由 Cloudflare quick tunnel 提供，其数据处理见 [Cloudflare 隐私政策](https://www.cloudflare.com/privacypolicy/)。
- 本应用内置的开源组件（MediaMTX、cloudflared、Electron 等）许可信息见"关于"页面。

## 联系我们

如有隐私相关问题，请在 [GitHub Issues](https://github.com/MondayV/screen-share/issues) 提出。
