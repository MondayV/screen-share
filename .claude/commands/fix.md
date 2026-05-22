# 指令：彻底修复打包版 cloudflared 隧道启动问题

## 问题诊断
*   之前的版本错误地尝试在打包后使用命名隧道（Named Tunnel）或者进行了不必要的登录检测，导致启动失败。
*   **核心错误**：未正确利用 Cloudflare 的“快速隧道 (Quick Tunnel)”服务，该服务完全免费且**无需 Cloudflare 账号**。

## 修复目标
1.  **完全移除对 `cloudflared tunnel login` 的依赖**，确保应用在任何电脑上都能直接启动快速隧道。
2.  **优化 `cloudflared` 进程管理**，确保能正确获取隧道 URL，并增加重试机制。
3.  **为聊天和标注功能预留本地 WebSocket 接口**，使其也能通过该隧道进行通信。
4.  **重新打包并发布修复版**。

## 执行步骤（AI严格按序执行）

### 1. 修正 `src/main/index.ts` 中的隧道启动逻辑
*   删除所有与 `cloudflared login` 相关的代码或判断。
*   **关键修改**：在 `start-cloudflared` IPC handler 中：
    *   只使用 `cloudflared.exe tunnel --url http://localhost:8888` 命令启动快速隧道。
    *   将超时时间延长至 **60秒**。
    *   **加强 URL 捕获**：确保能从输出中正确捕获 `https://*.trycloudflare.com` 格式的地址。
    *   **增加重试机制**：如果第一次启动失败或超时，自动重试一次（间隔5秒）。

### 2. 修复 `electron-builder.yml` 中的打包路径
*   确认 `extraResources` 配置正确指向 `resources/tools/` 目录。
*   打包后，`cloudflared.exe` 应位于安装目录的 `resources/tools/cloudflared.exe`。

### 3. 升级版本号并构建
*   将 `package.json` 中的版本号修改为 `2.2.4`。
*   清理并构建：`rm -rf release out && npm run build:win`

### 4. 更新 README.md
*   明确写明：“本软件完全免费，无需注册任何账号即可使用”。
*   添加说明：“屏幕共享功能基于 Cloudflare 的免费临时隧道服务（TryCloudflare），每次启动都会生成一个新的随机地址，保证连接安全。”

### 5. 发布
```bash
git add -A
git commit -m "fix: 彻底修复打包版隧道启动问题，完全依赖免费快速隧道，无需账号"
git tag v2.2.4 -m "v2.2.4 修复隧道问题，无需Cloudflare账号"
git push origin main --tags
gh release create v2.2.4 release/PCConnect\ Setup\ 2.2.4.exe --title "v2.2.4 无需账号，开箱即用" --notes "**紧急修复**：彻底解决了打包版因Cloudflare账号问题导致的隧道启动失败。现在完全免费，无需任何账号。"
验收标准
在一台没有登录过 Cloudflare 的全新电脑上安装后，点击“开始共享”，能在20-30秒内成功生成公网链接。

观众端能通过生成的链接正常观看。

开发者工具的控制台中不再有关于 login 或 account 的错误日志。