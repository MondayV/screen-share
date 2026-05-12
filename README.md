# PC Connect

基于 Electron + Svelte 的 P2P 屏幕共享桌面应用，通过短码快速建立连接。

## 功能

- 端到端 WebRTC 屏幕共享
- **6 位短码连接** — 无需传输长链接
- 远程光标协作
- 音频通话
- 自定义 STUN/TURN 服务器
- 全中文界面

## 下载

前往 [Releases 页面](https://github.com/MondayV/screen-share/releases) 下载最新版本。

- `pc-connect-x.x.x-setup.exe` — 安装程序（支持自定义安装目录）
- `PC Connect x.x.x.exe` — 便携版（免安装直接运行）

## 使用说明

### 准备工作

1. 下载并安装 PC Connect
2. **启动信令服务器**（任选一台电脑）：
   ```bash
   node server.js
   ```
   默认端口 3456，可通过 `PORT=端口号` 自定义。

3. 启动 PC Connect 应用

### 主持屏幕共享（分享方）

1. 点击导航栏 **"发起屏幕共享"**
2. 点击 **"开始新的共享"** 按钮
3. 选择要共享的屏幕或窗口
4. 系统自动生成 **6 位连接码**（如 `A3F7K9`）
5. 将连接码发送给参与者（可通过聊天软件、口头告知等）

### 加入屏幕共享（观看方）

1. 点击导航栏 **"加入屏幕共享"**
2. 输入主持人提供的 **6 位连接码**
3. 点击 **"连接"** 或按回车键
4. 等待连接建立，即可观看远程屏幕

### 操作控制

| 按钮 | 功能 |
|------|------|
| 🖥️ | 开关屏幕共享 |
| 🎤 | 开关麦克风 |
| 🖱️ | 开关远程光标显示 |
| 🔍+ / 🔍- | 放大/缩小远程屏幕 |
| ⛶ | 全屏显示远程屏幕 |
| 🔗 断开 | 结束当前共享 |

### 断开连接

- 任意一方点击 **"断开"** 即可结束共享
- 断开后弹出提示，确认后返回主界面

## 开发

```bash
# 安装依赖
npm install

# 启动信令服务器（端口 3456）
node server.js

# 启动应用开发模式
npm run dev
```

## 构建发布

```bash
npm run build:win    # Windows 安装包 + 便携版
npm run build:mac    # macOS DMG
npm run build:linux  # Linux AppImage / deb
```

## 信令服务器部署

信令服务器用于交换 6 位短码对应的 WebRTC 连接信息，不传输屏幕数据。生产环境建议部署到公网服务器：

```bash
PORT=3456 node server.js
```

可配合 nginx 反向代理或使用 PM2 守护进程。

## 技术栈

- Electron - 跨平台桌面框架
- Svelte - 前端 UI 框架
- Bulma - CSS 样式框架
- WebRTC - 点对点实时通信
- SweetAlert2 - 弹窗提示
- Express - 信令服务器
- typesafe-i18n - 国际化（全中文）
