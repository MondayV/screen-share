# 指令：基础稳定性优化（重连、打包、自适应码率）

## 目标
确保 `screen-share` 应用在网络波动、意外断线时能自动恢复，支持跨平台打包分发，并根据网络状况动态调整音视频质量，降低延迟。

## 规则
- 仅输出需要修改的文件名和最小 diff，不重写已有代码。
- 所有 UI 文案使用中文。
- 分三步执行，每步完成后等待“继续”指令。

---

## 步骤一：WebRTC 断线自动重连

1. 在 `PeerConnection` 建立后，监听 `iceconnectionstatechange` 和 `connectionstatechange` 事件。
2. 状态变为 `disconnected` 或 `failed` 时，自动尝试重新建立连接：
   - 等待 3 秒后，若仍为断开状态，清理当前 PeerConnection，重新执行信令交换（createOffer/Answer）。
   - 重试最多 3 次，每次间隔 3 秒，全失败后 UI 显示“连接丢失，请检查网络”，并提供手动重试按钮。
3. 重连期间，用户界面显示“网络不稳定，正在重连…”的轻提示，不影响现有共享画面（可暂时显示最后一帧或黑屏）。
4. 修改文件：`src/lib/webrtc.js`（或对应连接模块），以及相应的 Svelte 状态组件。

## 步骤二：跨平台打包配置

1. 检查并完善 `electron-builder` 配置（`package.json` 的 `build` 字段或独立 `electron-builder.yml`）。
2. 添加以下打包目标：
   - Windows：`nsis`（一键安装包）
   - macOS：`dmg`（同时配置 `category` 和 `entitlements`）
   - Linux：`AppImage`
3. 修复路径问题：确保信令服务器（已内嵌主进程）和静态资源在打包后能正确加载（使用 `app.getAppPath()` 等动态路径）。
4. 添加 `electron-updater` 依赖，配置自动更新源（可先留 GitHub Releases 示例，实际仓库替换为你的 GitHub 地址）。
5. 修改 `package.json` 的 `scripts`，新增 `"dist": "electron-builder"` 命令。
6. 首次打包后，Mac 用户需签名公证（可暂时跳过，但保留注释说明）。

## 步骤三：自适应音视频码率

1. 在 `PeerConnection` 上启用 `getStats()` 定时轮询（每 3 秒一次），提取：
   - `packetsLost` / `packetsSent` 计算丢包率
   - `roundTripTime` 估算 RTT
2. 根据丢包率和 RTT 动态调整发送端参数：
   - 丢包率 > 5% 或 RTT > 300ms：降低分辨率至 720p，帧率 20fps，码率上限 1.5 Mbps。
   - 丢包率 > 15% 或 RTT > 500ms：进一步降至 480p，帧率 15fps，码率 800 Kbps。
   - 丢包率恢复至 2% 以下持续 10 秒：恢复初始高质量。
3. 使用 `RTCRtpSender.setParameters()` 动态修改 `maxBitrate` 和 `scaleResolutionDownBy`（若浏览器不支持，则通过 SDP 重新协商）。
4. 用户可手动切换“质量优先”或“流畅优先”预设，覆盖自动策略。
5. 修改文件：`src/lib/webrtc.js`，增加 `src/lib/rate-controller.js`，UI 部分增加质量预设选择。

## 验收标准
- 拔掉网线或切换网络后，应用自动重连，不超过 15 秒恢复画面，期间有中文提示。
- 执行 `npm run dist` 能生成 Windows `.exe` 和 macOS `.dmg` 安装包，安装后所有功能正常。
- 在网络限速工具（如 Chrome DevTools 网络限速）下，共享画面自动降低清晰度且不卡死，网络恢复后画质回升。