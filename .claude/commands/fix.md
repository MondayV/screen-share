# 指令：通过 MediaMTX API 动态添加推流路径

## 目标
移除对 `mediamtx.yml` 中 `all_others` 配置的依赖，改为应用在生成密钥后自动调用 MediaMTX API 添加路径，确保推流路径始终有效。

## 修改步骤
1. **在 `src/main/index.ts` 中添加 `add-mediamtx-path` IPC handler**，向 `http://localhost:9997/v3/config/paths/add` 发送 POST 请求，参数为 `{ name: <streamKey>, source: 'publisher' }`。
2. **在 `src/preload/index.ts` 中暴露 `addMediamtxPath` 方法**。
3. **在 `src/renderer/src/Host.svelte` 的 `startShare` 函数中**，生成 `streamKey` 后立即调用 `await window.electronAPI.addMediamtxPath(streamKey)`。
4. **清除旧的诊断面板**（如果有残留的 `checkPushStatus`、健康检查等代码）。
5. **构建并测试**：`rm -rf release out && npm run build:win`。
   - 主持人点击“开始共享”后，在 MediaMTX 日志中应看到路径被添加，且推流正常。
   - 观众端不再出现 `path is not configured` 错误。

## 验收标准
- 不再需要手动编辑 `mediamtx.yml`。
- 每次生成的随机密钥都能正常推流和播放。
- 所有用户（包括新安装的朋友）均可直接使用。