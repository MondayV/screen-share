# 指令：发布 v1.0.1 安装包，支持完整安装/卸载及旧版检测覆盖

## 目标
1. 将 `package.json` 版本号更新为 `1.0.1`。
2. 配置 `electron-builder` 生成标准 Windows NSIS 安装程序（`.exe`），支持：
   - 完整的安装向导（可选安装目录、创建桌面快捷方式）。
   - 控制面板中的标准卸载入口（`程序和功能`）。
   - **自动检测并覆盖/卸载旧版 PCConnect**（包括可能残存的绿版或旧安装版）。
3. 构建并生成安装包（`release/PCConnect Setup 1.0.1.exe`）。
4. 使用 GitHub CLI 将安装包上传至 GitHub Releases 的 `v1.0.1` 标签，并附上更新说明。

## 前置检查（AI 自动执行）
- 确认当前分支为 `dev/v1.0.1`（或主分支），工作区干净。
- 确认已安装 `gh`（GitHub CLI）并已登录（`gh auth status`）。
- 检查 `node_modules` 完整，必要时执行 `npm install`。

## 执行步骤

### 步骤 1：更新版本号
- 修改 `package.json` 中的 `version` 字段为 `"1.0.1"`。
- 同步更新 `package-lock.json`（如果存在），通过 `npm install` 自动完成。

### 步骤 2：配置 NSIS 安装包，支持覆盖旧版
**文件**：`electron-builder.yml`（若不存在则在 `package.json` 的 `build` 字段配置）
- 关键配置如下（AI 需根据项目结构适配，重点看 `nsis` 部分）：

```yaml
appId: com.screen-share.pc-connect
productName: PCConnect
copyright: Copyright © 2026
directories:
  output: release
  buildResources: resources
files:
  - out/**/*
  - package.json
win:
  target: nsis
  icon: resources/icon.ico
nsis:
  oneClick: false
  perMachine: true
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  shortcutName: PCConnect
  uninstallDisplayName: PCConnect
  # 关键：在安装前自动卸载旧版本（基于相同的 appId）
  # electron-builder 默认会检测并处理升级，但可通过以下方式增强
  # 以下是 NSIS 自定义脚本，用于强制清除旧版残留
  include: build/installer.nsh  # 自定义 NSIS 脚本，稍后创建
新建 build/installer.nsh，内容如下（AI 创建此文件）：

nsis
; 检测并卸载旧版 PCConnect（通过注册表查找卸载信息）
!macro customInit
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PCConnect" "UninstallString"
  ${If} $0 != ""
    MessageBox MB_OKCANCEL|MB_ICONQUESTION "检测到已安装的旧版 PCConnect，是否卸载并继续？" /SD IDOK IDCANCEL skip
    ExecWait '$0 /S'  ; 静默卸载旧版
    skip:
  ${EndIf}
  
  ; 同时检查常见的绿版残留目录（如果存在）
  IfFileExists "$PROGRAMFILES\PCConnect\*.*" 0 noLegacy
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "检测到旧版绿版文件夹：$PROGRAMFILES\PCConnect，建议手动删除后继续安装。是否继续？" /SD IDOK IDCANCEL abort
    Goto done
    abort:
    Quit
    noLegacy:
    done:
!macroend
如果项目原本没有 resources/icon.ico，AI 需创建一个默认图标（例如使用简单的 256x256 绿色方块），或从 Electron 默认资源复制。

步骤 3：生成安装包
执行 npm run build:win（或 electron-vite build && electron-builder --win --publish never）。

如果出现 electron.exe 缺失错误，按之前的解决方案手动复制（AI 可执行以下命令）：

powershell
if (!(Test-Path "release\win-unpacked\electron.exe")) {
  Copy-Item node_modules\electron\dist\electron.exe release\win-unpacked\PCConnect.exe
}
成功后在 release/ 目录下得到 PCConnect Setup 1.0.1.exe。

步骤 4：提交代码并打标签
git add -A

git commit -m "release: v1.0.1 with NSIS installer and upgrade support"

git tag v1.0.1

git push origin dev/v1.0.1 --tags（或 main 分支，根据实际情况）

步骤 5：创建 GitHub Release 并上传安装包
使用 gh 创建 Release：

bash
gh release create v1.0.1 \
  --title "v1.0.1 正式版" \
  --notes "✨ 新特性：
- 修复窗口共享问题
- 优化信令连接稳定性
- 集成完整安装/卸载程序
- 自动检测并覆盖旧版本

📥 下载 Windows 安装包：PCConnect Setup 1.0.1.exe" \
  release/"PCConnect Setup 1.0.1.exe"
如果生成的文件名不同，AI 需根据实际情况调整。

步骤 6：验证发布结果
输出 Release 链接：https://github.com/MondayV/screen-share/releases/tag/v1.0.1

建议用户：

下载安装包到干净环境测试安装、卸载、覆盖旧版行为。

确认安装后桌面快捷方式和控制面板卸载项正常工作。

在已有旧版本的机器上运行安装包，验证是否弹出卸载提示。

注意事项
若 gh 未安装或未登录，AI 应提示用户先执行 gh auth login。

若构建过程中遇到网络问题导致 electron 下载失败，AI 应自动使用国内镜像（已在 .npmrc 中配置）。

安装包大小可能会超过 100MB，属于正常现象。