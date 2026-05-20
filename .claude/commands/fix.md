# 指令：全自动 OBS 串流模式（MediaMTX + Cloudflared）—— 让任何人都能零门槛主持

## 目标
- 将应用改造为 **主持方一键启动串流服务，观众方输入链接观看** 的非对称架构。
- 主持方无需任何注册、配置、域名，只需点击“开始共享”即可自动获得公网播放链接。
- 观众方输入链接即可观看，同样零门槛。
- 保留现有 Electron 应用外壳、皮肤系统、安装更新流程。

## 技术方案
- 主持方本地运行 **MediaMTX**（轻量流媒体服务器，接收 OBS 推流并转 HLS）。
- 主持方本地启动 **cloudflared 快速隧道**（将本地 HLS 端口暴露到公网，自动获得 `trycloudflare.com` 临时域名）。
- 观众方使用 **hls.js** 在应用内播放 HLS 流。

## 前置准备（AI 自动引导）
1. **下载 MediaMTX**：
   - 打开 https://github.com/bluenviron/mediamtx/releases
   - 下载 `mediamtx_vX.X.X_windows_amd64.zip`，解压到 `C:\mediamtx`（AI 可提示用户操作）。
2. **安装 cloudflared**：
   - 在 PowerShell 执行 `scoop install cloudflared`。
   - 或手动下载 cloudflared.exe 放到 PATH 目录。
3. **安装 OBS Studio**（主持人自己使用，AI 不负责安装）。

## 执行步骤

### 第一步：清理旧代码和残留文件
1. 删除 `src/renderer/src/lib/webrtc.ts`、`signaling.ts`、`restream.ts`（如存在）。
2. 从 `package.json` 移除 `ws`、`@p2pcf/worker`、`@p2pcf/client` 依赖。
3. 删除 `src/main/` 中旧的本地信令服务器代码。
4. 删除 `test-two.bat`、`test-two.sh`、`test-simple.ps1` 等测试脚本。
5. 删除 `C:\ngrok-v3`、`C:\Users\MONv\scoop\apps\ngrok` 等 ngrok 残留。
6. 撤销 ngrok authtoken（提醒用户手动）。

### 第二步：安装必要依赖
```bash
npm install hls.js
第三步：创建主持方服务管理模块
新建 src/renderer/src/lib/streaming-server.ts，内容：

ts
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

let mediamtxProcess: ChildProcess | null = null;
let cloudflaredProcess: ChildProcess | null = null;

// 启动 MediaMTX（假设安装在 C:\mediamtx）
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
第四步：改造主持方界面 (Host.svelte)
移除原有“开始共享”按钮的 WebRTC 逻辑。

新按钮行为：

调用 startMediaMTX() 启动流媒体服务器。
调用 startCloudflared() 获得公网域名。
生成随机流密钥（6 位字母数字），组合播放链接：https://域名/流密钥/index.m3u8。
显示给用户：
OBS 配置：服务器 rtmp://localhost:1935，串流密钥 <流密钥>
公网播放链接（一键复制）
提示：“打开 OBS，填入上述地址，开始推流，然后将播放链接发给朋友”。
增加“停止共享”按钮，调用 stopAll() 关闭服务。

第五步：改造观众界面 (Join.svelte)
移除输入房间码逻辑。

改为“输入播放链接”文本框。

点击“观看”后，使用 hls.js 加载链接并播放到 <video> 元素。

添加加载状态提示。

第六步：主进程调整
移除 desktopCapturer 相关 IPC（不再需要屏幕捕获权限）。

确保 Electron 允许 child_process 启动外部程序。

第七步：测试与验证
手动启动 MediaMTX 和 cloudflared 测试隧道是否正常。

OBS 推流到 rtmp://localhost:1935（流密钥任意），浏览器访问 http://localhost:8888/<流密钥>/index.m3u8 确认本地播放正常。

使用 cloudflared 隧道获得的公网链接测试远程播放。

通过应用集成测试完整流程。

第八步：打包发布
更新 package.json 版本号至 2.0.0。

执行 npm run build:win 生成安装包。

提交代码，打标签 v2.0.0，上传 GitHub Release。

验收标准
主持方点击“开始共享”后，应用自动启动 MediaMTX + cloudflared，获得公网播放链接。

观众方输入链接后，应用内正常播放 HLS 流，延迟 < 5 秒。

所有旧 WebRTC 代码和残留文件清理完毕。

安装包可正常安装、卸载，更新功能保留。