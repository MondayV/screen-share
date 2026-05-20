# 指令：重构为 OBS 串流模式 + 全面清理残留文件

## 目标
1. 将屏幕共享架构从 **WebRTC + 信令服务器** 彻底改为 **OBS 推流 + restream.io 中继 + 应用内 HLS 播放**。
2. **删除所有与 ngrok、cloudflared、临时隧道相关的文件、脚本、配置**。
3. 保留 Electron 外壳、安装更新流程、UI 皮肤系统，仅替换核心共享逻辑。
4. 最终生成 v2.0.0 安装包，让朋友打开应用即可观看，无需任何网络配置。

## 前置条件
- 用户已注册 [restream.io](https://restream.io) 免费账号（每月 10 事件，每事件 2 小时，足够日常使用）。
- 已获取 restream.io 的 **API Key**（在 Settings → API 页面生成）。
- Cloudflare Worker `screen-share-signal` 已部署，用于存储房间码与流地址映射。
- 本地 OBS Studio 已安装（主持人端需手动推流）。

## 执行步骤

### 第一步：全面清理残留文件（ngrok / cloudflared / 旧信令）
1. **删除 ngrok 相关文件**：
   - 删除 `C:\ngrok-v3` 整个目录（如果存在）。
   - 删除 `C:\Users\MONv\scoop\apps\ngrok` 目录（如果通过 Scoop 安装）。
   - 删除项目根目录下可能残留的 `ngrok.exe`、`ngrok.yml`。
2. **删除 cloudflared 相关文件**：
   - 删除 `C:\Users\MONv\scoop\apps\cloudflared` 目录（如果存在）。
   - 删除项目内任何 `cloudflared` 可执行文件或配置文件。
3. **删除旧的测试脚本和临时文件**：
   - 删除 `test-two.bat`、`test-two.sh`（之后可重建专用测试脚本）。
   - 删除 `test-simple.ps1`、`build-portable.ps1` 等临时脚本。
   - 删除 `release/` 下所有旧的绿版文件夹和安装包（保留 `release/` 目录本身）。
4. **删除旧的本地信令服务器残留**：
   - 确认 `src/main/signaling-server.js` 或任何 `server.js` 已移除。
   - 从 `package.json` 的 `dependencies` 中移除 `ws`、`@p2pcf/worker`、`@p2pcf/client`（如果存在）。
   - 执行 `npm uninstall ws @p2pcf/worker @p2pcf/client`。
5. **清理泄露的 token 痕迹**（安全）：
   - 检查 `src/` 下是否有硬编码的 `3Dz0CN8g...`（ngrok authtoken），若有则删除并替换为环境变量或用户输入。
   - 提醒用户：**立即登录 ngrok 控制台撤销旧 token，并生成新 token（已建议过，但必须再次强调）**。

### 第二步：移除所有 WebRTC 和信令交换代码
1. **删除核心 WebRTC 模块**：
   - 删除 `src/renderer/src/lib/webrtc.ts`（整个文件）。
   - 删除 `src/renderer/src/lib/signaling.ts`（旧的 WebSocket 信令文件）。
2. **清理 Svelte 组件中的 WebRTC 调用**：
   - 在 `Host.svelte`、`Join.svelte`、`WebRTC.svelte` 中移除所有 `RTCPeerConnection`、`createOffer`、`addIceCandidate` 等代码。
   - 移除 `remoteScreen` 视频元素上的 `ontrack` 等事件处理。
   - **保留** `src/renderer/src/Utils.ts` 中的 `makeVideoDraggable`（可能后续用于播放器拖动）。
3. **清理主进程**：
   - 从 `src/main/index.ts` 中移除所有与 `desktopCapturer`、`get-sources` 相关的 IPC 处理（不再需要屏幕捕获权限）。
   - 移除 `session.setPermissionRequestHandler` 中有关 `media` 的请求。
   - 移除 `electron-builder.yml` 中不必要的权限声明（如 `audioCapture`、`videoCapture`）。

### 第三步：集成 restream.io API
1. **新建 `src/renderer/src/lib/restream.ts`**：
   ```ts
   const RESTREAM_API = 'https://api.restream.io/v1';

   export async function createEvent(apiKey: string): Promise<{ rtmpUrl: string; streamKey: string; hlsUrl: string; eventId: string }> {
     const res = await fetch(`${RESTREAM_API}/events`, {
       method: 'POST',
       headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
       body: JSON.stringify({ title: 'Screen Share', description: 'PcConnect session' })
     });
     if (!res.ok) throw new Error('Failed to create restream event');
     const data = await res.json();
     return {
       rtmpUrl: data.rtmp_url,
       streamKey: data.stream_key,
       hlsUrl: data.hls_url,
       eventId: data.id
     };
   }

   export async function endEvent(apiKey: string, eventId: string): Promise<void> {
     await fetch(`${RESTREAM_API}/events/${eventId}`, {
       method: 'DELETE',
       headers: { 'Authorization': `Bearer ${apiKey}` }
     });
   }
添加 API Key 存储：

在 Host.svelte 的 <script> 中增加 let apiKey = ''。

首次使用时弹出输入框，要求输入 restream API Key（提供获取链接）。

存储在 localStorage 中，后续自动读取。

第四步：改造 Cloudflare Worker 支持 KV 存储
更新 signal-worker/wrangler.toml，增加 KV 命名空间：

toml
[[kv_namespaces]]
binding = "ROOMS"
id = "your-kv-id"   # AI 需提示用户手动创建 KV 命名空间并填入 ID
修改 signal-worker/src/index.js，添加房间映射 API：

js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/room/')) {
      const code = url.pathname.split('/').pop();
      if (request.method === 'PUT') {
        const data = await request.json();
        await env.ROOMS.put(code, JSON.stringify(data));
        return new Response(null, { status: 204 });
      } else if (request.method === 'GET') {
        const value = await env.ROOMS.get(code);
        if (!value) return new Response('Room not found', { status: 404 });
        return new Response(value, { headers: { 'Content-Type': 'application/json' } });
      }
    }
    // 原信令逻辑可删除，或保留但不再使用
    return new Response('PC Connect Stream', { status: 200 });
  }
};
重新部署 Worker：

在 signal-worker 目录执行 npx wrangler deploy。

第五步：重构主持人界面（Host.svelte）
按钮行为变更：

“开始共享”按钮调用 restream.createEvent(apiKey)，获得推流地址和密钥。

将事件数据（hlsUrl, rtmpUrl, streamKey）与生成的 6 位房间码存入 Worker KV（PUT /api/room/:code）。

界面显示：

房间码（超大字体，一键复制）

推流地址（rtmp://...）和推流密钥（隐藏显示，可复制）

提示信息：请打开 OBS → 设置 → 流 → 自定义流媒体服务器，填入上述地址和密钥，然后点击“开始推流”。

“停止共享”按钮：

调用 restream.endEvent(apiKey, eventId)。

从 KV 中删除房间数据（DELETE /api/room/:code 或标记过期）。

通知观众“推流已结束”。

第六步：重构观众界面（Join.svelte）
输入房间码后，调用 Worker GET /api/room/:code 获取 hlsUrl。

使用 hls.js 播放 HLS 流：

安装依赖：npm install hls.js

在组件中引入 Hls，检测流地址并加载到 <video> 元素。

显示加载状态：“正在连接流媒体…” → 连接成功后全屏播放。

移除所有旧的远程控制、批注等 WebRTC 特有功能（以后可按需重新实现）。

第七步：测试与打包
本地双端测试流程：

主持人启动应用 → 点击开始共享 → 获得房间码和推流地址。

主持人在 OBS 中填入推流地址开始推流（可用摄像头或窗口捕获测试）。

观众启动应用 → 输入房间码 → 应能观看到流。

解决常见问题：

如果 HLS 无法加载，检查 hlsUrl 是否正确，以及是否在 OBS 推流成功后几秒才播放（HLS 延迟）。

确保 Worker KV 已创建且绑定。

生成安装包：

执行 npm run build:win

升级版本号至 2.0.0，提交代码并打标签 v2.0.0

上传 release/pc-connect-2.0.0-setup.exe 到 GitHub Releases

第八步：最终安全提醒
所有 token（restream API Key、ngrok authtoken）必须由用户通过设置界面输入，绝不可硬编码。

撤销之前泄露的 ngrok authtoken（登录 ngrok 网站操作）。

检查代码中无硬编码的 Cloudflare 账号信息。

验收标准
项目根目录无 ngrok*、cloudflared*、test-two.*、旧信令脚本。

应用启动无任何 WebSocket 连接错误。

主持方点击开始共享后直接看到推流地址和房间码，无需选择屏幕（由 OBS 负责）。

观众输入房间码后直接观看 HLS 流，延迟 1-3 秒。

安装包正常生成，安装卸载流程完好。