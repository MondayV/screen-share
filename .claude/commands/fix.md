# 指令：OBS WebSocket 密码安全加密存储与自动读取

## 目标
- 使用 Electron 内置 `safeStorage` 对 OBS 密码进行加密存储，避免明文泄露
- 提供设置页面让用户输入密码并保存
- 应用启动时自动加载密码，连接 OBS 无需每次手动输入
- 保持现有皮肤、打包流程不变

## 修改文件清单
- `src/main/index.ts`（主进程，添加 IPC）
- `src/preload/index.ts`（暴露 API 给渲染进程）
- `src/renderer/src/lib/obs-controller.ts`（使用 IPC 获取密码）
- `src/renderer/src/SettingsModal.svelte`（或实际设置组件，添加输入框）
- `src/renderer/src/Host.svelte`（启动时连接优化）

## 执行步骤

### 1. 主进程添加加密存储 IPC 通道
在 `src/main/index.ts` 中添加以下内容：

```ts
import { safeStorage, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const passwordFilePath = path.join(app.getPath('userData'), 'obs-password.enc');

ipcMain.handle('save-obs-password', async (event, password: string) => {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(password);
    fs.writeFileSync(passwordFilePath, encrypted);
    return true;
  }
  return false;
});

ipcMain.handle('get-obs-password', async () => {
  if (safeStorage.isEncryptionAvailable() && fs.existsSync(passwordFilePath)) {
    const encrypted = fs.readFileSync(passwordFilePath);
    return safeStorage.decryptString(encrypted);
  }
  return '';
});
2. 预加载脚本暴露 API
在 src/preload/index.ts 的 contextBridge 中添加：

ts
contextBridge.exposeInMainWorld('electronAPI', {
  // ...已有方法
  saveObsPassword: (password: string) => ipcRenderer.invoke('save-obs-password', password),
  getObsPassword: () => ipcRenderer.invoke('get-obs-password'),
});
3. 修改 OBS 控制器使用异步获取密码
更新 src/renderer/src/lib/obs-controller.ts：

ts
import OBSWebSocket from 'obs-websocket-js';

let obs: OBSWebSocket | null = null;

async function getOBSWebSocketPassword(): Promise<string> {
  if (window.electronAPI?.getObsPassword) {
    return await window.electronAPI.getObsPassword();
  }
  return '';
}

export async function connectToOBS(): Promise<void> {
  obs = new OBSWebSocket();
  const password = await getOBSWebSocketPassword();
  try {
    await obs.connect('ws://localhost:4455', password);
    console.log('[OBS] 已连接');
  } catch (err) {
    console.error('[OBS] 连接失败:', err);
    const msg = (err as any).message || '';
    if (msg.includes('authentication')) {
      throw new Error('OBS 身份验证失败，请在设置中更新 WebSocket 密码');
    }
    throw new Error('无法连接到 OBS，请确认 WebSocket 已启用');
  }
}

export async function startStream(): Promise<void> {
  if (!obs) throw new Error('OBS 未连接');
  await obs.call('StartStream');
}

export async function stopStream(): Promise<void> {
  if (!obs) return;
  await obs.call('StopStream');
}

export function disconnectOBS(): void {
  if (obs) {
    obs.disconnect();
    obs = null;
  }
}
4. 设置页面添加密码输入框
找到设置组件（例如 SettingsModal.svelte），添加：

svelte
<script>
  let obsPasswordInput = '';
  let passwordSaved = false;

  async function loadPassword() {
    if (window.electronAPI?.getObsPassword) {
      obsPasswordInput = await window.electronAPI.getObsPassword();
    }
  }

  async function savePassword() {
    if (window.electronAPI?.saveObsPassword) {
      await window.electronAPI.saveObsPassword(obsPasswordInput);
      passwordSaved = true;
      setTimeout(() => passwordSaved = false, 2000);
    }
  }

  import { onMount } from 'svelte';
  onMount(loadPassword);
</script>

<div class="setting-item">
  <label for="obs-password">OBS WebSocket 密码</label>
  <input
    type="password"
    id="obs-password"
    bind:value={obsPasswordInput}
    placeholder="填入 OBS 生成的密码"
  />
  <button on:click={savePassword}>保存</button>
  {#if passwordSaved}
    <span style="color: green; margin-left: 8px;">已保存</span>
  {/if}
</div>
5. Host 启动时自动尝试连接
在 Host.svelte 的 startShare 中调用 connectToOBS 即可，无需更改。

6. 清理本地明文密码残留
确保代码中不再有硬编码的密码或从 localStorage 读取密码的逻辑。删除 localStorage.getItem('obs-websocket-password') 相关代码。

7. 测试验证
构建应用：rm -rf release out && npm run build:win

在 OBS 中设置/生成一个密码

打开应用，进入设置，输入密码并保存

点击“开始共享”，确认 OBS 自动连接并推流

关闭应用再打开，无需再次输入密码，直接可用

验收标准
OBS 密码在磁盘上以加密形式存储（userData/obs-password.enc）

用户可在设置中修改密码并即时生效

连接 OBS 时自动使用加密存储的密码，无需每次手动输入

若密码错误，给出明确提示