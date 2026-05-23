# 指令：增加 OBS 三状态精准诊断（只读，无自动化）

## 目标
在主持方界面增加三个实时状态指示器，帮助用户快速定位问题：
1. **OBS 连接状态**：是否检测到 OBS WebSocket 服务（仅检测，不自动配置）
2. **OBS 推流状态**：OBS 是否已开始推流（通过 WebSocket 查询）
3. **推流到达状态**：推流是否已成功到达 MediaMTX（通过 API 查询路径）

全部为**只读检测**，不进行任何自动连接、自动配置、自动推流操作。

## 实施步骤

### 一、主进程：添加三个 IPC handler（代理查询，解决 CSP）

文件：`src/main/index.ts`

```ts
import WebSocket from 'ws'; // 如果未安装，先 npm install ws

// 1. 检测 OBS WebSocket 是否可达
ipcMain.handle('check-obs-connection', async () => {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:4455');
    const timeout = setTimeout(() => {
      ws.close();
      resolve({ connected: false, reason: '连接超时，请确认 OBS 已启动并开启 WebSocket 服务' });
    }, 3000);
    ws.on('open', () => {
      clearTimeout(timeout);
      ws.close();
      resolve({ connected: true, reason: '' });
    });
    ws.on('error', () => {
      clearTimeout(timeout);
      ws.close();
      resolve({ connected: false, reason: '无法连接 OBS，请确认 OBS 已启动并开启 WebSocket 服务' });
    });
  });
});

// 2. 查询 OBS 是否正在推流（需要密码，从用户设置获取）
ipcMain.handle('check-obs-streaming', async (event, password: string) => {
  // 注意：这里需要 obs-websocket-js 库，如果已删除，改用原生 WebSocket 消息
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:4455');
    const timeout = setTimeout(() => {
      ws.close();
      resolve({ streaming: false, reason: '查询超时' });
    }, 5000);
    ws.on('open', () => {
      // 发送认证请求
      ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1 } }));
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      // 处理认证流程后查询推流状态
      if (msg.op === 2 && msg.d?.negotiatedRpcVersion) {
        // 认证成功，查询推流状态
        ws.send(JSON.stringify({
          op: 6,
          d: {
            requestType: 'GetStreamStatus',
            requestId: 'status-1',
          }
        }));
      } else if (msg.op === 7 && msg.d?.requestId === 'status-1') {
        clearTimeout(timeout);
        ws.close();
        resolve({
          streaming: msg.d.responseData?.outputActive || false,
          reason: msg.d.responseData?.outputActive ? '' : 'OBS 未开始推流，请点击"开始推流"'
        });
      }
    });
    ws.on('error', () => {
      clearTimeout(timeout);
      ws.close();
      resolve({ streaming: false, reason: 'OBS 未连接，无法查询推流状态' });
    });
  });
});

// 3. 查询 MediaMTX 路径是否收到推流
ipcMain.handle('check-path-active', async (event, streamKey: string) => {
  try {
    const res = await fetch(`http://localhost:9997/v3/paths/list`);
    const data = await res.json();
    const path = data.items?.find((p: any) => p.name === streamKey);
    if (path && path.sourceReady) {
      return { active: true, reason: '' };
    } else if (path) {
      return { active: false, reason: '推流未到达，请检查 OBS 推流密钥是否填写正确' };
    } else {
      return { active: false, reason: '未检测到推流路径，请确认已在 OBS 中填入正确的串流密钥并开始推流' };
    }
  } catch {
    return { active: false, reason: '无法查询 MediaMTX 状态' };
  }
});
二、预加载：暴露三个方法
文件：src/preload/index.ts

ts
contextBridge.exposeInMainWorld('electronAPI', {
  // 已有方法...
  checkObsConnection: () => ipcRenderer.invoke('check-obs-connection'),
  checkObsStreaming: (password: string) => ipcRenderer.invoke('check-obs-streaming', password),
  checkPathActive: (streamKey: string) => ipcRenderer.invoke('check-path-active', streamKey),
});
三、主持方界面：三个状态指示器
文件：src/renderer/src/Host.svelte

ts
// 三个状态变量
let obsConnected = false;
let obsConnReason = '';
let obsStreaming = false;
let obsStreamReason = '';
let pathActive = false;
let pathReason = '';

// 状态检测定时器
let statusCheckTimer: ReturnType<typeof setInterval> | null = null;

async function refreshAllStatus() {
  if (!isStreaming) return;
  
  // 1. OBS 连接状态
  const conn = await window.electronAPI.checkObsConnection();
  obsConnected = conn.connected;
  obsConnReason = conn.reason;
  
  // 2. OBS 推流状态
  if (obsConnected) {
    const stream = await window.electronAPI.checkObsStreaming('');
    obsStreaming = stream.streaming;
    obsStreamReason = stream.reason;
  } else {
    obsStreaming = false;
    obsStreamReason = 'OBS 未连接';
  }
  
  // 3. 推流到达状态
  const path = await window.electronAPI.checkPathActive(streamKey);
  pathActive = path.active;
  pathReason = path.reason;
}

// 在 startShare 中启动定时器
function startStatusCheck() {
  refreshAllStatus();
  statusCheckTimer = setInterval(refreshAllStatus, 5000); // 每5秒刷新
}

// 在 stopShare 中清除
function stopStatusCheck() {
  if (statusCheckTimer) {
    clearInterval(statusCheckTimer);
    statusCheckTimer = null;
  }
}
UI 显示（三个状态灯并排）：

svelte
{#if isStreaming}
  <div class="status-panel">
    <div class="status-item" class:ok={obsConnected} class:fail={!obsConnected}>
      <span class="status-icon">{obsConnected ? '🟢' : '⚪'}</span>
      <div>
        <strong>OBS 连接</strong>
        {#if !obsConnected}<p class="hint">{obsConnReason}</p>{/if}
      </div>
    </div>
    
    <div class="status-item" class:ok={obsStreaming} class:fail={!obsStreaming}>
      <span class="status-icon">{obsStreaming ? '🟢' : '⚪'}</span>
      <div>
        <strong>OBS 推流</strong>
        {#if !obsStreaming}<p class="hint">{obsStreamReason}</p>{/if}
      </div>
    </div>
    
    <div class="status-item" class:ok={pathActive} class:fail={!pathActive}>
      <span class="status-icon">{pathActive ? '🟢' : '⚪'}</span>
      <div>
        <strong>流到达服务器</strong>
        {#if !pathActive}<p class="hint">{pathReason}</p>{/if}
      </div>
    </div>
  </div>
{/if}
四、依赖检查
如果项目已删除 ws 包，需重新安装：

bash
npm install ws
如果 ws 仅用于主进程，不影响打包体积。

五、构建与验证
bash
rm -rf release out
npm run build:win
验收：

打开应用，点击“开始共享”，三个状态灯显示。

OBS 未启动时：第一个灯灭，提示“请确认 OBS 已启动”。

OBS 启动但未推流：前两个灯亮，第三个灯灭，提示“请在 OBS 中填入密钥并点击开始推流”。

OBS 推流但密钥错误：前两个灯亮，第三个灯灭，提示“密钥可能不正确”。

全部正常：三个绿灯全亮。