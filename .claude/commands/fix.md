# 指令：OBS 手动降级 + CSP 加固 + 发布 v2.2.2

## 目标
1. OBS 连接失败时不中断流程，进入手动推流模式（仅启动 MediaMTX + cloudflared，生成公网链接，提示用户手动推流）。
2. 确保生产环境 CSP 允许连接 `ws://localhost:4455`。
3. 重新构建安装包并发布 v2.2.2 修复版本。
4. 更新 README 中的使用说明，强调首次需配置 OBS WebSocket。

## 修改步骤

### 1. 应用 OBS 手动降级逻辑
- 打开 `src/renderer/src/Host.svelte`。
- 按照 `obs-fallback.md` 指令中的要求，修改 `startShare` 和 `stopShare` 函数，增加 `obsManualMode` 状态。
- 在 UI 中添加手动模式提示（当 `obsManualMode` 为 `true` 时显示 OBS 配置和手动推流指引）。

### 2. 加固 CSP 配置
- 检查 `src/renderer/index.html` 的 `<meta>` 标签，确认 `connect-src` 包含 `ws://localhost:4455` 和 `ws://127.0.0.1:4455`。
- 为避免缓存问题，在主进程 `src/main/index.ts` 中 **额外添加 CSP 头**（双重保险）：
  ```ts
  app.on('web-contents-created', (_, contents) => {
    contents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; connect-src 'self' ws: wss: https://*.trycloudflare.com ws://localhost:4455 ws://127.0.0.1:4455; media-src 'self' blob: https://*.trycloudflare.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"
          ]
        }
      });
    });
  });
这样即使 HTML 中的 meta 未生效，主进程也会强制添加 CSP。

3. 升级版本号并构建
修改 package.json 版本为 2.2.2。

清理构建：rm -rf release out && npm run build:win。

4. 更新 README.md
在“使用教程”部分明确标注：

markdown
### ⚠️ 重要：首次使用前请配置 OBS
1. 打开 OBS Studio，点击 **工具 → obs-websocket 设置**。
2. 勾选“启用 WebSocket 服务器”，默认端口 4455，可设置密码（应用内需填写）。
3. 如果不想自动推流，可直接在 OBS 中手动开始推流（应用会显示推流地址和密钥）。
5. 提交并发布
bash
git add -A
git commit -m "fix: OBS连接失败时手动降级，加固CSP，发布v2.2.2"
git tag v2.2.2 -m "v2.2.2 修复OBS连接问题，支持手动推流"
git push origin main --tags
gh release create v2.2.2 release/PCConnect\ Setup\ 2.2.2.exe --title "v2.2.2 修复OBS连接问题" --notes "修复：OBS未启动时不再报错，自动进入手动模式；加固CSP，确保连接本地WebSocket"
验收标准
安装新版本后，即使 OBS 未启动，点击“开始共享”也能生成公网链接，并显示手动推流指引。

打开 OBS 并正确配置 WebSocket 后，可自动连接推流。

安装包在所有环境中都能正常连接 OBS（CSP 不再拦截）。