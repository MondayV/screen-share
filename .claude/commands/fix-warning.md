# 指令：修复编译警告与控制台乱码

## 目标
1. 修复启动时中文信令日志在 Windows 终端显示为乱码的问题。
2. 消除 Svelte 编译警告：`RemoteControl has unused export property 'onEndControl'`。

## 修复步骤

### 1. 终端中文乱码
**原因**：Windows 终端默认代码页为 GBK，Node.js 输出 UTF-8 中文时会乱码。

**方案**：在 `package.json` 的 `start` 脚本前添加 `chcp 65001 &&`，使终端临时切换至 UTF-8 编码。
```json
"scripts": {
  "start": "chcp 65001 && electron .",
  // 若跨平台可改为:
  // "start": "cross-env ELECTRON_ENCODING=utf-8 electron ."
}