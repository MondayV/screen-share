# 指令：观众端增加“等待主持人推流”状态提示

## 问题
观众端目前无法知晓主持人是否已开始推流，只能反复尝试加载，体验较差。

## 目标
- 观众输入播放链接点击“观看”后，先检查流是否可用。
- 若主持人尚未推流（索引文件返回 404），则显示“正在等待主持人推流…”并自动重试，不弹出错误。
- 一旦检测到流可用，自动进入正常播放状态。
- 避免用户看到循环错误弹窗，同时清楚告知当前状态。

## 修改文件
- `src/renderer/src/Join.svelte`（观众端组件）

## 修改内容

### 1. 添加状态变量
在 `<script>` 中增加：
```ts
let streamStatus = 'idle'; // 'idle' | 'waiting' | 'playing' | 'error'
let retryTimer: ReturnType<typeof setTimeout> | null = null;
2. 实现流检测函数
ts
async function checkStreamAvailable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForStream(url: string) {
  streamStatus = 'waiting';
  const available = await checkStreamAvailable(url);
  if (available) {
    startPlayback(url); // 原有播放函数
    streamStatus = 'playing';
  } else {
    // 5 秒后重试
    retryTimer = setTimeout(() => waitForStream(url), 5000);
  }
}
3. 修改“观看”按钮点击逻辑
在原来的 watch() 函数中，先停止之前的重试，再调用 waitForStream：

ts
function watch() {
  if (!playUrl || !videoElement) return;
  if (retryTimer) clearTimeout(retryTimer);
  errorShown = false;
  waitForStream(playUrl);
}
4. UI 状态显示
在模板中根据 streamStatus 显示不同提示：

waiting：显示“正在等待主持人推流…（自动重试中）”

playing：显示正常播放画面（原有逻辑）

error：显示错误提示（原有逻辑）

idle：初始状态

可使用简单的文字或图标，保持皮肤风格。

5. 清理定时器
在组件销毁时清除重试定时器：

ts
import { onDestroy } from 'svelte';
onDestroy(() => {
  if (retryTimer) clearTimeout(retryTimer);
  if (hls) { hls.destroy(); hls = null; }
});
验收标准
观众输入链接点击“观看”，若主持人未推流，界面显示“正在等待主持人推流…”。

观众无需手动重试，应用每 5 秒自动检测一次。

主持人开始推流后，检测到流可用，自动进入播放状态。

整个过程无错误弹窗。

若主持人已推流，加载过程平滑，不显示等待状态。