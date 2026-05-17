/指令：手动构建绿版（免安装）PCConnect 应用

## 目标
彻底绕过 electron-builder 打包错误，生成可运行的 Windows 绿版应用，放在 `release/PCConnect/` 目录。

## 执行步骤（AI 必须严格按顺序在终端中执行）

1. **清理旧的构建产物**
   - 在项目根目录执行：
     - Windows PowerShell: `Remove-Item release -Recurse -Force -ErrorAction SilentlyContinue`
     - Git Bash / Linux: `rm -rf release`

2. **编译项目代码**
   - 运行：`npx electron-vite build`（或 `npm run build`，根据项目脚本）
   - 确保 `out/` 目录生成无误。

3. **创建绿版应用目录结构**
   ```powershell
   New-Item -ItemType Directory -Force -Path release\PCConnect
复制 Electron 核心文件

从 node_modules/electron/dist/ 复制所有内容到 release/PCConnect/：

powershell
Copy-Item node_modules\electron\dist\* -Destination release\PCConnect\ -Recurse -Force
重命名 electron.exe 为 PCConnect.exe

powershell
Rename-Item release\PCConnect\electron.exe PCConnect.exe
创建资源目录并复制应用代码

powershell
New-Item -ItemType Directory -Force -Path release\PCConnect\resources\app
Copy-Item out\* -Destination release\PCConnect\resources\app\ -Recurse -Force
Copy-Item package.json -Destination release\PCConnect\resources\app\ -Force
（可选）处理原生模块或额外资源

如果项目需要额外资源文件（如 assets/），AI 应检查并一同复制到 resources/app/。

验证生成结果

检查 release/PCConnect/PCConnect.exe 是否存在。

输出成功信息：“绿版应用已生成于 release/PCConnect/，双击 PCConnect.exe 即可运行。”

注意事项
如果当前操作系统不是 Windows，AI 需对应调整命令（如使用 cp 和 mv）。

完成后询问用户是否需要自动压缩该文件夹为 zip 以便分发。