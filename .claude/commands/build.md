# 指令：全自动重构 v1.0.0 → v1.0.1 零成本多人异地屏幕共享

## 目标
基于当前 v1.0.0 代码，实现以下所有需求，全程无需用户手动配置：
- 异地零成本信令（Cloudflare Workers 免费计划）
- 6 位短码加入，1 个主持人 + 最多 9 个观看者
- 屏幕/窗口选择共享
- 远程控制鼠标点击修复
- 操作极简：主界面仅“开始共享”与“输入码加入”
- 不改变现有 UI 风格，不增加任何手动配置项

## 前置条件（AI 自动检查与处理）
- 确保 Cloudflare 账号已登录（执行 `npx wrangler whoami`，若未登录则运行 `npx wrangler login` 并等待用户浏览器授权后继续）
- 项目根目录为当前工作目录
- Node.js 18+ 已安装

## 分阶段执行（请严格按顺序）

### 阶段一：信令迁移至 Cloudflare Workers（支持多人）

#### 1.1 移除旧信令依赖
- 删除文件 `src/main/signaling-server.js`（如果存在）
- 从 `src/main/index.js` 中删除所有与信令服务器启动、fork、IPC 相关的代码
- 执行 `npm uninstall ws`（删除 WebSocket 服务端依赖）
- 从 `package.json` 的 `scripts` 中删除任何与 `server.js` 相关的启动命令

#### 1.2 创建并部署 Cloudflare Worker（多人房间）
- 在项目根目录下创建 `signal-worker` 目录，初始化 npm 包，但**不安装任何第三方依赖**（只使用 Cloudflare 原生 API）
- 创建 `signal-worker/src/index.js`，内容使用以下**多人房间版本**（已扩展为 1+N）：
```js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'room' || !parts[1]) {
      return new Response('PC Connect Signaling — use /room/<code>', { status: 200 });
    }
    const roomCode = parts[1].toUpperCase().slice(0, 8);
    const id = env.ROOM.idFromName(roomCode);
    const stub = env.ROOM.get(id);
    return stub.fetch(request);
  }
};

export class Room {
  constructor(state) {
    this.state = state;
    this.sessions = new Map(); // webSocket -> { role, id }
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);

    const role = this.sessions.size === 0 ? 'host' : 'participant';
    const peerId = crypto.randomUUID();
    this.sessions.set(server, { role, id: peerId });

    if (role === 'participant') {
      for (const [ws, info] of this.sessions) {
        if (info.role === 'host') {
          ws.send(JSON.stringify({ type: 'participant-joined', peerId }));
        }
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const data = JSON.parse(raw);
    const sender = this.sessions.get(ws);
    if (!sender) return;

    if (data.type === 'targeted') {
      for (const [w, info] of this.sessions) {
        if (info.id === data.target) {
          w.send(JSON.stringify({ ...data, from: sender.id }));
          return;
        }
      }
      return;
    }

    for (const [w, info] of this.sessions) {
      if (w !== ws) {
        w.send(JSON.stringify({ ...data, from: sender.id }));
      }
    }
  }

  async webSocketClose(ws) {
    const info = this.sessions.get(ws);
    if (!info) return;
    for (const [w, other] of this.sessions) {
      if (w !== ws) w.send(JSON.stringify({ type: 'peer-left', peerId: info.id }));
    }
    this.sessions.delete(ws);

    if (info.role === 'host') {
      for (const [w] of this.sessions) {
        try { w.close(); } catch {}
      }
      this.sessions.clear();
    }
  }

  async webSocketError(ws, error) {
    console.error('WebSocket error:', error);
  }
}
创建 signal-worker/wrangler.toml：

toml
name = "screen-share-signal"
main = "src/index.js"
compatibility_date = "2025-01-01"

[[durable_objects.bindings]]
name = "ROOM"
class_name = "Room"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["Room"]
在 signal-worker/ 目录下执行部署：

bash
npx wrangler deploy
AI 自动等待部署完成，并从输出中提取 Worker URL 存入变量 WORKER_URL。

1.3 客户端信令层改造
在 src/renderer/src/lib/ 下新建 signaling.js：

js
const WORKER_URL = '__WORKER_URL_PLACEHOLDER__';

let ws = null;
const listeners = new Map();

export function connectToRoom(roomCode) {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(`${WORKER_URL}/room/${roomCode}`);
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('信令连接失败'));
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const type = msg.type;
      if (listeners.has(type)) {
        listeners.get(type).forEach(cb => cb(msg));
      }
    };
  });
}

export function sendToAll(data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

export function sendTo(peerId, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'targeted', target: peerId, ...data }));
  }
}

export function on(eventType, callback) {
  if (!listeners.has(eventType)) listeners.set(eventType, []);
  listeners.get(eventType).push(callback);
}

export function closeSignaling() {
  if (ws) ws.close();
}
部署后将 WORKER_URL 占位符替换为真实地址。

修改 Host.svelte 和 Client.svelte，完全移除旧 WebSocket 代码，改用上述模块：

主持方：connectToRoom(shortCode) → 监听 participant-joined → 为每个新参与者创建 RTCPeerConnection（存入 Map），添加本地流，发送 offer 至该参与者（通过 sendTo(peerId, ...)）。

加入方：connectToRoom(shortCode) → 等待 offer 消息，创建 RTCPeerConnection，setRemoteDescription，createAnswer，通过 sendTo(hostId, ...) 发送 answer。

短码生成统一为 6 位大写字母数字（排除 0/O/1/I/L），在 Host.svelte 中实现。

1.4 本地双开测试验证
使用 test-two.bat 启动两个实例，验证短码连接、信令交换正常。

阶段二：核心共享修复
2.1 恢复屏幕/窗口选择
在主进程 src/main/index.js 中添加 IPC：

js
ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
  return sources.map(s => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }));
});
在 preload.js 中暴露 window.electronAPI.getSources()。

在 Host.svelte 中点击“开始共享”后，先调用 getSources()，弹出选择弹窗（新建 SourcePicker.svelte，极简列表，每个源显示缩略图和名称）。用户选择后，使用 navigator.mediaDevices.getUserMedia({ video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } } }) 获取流。

确保选择界面自动适配当前皮肤变量，不影响现有视觉风格。

2.2 远程控制鼠标点击修复
找到远程控制模块，在控制端添加 mousedown、mouseup、click、dblclick、contextmenu 事件监听，通过 DataChannel 发送。

在被控端解析消息，使用 robotjs 模拟点击（若无则 npm install robotjs），若不可用回退到 Electron 的 webContents.sendInputEvent。

添加被控端安全确认弹窗和控制提示。

2.3 6 位短码体验优化
主持界面短码显示加大、居中、一键复制。

加入方输入框自动转大写，限制长度 6。

阶段三：多人观看支持（1+N）
主机端维护 connections: Map<peerId, RTCPeerConnection>。

收到 participant-joined 时创建新连接，添加本地流并发送 offer。

接收端仅显示远程流。

Host 退出时关闭所有连接并通知。

参与者离开时主机清理对应连接。

阶段四：最终打磨与发布
删除所有手动信令配置的 UI 元素。

确保 TURN 配置存在：

js
iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'turn:relay1.expressturn.com:3478', username: 'efree', credential: 'efree' },
  { urls: 'turn:relay2.expressturn.com:3478?transport=tcp', username: 'efree', credential: 'efree' }
]
错误处理：信令重试 3 次，ICE 超时重启，UI 友好提示。

清理无用文件（旧 server.js、.claude/commands/ 下多余指令、styleguide-*.html 等）。

更新 package.json 版本号为 1.0.1。

执行 npm run dist 生成安装包（可选）。

提交所有更改，打 tag v1.0.1，推送到 GitHub。