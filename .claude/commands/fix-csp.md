# 指令：修复 CSP 导致的 WebSocket 连接拒绝问题

## 角色
你是 Electron 安全策略专家，了解内容安全策略（CSP）对应用内网络请求的影响。

## 任务
应用当前无法连接内嵌的 WebSocket 信令服务器，因为 CSP 指令 `default-src 'self'` 阻止了所有到 `ws://localhost:3456` 的连接。需要修改 CSP 以允许 WebSocket 连接，同时保持基本的安全限制。

## 具体要求
1. 定位项目中所有定义 CSP 的位置：可能是 `index.html` 中的 `<meta>` 标签，或 Electron 主进程中通过 `session.defaultSession.webRequest.onHeadersReceived` 设置的策略。
2. 修改 CSP，添加 `connect-src 'self' ws://localhost:3456 ws://127.0.0.1:3456;`。
   - 如果已有 `default-src 'self'`，只需增加 `connect-src` 指令（它会覆盖 `default-src` 对连接的限制）。
   - 确保不影响其他资源加载（如样式、脚本等）。
3. 修改后，重启应用时浏览器控制台不应再出现 CSP 报错，且 WebSocket 能成功连接。
4. 可选：如果项目使用 Vite 或 Webpack 的 HTML 模板，确保修改的是源文件，而不是构建后的文件（通常是在 `public/index.html` 或 `src/index.html`）。
5. 添加注释说明修改原因，方便后续维护。

## 验收标准
- 启动应用 → 底部状态或控制台显示“信令已连接”。
- 不再有 CSP 相关错误。
- 用户点击“开始共享”后能正常建立连接。