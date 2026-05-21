# 指令：修复 HLS 流 404 导致反复弹窗的问题

## 问题描述
观众方连接后能看到画面，但反复弹出“无法加载流，请检查设置”。控制台显示部分请求返回 404。
原因是 HLS 媒体分片请求失败时，应用直接弹窗报错且未做去重处理，导致错误循环提示。

## 修复目标
1. 改进 HLS 播放器的错误处理：区分致命错误（流不存在）和可恢复错误（网络抖动），避免重复弹窗。
2. 增加自动重试机制：网络错误静默重试，致命错误提示用户检查推流状态。
3. 优化错误提示：仅当错误状态改变时显示一次通知，不循环弹窗。

## 修改文件
`src/renderer/src/Join.svelte` 或包含 HLS 播放器初始化的组件。

## 修改内容

### 1. 引入 Hls 并添加错误监听
在 `<script>` 中确保导入 `Hls`，并在创建播放器实例后绑定错误事件。

```ts
import Hls from 'hls.js';

let hls: Hls | null = null;
let errorShown = false; // 防止重复弹窗

function startPlayback(url: string) {
  if (hls) {
    hls.destroy();
    hls = null;
  }
  errorShown = false;

  if (Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
    });
    hls.loadSource(url);
    hls.attachMedia(videoElement);

    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        // 致命错误：弹窗提示并停止自动重试
        if (!errorShown) {
          errorShown = true;
          showNotification('无法加载流，请确认主持人已开始推流或流密钥正确');
        }
        hls?.destroy();
        hls = null;
      } else {
        // 非致命错误：静默重试，不弹窗
        console.warn('[HLS] 非致命错误，自动重试中...', data.details);
      }
    });
  } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
    videoElement.src = url;
  }
}
2. 添加通知函数（去重）
在组件中增加一个简单的通知显示逻辑，同一个错误仅显示一次。

ts
let notification = '';

function showNotification(msg: string) {
  // 仅显示一次相同消息
  if (notification === msg) return;
  notification = msg;
  // 3 秒后自动清除（或通过关闭按钮）
  setTimeout(() => { notification = ''; }, 5000);
}
3. 在模板中显示错误通知
在 Join.svelte 的 HTML 部分，添加通知区域：

html
{#if notification}
  <div class="notification error">{notification}</div>
{/if}
4. 清理播放器
在组件销毁时（onDestroy）销毁 HLS 实例。

ts
import { onDestroy } from 'svelte';
onDestroy(() => {
  if (hls) {
    hls.destroy();
    hls = null;
  }
});
验证
主持方在 未推流 的情况下生成播放链接，观众方输入链接后应只弹一次错误提示，不再循环弹窗。

主持方开始推流后，观众方重新加载链接（重新点击观看），应能正常播放，无错误提示。

播放过程中若网络抖动导致分片失败，播放器应静默重试，不弹窗。