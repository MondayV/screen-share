# 指令：观众端失败后无法退出连接状态

## 问题
观众输入链接点击观看后，若主持人未推流或流密钥错误，索引文件返回 404，但界面没有提供取消或返回按钮，用户无法退出播放状态重新输入链接，只能重启应用。

## 修复目标
- 在等待/播放/错误状态下，增加“返回”按钮，允许用户中断并回到初始输入界面。
- 点击返回时，彻底清理定时器、HLS 实例，重置所有状态变量。
- 当发生致命错误时，自动停止等待并显示错误提示，同时提供返回按钮。

## 修改文件
- `src/renderer/src/Join.svelte`

## 修改内容

### 1. 增加“返回”按钮
在模板中，当 `streamStatus` 不为 `'idle'` 时显示返回按钮，放置在播放器区域或底部。
```html
{#if streamStatus !== 'idle'}
  <button on:click={resetView}>← 返回</button>
{/if}
按钮样式可使用现有皮肤变量，保持简洁。

2. 实现重置函数 resetView
ts
function resetView() {
  // 清除重试定时器
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  // 销毁 HLS 播放器
  if (hls) {
    hls.destroy();
    hls = null;
  }
  // 停止视频元素
  if (videoElement) {
    videoElement.pause();
    videoElement.src = '';
    videoElement.load();
  }
  // 重置状态
  streamStatus = 'idle';
  playUrl = '';
  errorShown = false;
  notification = '';
}
3. 在发生致命错误时调用重置
修改 Hls.Events.ERROR 监听器，在 data.fatal 为真时，可以显示错误并调用 resetView，或保持显示错误提示并让用户手动点击返回。推荐显示错误通知，同时显示返回按钮。

4. 在 onDestroy 中确保清理
ts
onDestroy(() => {
  resetView(); // 或直接清理定时器和 HLS
});
5. 调整 UI 状态显示
idle：输入框 + “观看”按钮

waiting：等待提示 + 返回按钮

playing：视频播放 + 返回按钮

error：错误信息 + 返回按钮

验证
观众输入无效链接或主持人未推流，点击观看 → 显示等待/错误，可点击返回重新输入。

播放中点击返回，视频停止，回到初始界面。

返回后再次输入正确的链接，能正常播放