# 指令：傻瓜式一键连接——信令内嵌至主进程

## 你的角色
你是 Electron + WebSocket 集成专家，擅长将独立 Node 服务无缝迁移到 Electron 主进程。

## 背景
当前项目 `pc-connect` 需要用户手动执行 `node server.js` 启动信令服务器，极不友好。
现在要彻底移除 `server.js`，改为在 Electron 主进程中直接创建 WebSocket 服务，实现：
- 启动应用 → 信令自动开始监听
- 关闭应用 → 端口自动释放
- 客户端（渲染进程）无需任何修改，只需连接 `ws://localhost:3456`

## 任务清单

### 1. 移除独立信令服务依赖
- 删除项目根目录下的 `server.js`（如果存在）。
- 从 `package.json` 中删除所有与 `server.js` 相关的启动脚本（如 `"start-server"`）。

### 2. 在主进程内创建信令服务
在 `src/main` 目录下创建新文件 `signaling-server.js`（或直接写在 `src/main/index.js` 中），实现以下逻辑：

```js
const { WebSocketServer } = require('ws');

// 房间管理：roomId -> Set of WebSocket 连接
const rooms = new Map();

function createSignalingServer() {
  const wss = new WebSocketServer({ port: 3456, host: '0.0.0.0' });

  wss.on('listening', () => {
    console.log('[信令] 已自动启动，监听 ws://0.0.0.0:3456');
  });

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        handleMessage(ws, msg);
      } catch (e) {
        console.error('信令消息解析失败', e);
      }
    });

    ws.on('close', () => {
      // 清理房间内的连接
      rooms.forEach((members, roomId) => {
        members.delete(ws);
        if (members.size === 0) rooms.delete(roomId);
      });
    });
  });

  // 错误处理：端口占用时自动换端口（可选，为简单可提示重启）
  wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('端口 3456 被占用，请关闭占用程序后重启应用');
      // 可发出系统通知
    }
  });

  return wss;
}

function handleMessage(ws, msg) {
  const { type, roomId } = msg;
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  const room = rooms.get(roomId);

  switch (type) {
    case 'join':
      room.add(ws);
      // 通知已有成员有新成员加入
      room.forEach((client) => {
        if (client !== ws && client.readyState === ws.OPEN) {
          client.send(JSON.stringify({ type: 'peer-joined' }));
        }
      });
      break;
    case 'offer':
    case 'answer':
    case 'ice-candidate':
      // 转发给房间内其他成员
      room.forEach((client) => {
        if (client !== ws && client.readyState === ws.OPEN) {
          client.send(JSON.stringify(msg));
        }
      });
      break;
  }
}

module.exports = { createSignalingServer };