# 内置工具清单（Provenance）

PC Connect 依赖以下第三方可执行文件，随应用分发（`electron-builder.yml` 的 `extraResources` 打包到 `resources/tools`）。

## 下载与校验

二进制**不入库**，由 [`scripts/fetch-tools.mjs`](../../scripts/fetch-tools.mjs) 在 `npm install`（postinstall）与打包前自动下载，并做 **SHA-256 校验**：

- 优先从 GitHub 官方 Releases 下载；
- GitHub 不可用时依次回退到 `ghfast.top`、`gh-proxy.com`、`ghproxy.net` 加速代理（内容仍以 SHA-256 校验为准）；
- 本地已存在且校验通过的文件会跳过下载。

> 安全说明：任何来源下载的文件都必须通过下表 SHA-256 校验，否则拒绝使用。请勿手动替换为来源不明的文件。

## 当前版本

| 文件 | 项目 | 版本 | 许可证 | SHA-256 |
|---|---|---|---|---|
| `mediamtx.exe` | [bluenviron/mediamtx](https://github.com/bluenviron/mediamtx/releases) | v1.18.2 | MIT | `D1465085C3C9BD211FD40FB863ACFD8EEF988EA6EA9E36422472659F82ED4AA9` |
| `cloudflared.exe` | [cloudflare/cloudflared](https://github.com/cloudflare/cloudflared/releases) | 2026.5.0 | Apache-2.0 | `F141CDED099C239171AD2CEA6FB5DA0FDAA2BD36104C3074D883F9546519EBA7` |

已与官方发布物逐一比对确认（2026-08）。

## 使用说明

- `mediamtx.exe` 启动时读取同目录下的 `mediamtx.yml`（已做安全加固：仅监听 127.0.0.1、禁用 RTSP/WebRTC/SRT、publish 仅限本机）。
- `cloudflared.exe` 由主进程以 `tunnel --url http://localhost:8888` 方式启动，提供公网临时播放链接。
- 版本核对命令：
  - `mediamtx.exe --version`
  - `cloudflared.exe --version`

## 升级流程

1. 下载新版本官方发布物，计算 SHA-256；
2. 更新本文件与 `scripts/fetch-tools.mjs` 中的版本号、下载 URL 与校验和；
3. 删除本地旧文件后执行 `npm run tools` 验证。
