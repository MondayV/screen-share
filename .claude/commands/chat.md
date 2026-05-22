# 指令：添加聊天与屏幕标注功能（每个成员唯一颜色）

## 目标
为 PCConnect 添加以下两项核心交互功能：
1. **实时聊天**：主持人和观众可以通过文字交流，消息通过信令服务器广播
2. **屏幕标注**：观众可以在共享画面上用画笔进行标注，支持多种颜色
3. **唯一颜色分配**：每个加入房间的成员被分配一种独特颜色，该颜色同时用于他的聊天消息和画笔标注

## 架构设计
- 使用 **Cloudflare Worker + Durable Objects** 作为信令服务器，负责：
  - 房间创建/加入
  - 成员管理（分配唯一颜色）
  - 聊天消息广播
  - 标注数据广播
- 客户端通过 WebSocket 连接到 Worker
- 聊天和标注数据均通过 Worker 转发，不依赖 WebRTC
- 标注功能仅在观众端（Join 界面）的 `<video>` 元素上叠加 `<canvas>` 实现
- 主持人端可显示聊天，但不实现标注绘制（因为主持人使用 OBS 界面）

## 实施步骤（AI 必须严格按顺序执行）

### 第一步：升级 Cloudflare Worker
1. 进入 `signal-worker/` 目录（如不存在则创建）
2. 编写 `signal-worker/src/index.js`，内容包含：
   - 房间管理（创建、加入、离开）
   - 成员颜色池（预定义 10 种颜色，循环分配）
   - 处理消息类型：
     - `join` → 分配颜色并返回 `{ type: 'color', color: '#xxx' }`
     - `chat` → 广播给房间内所有其他成员 `{ type: 'chat', from: peerId, color: '#xxx', text: '...', timestamp: ... }`
     - `draw` → 广播标注路径 `{ type: 'draw', from: peerId, color: '#xxx', points: [...], brushSize: 3 }`
     - `clear` → 广播清除标注 `{ type: 'clear' }`
     - `leave` → 通知其他成员并清理
   - 使用 Durable Object 存储房间状态
3. 更新 `signal-worker/wrangler.toml`，确保绑定 `ROOM` Durable Object 并配置 KV（可选）
4. 部署 Worker：
   ```bash
   cd signal-worker && npx wrangler deploy
记录生成的 Worker URL（例如 wss://your-worker.workers.dev）

第二步：创建客户端信令模块
新建 src/renderer/src/lib/signaling.ts，实现以下功能：

连接到 Worker WebSocket

自动重连

发送消息（chat, draw, clear, join, leave）

监听消息事件（onChat, onDraw, onClear, onColorAssigned, onPeerJoined, onPeerLeft）

导出信令实例（单例模式）

信令模块应使用 Worker URL（可通过环境变量或硬编码，部署后替换）

添加类型定义接口：

ts
interface ChatMessage { peerId: string; color: string; text: string; timestamp: number }
interface DrawData { peerId: string; color: string; points: { x: number; y: number }[]; brushSize: number }
第三步：创建聊天组件（Chat.svelte）
创建 src/renderer/src/Chat.svelte

功能：

显示聊天消息列表（每行显示 [颜色圆点] 用户: 消息）

输入框 + 发送按钮

自动滚动到底部

使用 signaling.onChat 接收新消息

发送消息时调用 signaling.sendChat(text)

样式：与现有皮肤兼容，使用 CSS 变量

第四步：创建标注组件（Annotation.svelte）
创建 src/renderer/src/Annotation.svelte

接收 prop：videoElement: HTMLVideoElement（观众端的视频元素）

功能：

在视频元素上覆盖一个 <canvas>，尺寸与视频一致，绝对定位

监听鼠标/触摸事件（mousedown, mousemove, mouseup），收集点坐标

画笔颜色使用分配给当前用户的颜色（从信令获取）

画笔大小可调（默认 3px）

本地绘制同时，通过 signaling.sendDraw(points, brushSize) 广播

监听 signaling.onDraw，接收其他用户的标注数据并绘制到 canvas

提供“清除标注”按钮，广播 clear 消息并清空 canvas

注意坐标转换：鼠标事件坐标需相对于视频画面左上角，确保标注位置准确

第五步：集成到 Host.svelte（主持人端）
在主持人界面添加 聊天面板（可折叠/展开），使用 Chat 组件

主持人加入自己的房间后，自动连接信令服务器，获取颜色

主持人也可以发送聊天消息（但不参与标注绘制）

保留现有 OBS WebSocket 控制功能不变

第六步：集成到 Join.svelte（观众端）
在观众界面添加 聊天面板 和 标注组件

观众输入房间码加入后，同时连接到信令服务器，获取分配的颜色

将 <video> 元素引用传递给 Annotation 组件

标注组件覆盖在视频上，观众可以绘图并查看其他人的标注

确保视频播放和标注功能不冲突

第七步：统一颜色管理
Worker 在成员加入时从颜色池中分配一种颜色

该颜色通过 WebSocket 消息发送给客户端（color 类型）

客户端存储自己的颜色，用于聊天消息显示和画笔颜色

其他成员收到该用户的消息/标注时，携带其颜色，客户端直接使用

第八步：测试与打包
本地双开测试：启动两个实例，一个主持一个观看，确认：

双方都能收发聊天消息，颜色不同

观众端能在视频上标注，另一观众（第三个实例）能看到标注

颜色与聊天消息一致

构建安装包：npm run build:win

部署新版 Worker 并更新应用内的 Worker URL

注意事项
标注功能只在观众端（Join.svelte）实现，因为主持人端使用的是 OBS 界面而非应用内视频

若未来主持人也需要预览标注，可再扩展

Worker 需处理异常断开、房间清理（成员离开超时自动关闭房间）

皮肤系统应继续支持，聊天和标注组件使用 CSS 变量

验收标准
观众端可以看到视频上的彩色画笔标注

多个观众标注时，线条颜色互不相同，与各自聊天颜色一致

主持人发送聊天消息，所有观众能看到；观众发送聊天消息，主持人和其它观众能看到

标注和聊天功能稳定，不影响屏幕共享的基本功能