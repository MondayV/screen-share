# 指令：打造专业级 Windows 安装包 + 自动更新

## 目标
1. 修复 electron-builder 打包错误，生成 NSIS 安装程序（`.exe`），支持卸载。
2. 集成 `electron-updater`，从 GitHub Releases 检测新版本并自动更新。
3. 保留国内镜像加速，避免 electron 下载超时。

## 实施步骤

### 一、修复 electron-builder 打包错误（解决 `electron.exe` 缺失）
**原因分析**：electron-builder 26.8.1 可能无法正确解析 `electron-vite` 的输出目录结构，导致找不到 `electron.exe`。

#### 1.1 降级 electron-builder 到稳定版本
- 执行 `npm uninstall electron-builder`
- 执行 `npm install electron-builder@24.13.3 --save-dev`  
  （24.x 版本与 Electron 31 兼容性更好）

#### 1.2 确保 `electron-builder.yml` 配置正确
- 检查 `electron-builder.yml`（或 `package.json` 中的 `build` 字段），确保内容如下：
```yaml
appId: com.screen-share.pc-connect
productName: PCConnect
directories:
  buildResources: resources
  output: release
files:
  - out/**/*
  - package.json
win:
  target: nsis
  icon: resources/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  shortcutName: PCConnect
  uninstallDisplayName: PCConnect
如果没有 resources/icon.ico，AI 需临时生成一个简单图标或注释掉 icon 配置。

1.3 添加 .npmrc 国内镜像（已存在则跳过）
ini
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
1.4 重新构建测试
执行 rm -rf release && npm run build:win（Windows 下用 Remove-Item -Recurse -Force release）

如果仍然报错，AI 检查 electron-builder 日志，尝试添加 asar: false 或调整 files 配置。

二、集成 electron-updater 实现自动更新
2.1 安装依赖
bash
npm install electron-updater
2.2 修改主进程代码（src/main/index.js 或 src/main/index.ts）
在 app.whenReady() 之后添加：

js
import { autoUpdater } from 'electron-updater';

// 配置更新源（指向 GitHub Releases）
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'MondayV',
  repo: 'screen-share'
});

// 启动时检查更新
app.whenReady().then(() => {
  // ... 现有逻辑
  autoUpdater.checkForUpdatesAndNotify();
});

// 监听更新事件（可选，显示用户提示）
autoUpdater.on('update-available', () => {
  // 通知渲染进程有新版本
});
autoUpdater.on('update-downloaded', () => {
  // 询问用户是否立即安装
});
2.3 处理更新完成后的替换逻辑
electron-updater 会自动处理安装替换，用户下次启动时自动运行新版本。

2.4 添加应用启动时的版本检测（可选）
在渲染进程显示当前版本号，可从 package.json 或 autoUpdater.currentVersion 获取。

三、验证安装包和卸载功能
3.1 打包生成 NSIS 安装程序
执行 npm run build:win

检查 release/ 目录是否生成了 PCConnect Setup X.X.X.exe。

3.2 测试安装/卸载
双击安装包，确认安装流程、桌面快捷方式、安装目录。

进入 Windows 设置 → 应用 → 找到 PCConnect → 卸载，确认文件完全清理。

四、可选优化：发布到 GitHub Releases
使用 gh release create 上传安装包，并让 electron-updater 自动抓取。

发布指令可参考之前的 release.md，添加自动上传资产。

执行后输出
安装包路径：release/PCConnect Setup X.X.X.exe

更新功能已激活，发布新版本时 electron-updater 会自动检测。