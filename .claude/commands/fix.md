# 指令：修复打包版 cloudflared 隧道启动超时

## 问题
打包安装后，点击“开始共享”卡死在启动界面，60s 后报错 `cloudflare隧道启动超时`。开发模式下正常。

## 根本原因
- 打包后 `cloudflared.exe` 的路径获取可能不正确，或执行权限受限。
- cloudflared 进程因网络环境（代理、防火墙）无法连接到 Cloudflare 边缘节点。
- 超时时间过短，打包后的首次启动网络延迟较高。
- 环境变量（如 `http_proxy`）可能干扰 cloudflared 连接。

## 修复步骤（AI 严格按序执行）

### 1. 修正 `getCloudflaredPath()` 函数
- 打开 `src/main/index.ts`，找到 `getCloudflaredPath()`（或类似函数）。
- 确保打包后路径正确指向 `resources/tools/cloudflared.exe`：
  ```ts
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tools', 'cloudflared.exe');
  }
添加日志：console.log('[cloudflared] 使用路径:', cloudflaredPath);

确保开发模式下能正确找到系统已安装的版本。

2. 优化 start-cloudflared IPC handler
在 spawn 时增加 env 选项，清除代理变量：

ts
const env = { ...process.env };
delete env.HTTP_PROXY;
delete env.HTTPS_PROXY;
delete env.http_proxy;
delete env.https_proxy;
cloudflaredProcess = spawn(cloudflaredPath, ['tunnel', '--url', 'http://localhost:8888'], {
  cwd: app.getPath('userData'), // 避免权限问题
  env,
  windowsHide: true
});
监听 stderr 并输出到主进程控制台，便于排查网络错误。

将超时时间延长至 120 秒（因为首次启动可能网络协商较慢）。

如果进程意外退出（close 事件），立即 reject 并附上退出码和错误信息。

3. 增加重试机制
如果首次启动超时，自动重试一次（共两次尝试）。

在 UI 上显示“正在建立隧道连接…”的进度提示。

4. 添加防火墙/网络问题的友好提示
捕获 ECONNREFUSED、ETIMEDOUT 等错误，在 UI 提示“隧道连接失败，请检查网络或关闭代理软件”。

5. 验证打包后的路径
构建后，检查 release/win-unpacked/resources/tools/cloudflared.exe 是否存在且可执行。

如果文件缺失，检查 electron-builder.yml 的 extraResources 配置是否正确。

6. 更新 README（可选）
在常见问题中添加：“如果隧道启动超时，请检查杀毒软件是否拦截了 cloudflared.exe，或尝试关闭代理软件。”

7. 重新构建并发布 v2.2.3
修改 package.json 版本为 2.2.3。

清理构建：rm -rf release out && npm run build:win

提交并推送标签：

bash
git add -A && git commit -m "fix: 修复安装版cloudflared隧道启动超时，发布v2.2.3"
git tag v2.2.3 -m "v2.2.3 修复隧道连接问题"
git push origin main --tags
gh release create v2.2.3 release/PCConnect\ Setup\ 2.2.3.exe --title "v2.2.3 修复隧道启动超时" --notes "修复：打包版cloudflared路径、代理干扰、超时延长、自动重试。请所有用户更新。"
验收标准
安装新版本后，点击“开始共享”能在 30 秒内生成公网链接（首次可能需要 1-2 分钟）。

如果网络不通，应用给出明确提示，而不是静默超时。

控制台日志清晰显示 cloudflared 的路径和输出。