# 指令：增加全环境自检诊断，解决其他电脑无法运行的问题

## 目标
在主持人点击“开始共享”后，首先执行一系列环境检查，全部通过后再启动 MediaMTX 和 cloudflared。若某项检查失败，在界面上显示明确的中文错误和解决建议，避免不明原因报错。

## 检测项目
1. 检查 MediaMTX 可执行文件 (`tools/mediamtx.exe`) 是否存在且可执行
2. 检查 cloudflared 可执行文件 (`tools/cloudflared.exe`) 是否存在且可执行
3. 检查 cloudflared 能否正常运行 (`cloudflared --version`)
4. 检查端口 8888 是否被占用
5. 检查端口 1935 是否被占用
6. 检查能否连接到 trycloudflare.com (出站网络)
7. 可选：检查 OBS WebSocket 是否可达 (ws://localhost:4455)

## 实施步骤

### 1. 在主进程中添加 IPC handler `'run-diagnostics'`
- 文件：`src/main/index.ts`
- 实现一个异步函数，依次执行上述检测，将每一项的结果（`{ name, status: 'pass'|'fail', message: string, suggestion: string }`）收集到数组，返回给渲染进程。
- 检测细节：
  - **文件存在**：使用 `fs.existsSync`
  - **可执行性**：尝试以 `spawn(file, ['--version'])` 运行，超时 5 秒，检查退出码 0
  - **端口占用**：在 Windows 上使用 `netstat -ano | findstr :PORT`，解析输出；或直接尝试创建 `net.createServer().listen(PORT)` 测试端口是否空闲
  - **出站网络**：使用 `dns.lookup('trycloudflare.com')` 或 `net.createConnection({host:'trycloudflare.com', port:443})`，超时 5 秒
  - **OBS WebSocket**：使用 `ws` 模块尝试连接 `ws://localhost:4455`，超时 3 秒（可选，根据是否保留 OBS 自动连接决定）
- 注意：避免引入新的依赖，优先使用 Node.js 内置模块。

### 2. 在渲染进程调用检测并展示结果
- 文件：`src/renderer/src/Host.svelte`
- 在 `startShare` 函数中，先调用 `window.electronAPI.runDiagnostics()` 获取检测结果。
- 如果所有关键项（文件存在、cloudflared 可执行、端口空闲）都通过，则继续正常启动。
- 如果有失败项，在 UI 中显示诊断面板，列出每一项的状态（✅/❌）和解决建议。
- 用户可根据提示修复后，点击“重新检测”按钮再次运行。
- 不自动弹出 alert，所有信息内嵌在界面中。

### 3. 设计诊断面板 UI
- 使用已有的皮肤变量，新增一个 `{#if showDiagnostics}` 区块。
- 示例结构：
```svelte
<div class="diagnostics-panel">
  <h3>环境诊断结果</h3>
  {#each diagResults as item}
    <div class="diag-item" class:pass={item.status==='pass'} class:fail={item.status==='fail'}>
      <span>{item.status==='pass' ? '✅' : '❌'} {item.name}</span>
      {#if item.status==='fail'}
        <p class="suggestion">{item.suggestion}</p>
      {/if}
    </div>
  {/each}
  <button on:click={reRunDiagnostics}>重新检测</button>
  <button on:click={()=>showDiagnostics=false}>关闭</button>
</div>
4. 构建与测试
清理构建：rm -rf release out

构建：npm run build:win

在一台“不能运行”的电脑上安装测试，观察诊断面板给出的具体失败项，验证提示是否准确。

验收标准
主持方点击“开始共享”后，首先出现诊断面板（如果存在问题）或直接进入正常流程（全通过）。

诊断结果清晰指出具体失败原因（如“端口8888被占用，PID 1234”）。

不破坏现有共享功能，正常环境下检测瞬间完成且不影响启动速度。