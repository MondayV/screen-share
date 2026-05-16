# 指令：修复信令地址 IP 检测错误，确保连接成功

## 问题
客户端使用 `window.location.hostname` 自动获取信令地址时，获取到了公网 IP `26.210.127.235`（虚拟网卡），导致 WebSocket 连接超时。

## 目标
- 主进程在启动时自动获取**局域网 IP**（排除虚拟接口和回环地址），通过 IPC 传给渲染进程。
- 渲染进程使用该 IP 构建信令地址，**同时保留 `localhost` 作为回退**。
- 对于同一台电脑的双开测试，自动使用 `localhost`。
- 连接失败时自动尝试备用地址，无需用户干预。

## 修改步骤

### 1. 主进程添加 IP 获取模块
新建 `src/main/local-ip.js`：
```js
const os = require('os');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    // 跳过虚拟网卡和内部接口
    if (name.toLowerCase().includes('virtual') ||
        name.toLowerCase().includes('vmware') ||
        name.toLowerCase().includes('hyper-v') ||
        name.toLowerCase().includes('vbox') ||
        name.toLowerCase().includes('loopback') ||
        name.toLowerCase().includes('bluetooth') ||
        name.toLowerCase().includes('docker') ||
        name.toLowerCase().includes('vpn') ||
        name.toLowerCase().includes('tunnel')) continue;
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address; // 返回第一个符合条件的局域网 IPv4
      }
    }
  }
  return '127.0.0.1'; // 回退
}

module.exports = { getLocalIP };
2. 主进程 IPC 通道
在 src/main/index.js 中（或创建窗口后），添加 IPC 处理：

js
const { ipcMain } = require('electron');
const { getLocalIP } = require('./local-ip');

ipcMain.handle('get-signaling-address', async () => {
  return `ws://${getLocalIP()}:3456`;
});
3. 渲染进程获取并使用信令地址
找到创建 WebSocket 的位置（src/renderer/src/WebRTC.svelte 或 src/lib/ws-manager.js）。

将硬编码地址替换为动态获取：

async function getSignalingUrl() {
  try {
    const base = await window.electronAPI.getSignalingAddress();
    return base;
  } catch (e) {
    return 'ws://localhost:3456';
  }
}

// 使用
const signalingUrl = await getSignalingUrl();
const ws = new WebSocket(signalingUrl);
如果项目未使用 contextBridge，需要先在 preload.js 中暴露 electronAPI.getSignalingAddress：

js
contextBridge.exposeInMainWorld('electronAPI', {
  getSignalingAddress: () => ipcRenderer.invoke('get-signaling-address')
});
4. 多地址回退连接
在 WebSocket 连接失败时，尝试备用地址（如 ws://localhost:3456）：

const backupUrl = 'ws://localhost:3456';
let currentUrl = await getSignalingUrl();

async function connectWithFallback(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => {
      if (url !== backupUrl) {
        resolve(connectWithFallback(backupUrl));
      } else {
        reject(new Error('Both primary and fallback failed'));
      }
    };
  });
}