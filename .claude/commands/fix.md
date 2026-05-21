# 指令：在设置面板中添加 OBS WebSocket 密码输入框

## 目标
让用户可以在应用设置界面中输入 OBS WebSocket 连接密码，并持久化保存到 localStorage，避免硬编码密码在代码中。

## 修改文件
- `src/renderer/src/SettingsModal.svelte`（或实际的设置面板组件）
- `src/renderer/src/lib/obs-controller.ts`（已存在）

## 修改步骤

### 1. 在设置面板中添加密码输入框
找到设置面板组件，在合适位置（例如“OBS 连接设置”区域）添加以下 HTML：

```html
<div class="setting-item">
  <label for="obs-password">OBS WebSocket 密码</label>
  <input
    type="password"
    id="obs-password"
    bind:value={obsWebSocketPassword}
    placeholder="留空表示无密码"
  />
  <button on:click={saveOBSPassword}>保存</button>
</div>
2. 在组件的 <script> 中添加变量和方法
ts
let obsWebSocketPassword = '';

// 读取已保存的密码
function loadOBSPassword() {
  const saved = localStorage.getItem('obs-websocket-password');
  if (saved) {
    obsWebSocketPassword = saved;
  }
}

// 保存密码到 localStorage
function saveOBSPassword() {
  localStorage.setItem('obs-websocket-password', obsWebSocketPassword.trim());
  // 可选：提示保存成功
}

// 在 onMount 中加载
import { onMount } from 'svelte';
onMount(() => {
  loadOBSPassword();
});
3. 更新 obs-controller.ts 使用 localStorage 密码
在 src/renderer/src/lib/obs-controller.ts 中，修改 connectToOBS 函数获取密码的逻辑，确保从 localStorage 读取：

ts
function getOBSWebSocketPassword(): string {
  return localStorage.getItem('obs-websocket-password') || '';
}

export async function connectToOBS(): Promise<void> {
  obs = new OBSWebSocket();
  const password = getOBSWebSocketPassword();
  try {
    await obs.connect('ws://localhost:4455', password);
    console.log('[OBS] 已连接');
  } catch (err) {
    console.error('[OBS] 连接失败:', err);
    throw new Error('无法连接到 OBS，请确认 WebSocket 已启用且密码正确');
  }
}
4. 确保密码字段样式与现有皮肤一致
使用已有的 CSS 变量和类名，避免破坏 UI 风格。如：

css
.setting-item {
  margin: 8px 0;
}
.setting-item label {
  display: block;
  font-size: 14px;
}
.setting-item input {
  width: 100%;
  padding: 6px;
  margin: 4px 0;
}
5. 重新构建并测试
清理：rm -rf release out

构建：npm run build:win

测试：打开应用 → 进入设置 → 输入 OBS WebSocket 密码 → 保存 → 开始共享，确认能正常连接 OBS。

验收标准
设置面板出现 OBS WebSocket 密码输入框

密码保存到 localStorage，关闭应用再打开仍保留

连接 OBS 时使用已保存的密码，无需用户每次输入

样式与当前皮肤一致