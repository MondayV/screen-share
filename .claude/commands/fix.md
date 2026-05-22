# 指令：修复 MediaMTX 启动超时

## 问题
应用启动时提示“MediaMTX 启动超时，请确认 C:\mediamtx\mediamtx.exe 存在”，但该文件确实存在。

## 可能原因
1. 主进程判断 MediaMTX 启动成功的标志（如日志关键字）与实际输出不匹配。
2. 启动超时时间过短，MediaMTX 初始化较慢。
3. 防火墙或杀毒软件阻止了 MediaMTX 监听端口，导致无输出。
4. `spawn` 的子进程未正确捕获 stdout/stderr。

## 修复步骤（AI 严格按顺序执行）

### 1. 增加超时时间并改进错误处理
- 找到 `src/main/index.ts` 中启动 MediaMTX 的 IPC handler（通常是 `start-mediamtx`）。
- 将超时时间从 10 秒延长到 **30 秒**。
- 添加 stderr 日志输出到控制台，便于排查。
- 示例修改：
```ts
mediamtxProcess = spawn('C:\\mediamtx\\mediamtx.exe', [], { cwd: 'C:\\mediamtx' });
mediamtxProcess.stderr?.on('data', (data) => {
  console.error('[MediaMTX]', data.toString());
});
const timeout = setTimeout(() => {
  reject(new Error('MediaMTX 启动超时'));
}, 30000); // 延长到 30 秒