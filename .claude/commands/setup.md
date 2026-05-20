# 指令：全自动 OBS 串流模式最终改造 + 打包发布

## 目标
基于已验证的 MediaMTX 环境，完成应用改造，实现零门槛屏幕共享：
- 主持方点击“开始共享” → 自动启动 cloudflared 隧道 → 生成公网播放链接
- 观众方粘贴链接 → 应用内播放 HLS 流
- 彻底移除所有 WebRTC 和信令代码
- 生成 v2.0.0 安装包

## 当前状态确认
- MediaMTX 已安装并正常运行（C:\mediamtx\mediamtx.exe）
- cloudflared 已通过 Scoop 安装（可用 `scoop install cloudflared` 确认）
- 项目代码位于当前目录

## 执行步骤

### 1. 清理旧代码
- 删除 `src/renderer/src/lib/webrtc.ts`（如存在）
- 删除 `src/renderer/src/lib/signaling.ts`（如存在）
- 删除 `src/renderer/src/lib/restream.ts`（如存在）
- 删除 `src/main/signaling-server.js`（如存在）
- 从 `package.json` 移除 `ws`、`@p2pcf/worker`、`@p2pcf/client` 依赖
- 执行 `npm uninstall ws @p2pcf/worker @p2pcf/client`（如有）

### 2. 安装必要依赖
```bash
npm install hls.js
3. 创建服务管理模块
新建 src/renderer/src/lib/streaming-server.ts，完整代码：

ts
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

let mediamtxProcess: ChildProcess | null = null;
let cloudflaredProcess: ChildProcess | null = null;

// 启动 MediaMTX
export function startMediaMTX(): Promise<void> {
  return new Promise((resolve, reject) => {
    const mediamtxPath = path.join('C:', 'mediamtx', 'mediamtx.exe');
    mediamtxProcess = spawn(mediamtxPath, [], { cwd: 'C:\\mediamtx' });
    mediamtxProcess.stdout?.on('data', (data) => {
      if (data.toString().includes('HLS listener opened')) {
        resolve();
      }
    });
    mediamtxProcess.stderr?.on('data', (data) => console.error('[MediaMTX]', data.toString()));
    mediamtxProcess.on('error', reject);
  });
}

// 启动 cloudflared 隧道，返回公网域名
export function startCloudflared(): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudflaredProcess = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:8888']);
    cloudflaredProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) {
        resolve(match[0]);
      }
    });
    cloudflaredProcess.stderr?.on('data', (data) => console.error('[Cloudflared]', data.toString()));
    cloudflaredProcess.on('error', reject);
  });
}

// 停止所有服务
export function stopAll() {
  if (mediamtxProcess) { mediamtxProcess.kill(); mediamtxProcess = null; }
  if (cloudflaredProcess) { cloudflaredProcess.kill(); cloudflaredProcess = null; }
}
4. 改造 Host.svelte（主持方界面）
移除原有 startSharing 中的 WebRTC 逻辑。

新逻辑：

ts
import { startMediaMTX, startCloudflared, stopAll } from './lib/streaming-server';

let streamKey = '';
let publicUrl = '';
let isStreaming = false;

async function startShare() {
  try {
    // 1. 启动 MediaMTX
    await startMediaMTX();
    
    // 2. 生成随机流密钥
    streamKey = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // 3. 启动 cloudflared 获取公网域名
    const domain = await startCloudflared();
    publicUrl = `https://${domain}/${streamKey}/index.m3u8`;
    
    // 4. 更新 UI 显示
    isStreaming = true;
  } catch (err) {
    console.error('启动失败:', err);
    alert('启动串流服务失败，请检查 MediaMTX 和 cloudflared 是否已安装。');
  }
}

function stopShare() {
  stopAll();
  isStreaming = false;
  streamKey = '';
  publicUrl = '';
}
UI 显示：

当 isStreaming 为 true 时：

显示 OBS 配置：

服务器：rtmp://localhost:1935

串流密钥：{streamKey}

显示公网播放链接：{publicUrl} + 一键复制按钮

“停止共享”按钮

当 isStreaming 为 false 时：

“开始共享”按钮

5. 改造 Join.svelte（观众界面）
移除原有的房间码输入逻辑。

改为：

输入框：播放链接（placeholder="粘贴播放链接，例如 https://xxxx.trycloudflare.com/xxx/index.m3u8"）

“观看”按钮：点击后使用 hls.js 播放链接

播放 <video> 元素

引入 hls.js：

ts
import Hls from 'hls.js';

let videoEl: HTMLVideoElement;
let playUrl = '';

function watch() {
  if (!playUrl || !videoEl) return;
  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(playUrl);
    hls.attachMedia(videoEl);
  } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
    videoEl.src = playUrl;
  }
}
6. 主进程清理（src/main/index.ts）
删除 desktopCapturer 相关 IPC（get-sources handler 等）

删除 session.setPermissionRequestHandler 中媒体权限的处理

确保 child_process 可用（默认允许）

7. 清理配置文件
检查 electron-builder.yml，删除不再需要的权限：

extraResources 中如有旧的 mediamtx 或隧道配置，移除

确认 files 配置仅包含 out/**/* 和 package.json

8. 测试验证
启动应用：npm run dev

主持方：

点击“开始共享” → 应自动启动 MediaMTX 和 cloudflared

几秒后显示公网播放链接

复制链接，在 OBS 中推流（服务器 rtmp://localhost:1935，密钥用显示的）

观众方：

打开应用另一个实例（或同一电脑不同窗口）

在观众界面粘贴链接，点击“观看”

应能正常播放 OBS 画面

9. 打包发布
更新 package.json 版本号为 2.0.0

执行 npm run build:win

生成 release/pc-connect-2.0.0-setup.exe

提交代码：

bash
git add -A
git commit -m "refactor: OBS串流模式 v2.0.0 - 零门槛屏幕共享"
git tag v2.0.0
git push origin dev/v1.0.1 --tags
上传 Release：

bash
gh release create v2.0.0 \
  --title "v2.0.0 OBS串流模式 - 零门槛屏幕共享" \
  --notes "🎉 全新架构：零门槛屏幕共享

✨ 主持方无需注册、无需域名、无需 API Key
✨ 观众方粘贴链接即可观看
✨ 基于 OBS + MediaMTX + Cloudflare 免费隧道
✨ 无限次数、永久免费

📥 下载：PCConnect Setup 2.0.0.exe" \
  release/pc-connect-2.0.0-setup.exe
10. 验收标准
主持方点击“开始共享”后，应用自动启动服务并显示公网链接

观众方输入链接后，应用内正常播放 HLS 流，延迟 < 5 秒

所有 WebRTC 代码已移除

安装包正常安装、卸载、更新