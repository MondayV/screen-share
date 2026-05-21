# 指令：彻底清除主进程中所有 `streaming` 模块引用

## 问题
安装 v2.0.0 后，点击“开始共享”报错：
`Error: Cannot find module './streaming'`，路径为 `out/main/index.js`。

## 原因
主进程代码（`src/main/index.ts`）或 preload 代码中仍残留 `require('./streaming')` 或 `import ... from './streaming'`，打包后被编译进 `out/main/index.js`，导致运行时找不到模块。

## 修复步骤（AI 必须严格执行）

### 1. 全局搜索并删除所有残留引用
- 在项目根目录执行：
  ```bash
  grep -r "streaming" src/ --include="*.ts" --include="*.js" --include="*.svelte"
排查所有包含 streaming 的行，删除或替换：

import { ... } from './streaming' → 删除整行

require('./streaming') → 删除整行

任何对 startStreaming、stopStreaming 等函数的调用 → 改为直接调用已存在的 IPC handler（即 ipcRenderer.invoke('start-mediamtx') 等）

特别注意 src/main/index.ts 和 src/preload/index.ts。

2. 确保主进程直接使用 child_process.spawn 启动外部程序
在 src/main/index.ts 中，确认已存在 start-mediamtx、start-cloudflared、stop-all 三个 IPC handler，内部直接使用 spawn，不依赖任何外部模块。

如果这些 handler 中还有 require('./streaming') 或 import ... from './streaming'，立即删除并替换为内联逻辑。

3. 清理 preload 脚本
在 src/preload/index.ts 中，确认只暴露了 startMediamtx、startCloudflared、stopAll 三个方法，没有暴露 startStreaming 或 stopStreaming。

删除任何对 streaming 模块的导入。

4. 清理渲染进程调用
在 src/renderer/src/Host.svelte 中，确保 startShare 调用的是 window.electronAPI.startMediamtx() 和 window.electronAPI.startCloudflared()，而不是旧的 startStreaming。

5. 重新构建并验证
删除旧的构建产物：rm -rf release out

重新打包：npm run build:win

安装新生成的安装包进行测试，确认不再出现 Cannot find module './streaming'。

验收标准
主持方点击“开始共享”后，成功启动 MediaMTX 和 cloudflared，生成公网链接。

控制台不再出现 Cannot find module './streaming' 错误。