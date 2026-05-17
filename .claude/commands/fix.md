# 指令：修复输入连接码后无反应的问题

## 问题现象
在 Participant 实例中输入 6 位连接码并点击“加入”后，应用没有任何反应：无网络请求、无错误提示、界面无变化。

## 根因排查方向
1. 点击“加入”按钮的事件处理函数未正确绑定或被覆盖。
2. 连接码输入框绑定的变量没有正确同步，导致获取到的值为空。
3. 信令连接逻辑（如 `connectToRoom`）未被调用，或条件判断阻止了执行。
4. 按钮处于禁用状态（`disabled` 属性为 `true`）且未给出提示。
5. UI 未反馈连接状态（“正在连接…”等文字），导致用户误以为无反应。

## 修复步骤

### 1. 检查 `Join.svelte` 中“加入”按钮的绑定
- 找到按钮元素 `<button on:click={joinSession}>` 或类似代码。
- 确认 `joinSession` 函数存在且能正常执行。
- 在 `joinSession` 函数开头添加 `console.log('[Join] 加入按钮被点击')` 用于调试。

### 2. 检查连接码输入框绑定
- 找到 `<input bind:value={roomCode}>` 确认变量名。
- 确认 `roomCode` 变量在按钮点击时不为空。
- 在 `joinSession` 中打印 `console.log('[Join] 连接码:', roomCode)`。

### 3. 检查信令连接调用链
- `joinSession` 函数中应调用类似 `webrtc.connectToRoom(roomCode)` 或 `signaling.connectToRoom(roomCode)`。
- 确认该函数存在且未被注释。
- 若调用前有 `if` 条件（如 `if (roomCode.length === 6)`），确保条件成立；若不成立，添加 `else` 分支显示错误提示。

### 4. 检查按钮禁用状态
- 如果按钮设置了 `disabled={!roomCode || roomCode.length !== 6}`，确认输入 6 位字符后长度正确（注意空格、大小写）。
- 可在输入框上添加 `on:input` 自动转换大写/去除空格，确保长度判断准确。

### 5. 添加连接状态反馈
- 点击按钮后，立即显示“正在连接…”文字或加载动画。
- 如果信令连接失败，弹出具体的错误提示，而不是静默失败。

### 6. 对比 Host 端连接码生成逻辑
- 确认 Host 端生成的连接码与 Participant 端输入的格式一致（例如都是 6 位大写字母+数字，排除易混淆字符）。
- 如果 Host 端生成的连接码长度已修改（例如改为 8 位），Participant 端的长度验证需同步更新。

## 验证
- 修改后重启双实例测试（`bash test-two.sh`）。
- 在 Participant 输入 Host 显示的连接码，点击“加入”，控制台应出现调试日志，并触发信令连接。
- 如果连接成功，Participant 将看到共享画面；如果失败，应有明确的中文错误提示。