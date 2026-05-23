# 指令：修复停止推流反馈 + 首次失败时引导设置 OBS 密码

## 问题
1. 主持方停止推流后，“流到达服务器”状态灯未更新。
2. 观众端停止推流后收到 404，反复重试无友好提示。
3. 第一次开始共享时，如果 OBS WebSocket 密码缺失或错误，未引导用户进入设置页面。

## 修复目标
1. 停止推流后，主持方状态灯在 10 秒内变更为“推流已停止”。
2. 观众端收到 404 后，停止重试并显示“主持人已结束推流”，提供返回按钮。
3. 点击“开始共享”时，若 OBS 连接失败（特别是密码错误），弹出提示并直接打开设置页面，供用户填写/修改密码。

## 修改文件
- `src/renderer/src/Host.svelte`
- `src/renderer/src/Join.svelte`
- `src/renderer/src/SettingsModal.svelte`（如果需要调整）

## 实施步骤

### 1. 主持方：增加推流状态检测的连续失败计数器
- 在 `<script>` 中添加 `let pathFailCount = 0;`
- 修改 `refreshAllStatus` 中的推流检测部分：
  ```ts
  const path = await window.electronAPI.checkPathActive(streamKey);
  if (path.active) {
    pathActive = true;
    pathReason = '';
    pathFailCount = 0;
  } else {
    pathFailCount++;
    if (pathFailCount >= 2) {
      pathActive = false;
      pathReason = path.reason || '推流已停止';
    }
  }
在 stopShare 中重置 pathFailCount = 0; pathActive = false;

2. 观众端：处理 404 错误
在 Join.svelte 的 HLS 错误监听中增加：

ts
if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.response?.code === 404) {
  hls.destroy();
  errorMessage = '主持人已结束推流。';
  isStreamEnded = true;
}
在模板中添加结束提示和关闭按钮（复用已有的 resetView 函数）。

3. 首次失败时引导设置密码
在 Host.svelte 的 startShare 中，如果 OBS 连接或推流因认证失败而失败，执行：

ts
if (obsError && obsError.includes('身份验证失败') || obsError.includes('密码错误')) {
  openSettings(); // 打开设置弹窗
}
openSettings 函数直接设置 showSettings = true，确保 SettingsModal 组件已引入并能接收 close 事件。

如果 SettingsModal 中尚无 OBS 密码字段，请确保之前保留的 save-obs-password 和 get-obs-password IPC 以及设置界面中的密码输入框完整。

4. 设置页面：保留 OBS 密码输入框
确认 SettingsModal.svelte 中存在一个 type="password" 输入框，绑定 obsPasswordInput。

确认 saveOBSPassword 和 loadOBSPassword 函数存在，并使用主进程提供的安全存储 IPC。

5. 构建与测试
清理：rm -rf release out

构建：npm run build:win

测试：

主持人开始推流，状态灯变绿；停止推流，10 秒内状态灯变灰。

观众端停止推流后，显示结束提示并停止重试。

首次使用或密码错误时，点击“开始共享”后弹出设置页面，用户可填入密码并保存。

验收标准
停止推流后的反馈及时准确。

观众端结束提示友好，不再反复报错。

密码错误时自动引导用户进入设置页面，无需手动寻找。