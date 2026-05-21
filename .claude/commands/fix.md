# 指令：优化 OBS 密码错误提示，增加快捷修改入口

## 目标
- 当 OBS WebSocket 连接因密码错误失败时，提供友好的错误提示框，并包含一个“打开设置”按钮。
- 点击按钮后自动打开设置面板，用户修改密码后可直接重试。
- 保留现有的安全存储和设置页面逻辑。

## 修改文件
- `src/renderer/src/Host.svelte`
- `src/renderer/src/SettingsModal.svelte`（如果存在独立的设置弹窗组件）

## 修改步骤

### 1. 在 Host.svelte 中添加错误处理与设置弹窗控制
在 `<script>` 中增加变量和方法：

```ts
import { connectToOBS, startStream, stopStream, disconnectOBS } from './lib/obs-controller';
import SettingsModal from './SettingsModal.svelte'; // 路径根据实际调整

let showSettings = false;  // 控制设置弹窗显示
let errorMessage = '';     // 错误消息

function openSettings() {
  showSettings = true;
}

async function startShare() {
  try {
    errorMessage = '';
    await connectToOBS();
    // ... 原有启动逻辑
  } catch (err) {
    errorMessage = err.message || '启动失败';
    // 如果是认证错误，提供快捷入口
    if (errorMessage.includes('身份验证失败') || errorMessage.includes('密码错误')) {
      // 将在 UI 中显示带按钮的错误提示
    }
    // 不自动弹出 alert，改为在界面上显示错误
  }
}
2. 在模板中添加错误提示区域和设置弹窗
在 Host 界面的合适位置（例如按钮下方），添加：

svelte
{#if errorMessage}
  <div class="error-notification">
    <span>{errorMessage}</span>
    {#if errorMessage.includes('身份验证失败') || errorMessage.includes('密码错误')}
      <button on:click={openSettings}>打开设置</button>
    {/if}
    <button on:click={() => errorMessage = ''}>关闭</button>
  </div>
{/if}

<!-- 设置弹窗 -->
{#if showSettings}
  <SettingsModal on:close={() => showSettings = false} />
{/if}
3. 确保 SettingsModal 支持关闭事件
如果 SettingsModal 尚未支持关闭事件，修改它，添加一个 close 事件调度：

ts
// 在 SettingsModal.svelte 的 script 中
import { createEventDispatcher } from 'svelte';
const dispatch = createEventDispatcher();

function closeSettings() {
  dispatch('close');
}
在设置面板的关闭按钮或背景点击时调用 closeSettings()。

4. 调整样式
为错误通知添加基础样式，可使用现有皮肤变量：

css
.error-notification {
  background: var(--accent-secondary, #ff6b6b);
  color: white;
  padding: 10px;
  border-radius: 4px;
  margin: 10px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.error-notification button {
  background: white;
  color: #333;
  border: none;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
}
5. 测试
错误密码场景：输入错误密码保存，点击“开始共享”，应出现错误提示和“打开设置”按钮。

点击“打开设置”应弹出设置面板，修改密码保存后关闭面板，重新点击“开始共享”应连接成功。

正确密码场景：直接连接成功，不出现错误提示。

验收标准
密码错误时，不再仅是控制台报错，而是界面显示友好提示。

用户可通过提示框中的按钮直接打开设置修改密码。

设置面板可正常关闭，不阻塞主界面。