# 指令：改用本地文件检测替代 MediaMTX API 查询

## 问题
MediaMTX API 端口 9997 未启用，无法通过 API 查询推流状态。

## 解决方案
改为在主进程中检查本地 HLS 文件是否生成。当 OBS 推流成功后，MediaMTX 会在内存或临时目录生成 HLS 片段，我们可以通过检查 `http://localhost:8888/<streamKey>/index.m3u8` 的 HTTP 响应来判断推流是否到达。

## 修改步骤

### 1. 修改 `check-path-active` IPC handler
- 文件：`src/main/index.ts`
- 删除原有通过 API 查询的代码，替换为：

```ts
ipcMain.handle('check-path-active', async (event, streamKey: string) => {
  return new Promise((resolve) => {
    const http = require('http');
    const options = {
      hostname: 'localhost',
      port: 8888,
      path: `/${streamKey}/index.m3u8`,
      method: 'HEAD',
      timeout: 3000
    };
    const req = http.request(options, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        resolve({ active: true, reason: '' });
      } else if (res.statusCode === 404) {
        resolve({ active: false, reason: '推流未到达，请检查 OBS 推流密钥是否填写正确' });
      } else {
        resolve({ active: false, reason: `推流异常 (${res.statusCode})，请检查 OBS 推流设置` });
      }
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ active: false, reason: '查询超时，请确认 MediaMTX 已启动' });
    });
    req.on('error', (err) => {
      resolve({ active: false, reason: '无法查询推流状态，请确认 MediaMTX 已启动' });
    });
    req.end();
  });
});
2. 确认 Host.svelte 调用方式不变
checkPathActive 仍然接收 streamKey 参数，调用方式无需修改。

3. 构建并测试
清理：rm -rf release out

构建：npm run build:win

测试流程：

启动应用，点击“开始共享”，不推流时第三个状态灯应为灰色。

在 OBS 中填入密钥并开始推流，5 秒内第三个状态灯应变为绿色。

观众端访问公网链接应能正常播放。

验收标准
推流到达后，状态灯由灰变绿。

未推流时显示明确原因（如“推流未到达，请检查密钥”）。

不再依赖 MediaMTX API，无需修改 MediaMTX 配置。