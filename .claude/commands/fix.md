# 指令：cloudflared 启动失败自诊断与友好提示

## 问题
打包后 cloudflared 进程退出码为 1，应用无法启动隧道。

## 修复目标
1. 在启动隧道前，先运行 `cloudflared --version` 测试其是否可用，捕获 stderr 中的错误详情。
2. 将详细错误信息发送到渲染进程，并在 UI 中显示具体原因（如缺少 VC++ 运行库、被杀软拦截、权限不足）。
3. 提供重试按钮和解决方案链接。
4. 升级版本号并发布 v2.2.6。

## 修改步骤

### 1. 在 `src/main/index.ts` 的 `start-cloudflared` handler 中添加自检逻辑
- 在 `spawn` 之前，先执行一次 `cloudflared --version`，超时 5 秒。
- 如果此命令失败或退出码非 0，捕获 stderr 并立即返回错误信息给渲染进程。
- 示例代码：
```ts
function checkCloudflared(path: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn(path, ['--version'], { windowsHide: true });
    let errorOutput = '';
    proc.stderr.on('data', (data) => { errorOutput += data.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) resolve(errorOutput || '未知错误');
      else resolve(null); // 正常
    });
    proc.on('error', (err) => resolve(err.message));
    setTimeout(() => resolve('自检超时'), 5000);
  });
}

// 在 handler 中使用
const checkErr = await checkCloudflared(cloudflaredPath);
if (checkErr) {
  // 将详细错误发送到渲染进程
  mainWindow.webContents.send('cloudflared-error', checkErr);
  reject(new Error(`Cloudflared 组件异常: ${checkErr}`));
  return;
}
// 然后再正式启动隧道
2. 渲染进程监听错误事件并显示详细提示
在 Host.svelte 的 onMount 中通过 ipcRenderer.on('cloudflared-error', ...) 接收错误信息。

当错误发生时，显示具体的解决指引：

若包含 VCRUNTIME 或 DLL 字样 → 提示“缺少 Visual C++ 运行库，请下载安装”，并提供官方链接。

若包含 Permission denied → 提示“cloudflared 被系统或杀毒软件阻止，请添加信任”。

若包含 not found → 提示“cloudflared 组件缺失，请重新安装软件”。

其他情况 → 显示原始错误信息。

3. 增强打包时的完整性校验
在 electron-builder.yml 中设置 asar: false（如果之前为 true），确保 cloudflared.exe 不被压缩。

在构建脚本中增加校验步骤：检查打包后的 resources/tools/cloudflared.exe 文件大小是否在 15-25MB 之间。

4. 更新 README 的常见问题
添加：“启动时提示 cloudflared 组件异常？”

安装 Visual C++ Redistributable
将 PCConnect 安装目录添加到杀毒软件白名单。
5. 升级版本并发布
修改 package.json 版本为 2.2.6。

构建：rm -rf release out && npm run build:win

提交发布：

bash
git add -A && git commit -m "fix: cloudflared启动前自检，详细错误提示，发布v2.2.6"
git tag v2.2.6 -m "v2.2.6 修复cloudflared启动错误"
git push origin main --tags
gh release create v2.2.6 release/PCConnect\ Setup\ 2.2.6.exe --title "v2.2.6 修复cloudflared启动问题" --notes "**诊断与修复**：启动隧道前自动检查cloudflared组件，若失败给出具体原因（如缺少VC++运行库、被杀软拦截等）。请更新。"
验收标准
在一台未安装 VC++ 运行库的机器上安装 v2.2.6，点击开始共享，应显示“缺少 Visual C++ 运行库，请下载安装”的提示。

在正常环境下，隧道启动正常。