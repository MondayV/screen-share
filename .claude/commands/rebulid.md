# 指令：集成 OBS WebSocket，实现一键遥控推流

## 目标
通过 OBS WebSocket 协议，让应用直接控制 OBS Studio 的推流行为，实现真正的“一键共享”：
- 点击“开始共享”后，自动启动 OBS 推流（无需用户手动操作 OBS）
- 停止共享时自动停止 OBS 推流
- 保持现有 MediaMTX + cloudflared 架构不变

## 前置条件
- OBS Studio 已安装并启用 obs-websocket 插件（OBS 28+ 已内置，无需额外安装）
- 在 OBS 中：**工具 → obs-websocket 设置**，确保启用 WebSocket 服务器，默认端口 4455，**记下密码**（或设置为无密码，仅本地使用）

## 修改步骤

### 1. 安装 obs-websocket-js 库
在项目根目录执行：
```bash
npm install obs-websocket-js
2. 创建 OBS 控制模块
新建 src/renderer/src/lib/obs-controller.ts，内容如下：

ts
import OBSWebSocket from 'obs-websocket-js';

let obs: OBSWebSocket | null = null;

// 连接到 OBS WebSocket 服务器
export async function connectToOBS(): Promise<void> {
  obs = new OBSWebSocket();
  try {
    await obs.connect('ws://localhost:4455', '你的密码'); // 如无密码，第二个参数留空 ''
    console.log('[OBS] 已连接');
  } catch (err) {
    console.error('[OBS] 连接失败:', err);
    throw new Error('无法连接到 OBS，请确认 OBS 已启动并开启 WebSocket 服务');
  }
}

// 获取当前推流状态
export async function getStreamStatus(): Promise<boolean> {
  if (!obs) return false;
  const { outputActive } = await obs.call('GetStreamStatus');
  return outputActive;
}

// 开始推流
export async function startStream(): Promise<void> {
  if (!obs) throw new Error('OBS 未连接');
  await obs.call('StartStream');
  console.log('[OBS] 推流已开始');
}

// 停止推流
export async function stopStream(): Promise<void> {
  if (!obs) return;
  await obs.call('StopStream');
  console.log('[OBS] 推流已停止');
}

// 断开连接
export function disconnectOBS(): void {
  if (obs) {
    obs.disconnect();
    obs = null;
    console.log('[OBS] 已断开');
  }
}
3. 改造主持方界面 (Host.svelte)
在 <script> 中引入 OBS 控制模块：

ts
import { connectToOBS, startStream, stopStream, disconnectOBS } from './lib/obs-controller';
修改 startShare 函数，在获取公网链接后自动启动 OBS 推流：

ts
async function startShare() {
  try {
    // 1. 连接 OBS
    await connectToOBS();
    
    // 2. 启动 MediaMTX + cloudflared（原有逻辑）
    await window.electronAPI.startMediamtx();
    const domain = await window.electronAPI.startCloudflared();
    streamKey = Math.random().toString(36).substring(2, 8).toUpperCase();
    publicUrl = `https://${domain}/${streamKey}/index.m3u8`;
    
    // 3. 设置 OBS 推流信息（通过 WebSocket）
    // 注意：这里假设用户已在 OBS 中配置好推流地址为 rtmp://localhost:1935
    // 如果未配置，可引导用户手动设置，或通过 obs-websocket 动态修改（更复杂）
    
    // 4. 启动 OBS 推流
    await startStream();
    
    isStreaming = true;
  } catch (err) {
    console.error('启动失败:', err);
    alert('启动失败，请检查 OBS 是否已启动并开启 WebSocket 服务');
  }
}
修改 stopShare 函数：

ts
async function stopShare() {
  try {
    await stopStream();          // 停止 OBS 推流
  } catch {}
  disconnectOBS();               // 断开 OBS 连接
  window.electronAPI.stopAll();  // 停止 MediaMTX 和 cloudflared
  isStreaming = false;
  streamKey = '';
  publicUrl = '';
}
在组件销毁时断开 OBS：

ts
import { onDestroy } from 'svelte';
onDestroy(() => {
  disconnectOBS();
});
4. 添加 OBS 连接状态提示（可选）
在 UI 中增加一个状态指示：

ts
let obsConnected = false;
// 在 connectToOBS 成功后设置 obsConnected = true
模板中添加：

html
{#if isStreaming}
  <div class="status">🟢 OBS 已连接，正在推流</div>
{/if}
5. 配置 OBS 推流地址（首次引导）
由于应用无法直接通过 WebSocket 修改 OBS 的推流服务器和密钥，需要在首次使用时引导用户手动设置一次：

显示文本：“首次使用请先在 OBS 中设置：推流服务 → 自定义，服务器 rtmp://localhost:1935，串流密钥任意（应用将自动同步）”

或者，应用在启动时检查 OBS 的 StreamSettings，如果未配置则弹出引导对话框。

高级选项：可以使用 obs-websocket 的 SetStreamSettings 方法动态修改推流地址，但实现较复杂，可作为后续优化。

6. 重新构建并测试
清理构建：rm -rf release out

重新打包：npm run build:win

测试流程：

启动 OBS，确保 WebSocket 已启用
启动应用，点击“开始共享”
应用自动连接 OBS → 启动推流 → 生成公网链接
观众端输入链接观看
主持人点击“停止共享” → OBS 推流停止 → 链接失效
7. 验收标准
主持人点击“开始共享”后，OBS 自动开始推流，无需手动操作 OBS

停止共享时 OBS 自动停止推流

如果 OBS 未启动，应用给出明确提示