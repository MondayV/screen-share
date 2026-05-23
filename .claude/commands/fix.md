# 指令：恢复环境自检诊断功能（适用于 v2.2.10+）

## 目标
在主持方点击“开始共享”前，自动检测以下项目并在界面中显示结果：
1. MediaMTX 可执行文件是否存在
2. cloudflared 可执行文件是否存在
3. 端口 8888 是否被占用
4. 端口 1935 是否被占用
5. 能否连接 trycloudflare.com（出站网络）
6. （可选）OBS WebSocket 是否可达

## 修改范围
- `src/main/index.ts` 或 `ipcMainHandlers.ts`：新增 IPC handler `run-diagnostics`
- `src/preload/index.ts`：暴露 `runDiagnostics` 方法
- `src/renderer/src/Host.svelte`：在“开始共享”时先调用诊断，通过后才继续启动

## 实施步骤

### 1. 主进程添加 `run-diagnostics` IPC
```ts
ipcMain.handle('run-diagnostics', async () => {
  const results: Array<{ name: string; status: 'pass' | 'fail'; reason?: string }> = [];
  // 检查文件存在
  const mediamtxPath = path.join(process.resourcesPath, 'tools', 'mediamtx.exe');
  const cloudflaredPath = path.join(process.resourcesPath, 'tools', 'cloudflared.exe');
  if (app.isPackaged) {
    results.push({ name: 'MediaMTX 文件', status: fs.existsSync(mediamtxPath) ? 'pass' : 'fail' });
    results.push({ name: 'cloudflared 文件', status: fs.existsSync(cloudflaredPath) ? 'pass' : 'fail' });
  } else {
    results.push({ name: 'MediaMTX 文件', status: fs.existsSync('C:\\mediamtx\\mediamtx.exe') ? 'pass' : 'fail' });
    results.push({ name: 'cloudflared 文件', status: fs.existsSync('C:\\Users\\MONv\\scoop\\shims\\cloudflared.exe') ? 'pass' : 'fail' });
  }
  // 端口占用检测（尝试监听）
  const portCheck = (port: number) => new Promise<boolean>((resolve) => {
    const net = require('net');
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => { server.close(); resolve(true); });
    server.listen(port, '127.0.0.1');
  });
  results.push({ name: '端口 8888', status: (await portCheck(8888)) ? 'pass' : 'fail' });
  results.push({ name: '端口 1935', status: (await portCheck(1935)) ? 'pass' : 'fail' });
  // 出站网络检测
  const dnsOk = await new Promise<boolean>((resolve) => {
    require('dns').lookup('trycloudflare.com', (err) => resolve(!err));
  });
  results.push({ name: '出站网络', status: dnsOk ? 'pass' : 'fail' });
  return results;
});
2. preload 暴露 API
ts
contextBridge.exposeInMainWorld('electronAPI', {
  // 已有...
  runDiagnostics: () => ipcRenderer.invoke('run-diagnostics')
});
3. Host.svelte 调用诊断
ts
async function startShare() {
  // 先运行诊断
  const diag = await window.electronAPI.runDiagnostics();
  const failed = diag.filter(d => d.status === 'fail');
  if (failed.length > 0) {
    showDiagnostics = true;
    diagResults = diag;
    return; // 不继续启动
  }
  // 原有启动逻辑...
}
4. UI 显示诊断面板
在模板中添加诊断面板（参考之前 design 的样式）。

5. 构建与测试
清理：rm -rf release out

构建：npm run build:win

测试：启动应用，点击“开始共享”，如果环境有问题会弹出诊断结果。