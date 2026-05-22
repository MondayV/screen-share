 指令：将 MediaMTX 和 cloudflared 打包进安装程序，彻底移除外部依赖

## 目标
- 主持人点击“开始共享”时，不再提示缺少 `C:\mediamtx\mediamtx.exe` 或 `cloudflared`。
- 所有依赖文件随应用安装到本地，路径由应用自动管理。
- 更新 `README.md` 移除手动下载说明。
- 不影响开发模式（开发时仍使用系统中已安装的版本）。

## 前置条件
- 当前系统已安装：
  - `C:\mediamtx\mediamtx.exe`（MediaMTX 主程序）
  - `cloudflared.exe`（通过 Scoop 或手动安装，路径可通过 `where cloudflared` 查到）

## 执行步骤

### 1. 准备资源文件
- 在项目根目录创建 `resources/tools/` 目录（如果不存在则创建）。
- 将 `C:\mediamtx\mediamtx.exe` 复制到 `resources/tools/mediamtx.exe`。
- 找到 `cloudflared.exe` 的完整路径（在终端执行 `where cloudflared`，通常为 `C:\Users\MONv\scoop\shims\cloudflared.exe` 或 `C:\Users\MONv\scoop\apps\cloudflared\current\cloudflared.exe`），将其复制到 `resources/tools/cloudflared.exe`。

### 2. 配置 electron-builder
- 打开 `electron-builder.yml`（或 `package.json` 的 `build` 字段）。
- 添加 `extraResources` 配置（如果已存在则合并）：
  ```yaml
  extraResources:
    - from: "resources/tools"
      to: "tools"
      filter:
        - "*.exe"
这会将 resources/tools/mediamtx.exe 和 cloudflared.exe 打包到安装目录下的 resources/tools/ 文件夹中，并随应用分发。

3. 修改主进程中依赖路径的获取逻辑
打开 src/main/index.ts，添加一个辅助函数，根据是否打包返回正确路径：

ts
import { app } from 'electron';
import path from 'path';

function getMediaMTXPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tools', 'mediamtx.exe');
  }
  return 'C:\\mediamtx\\mediamtx.exe'; // 开发模式
}

function getCloudflaredPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tools', 'cloudflared.exe');
  }
  // 开发模式：尝试多种路径
  const possiblePaths = [
    path.join(app.getPath('userData'), 'bin', 'cloudflared.exe'),
    'cloudflared.exe', // 依赖系统 PATH
  ];
  for (const p of possiblePaths) {
    if (require('fs').existsSync(p)) return p;
  }
  return 'cloudflared.exe';
}
修改 start-mediamtx IPC handler 中 spawn 调用的第一个参数，使用 getMediaMTXPath() 而不是硬编码的 'C:\\mediamtx\\mediamtx.exe'。

修改 start-cloudflared IPC handler，使用 getCloudflaredPath() 代替 getCloudflaredPath() 的旧实现（如果有），或直接使用该函数。

4. 清理旧依赖逻辑
删除 src/main/dependency-manager.ts 中的自动下载代码（如果存在）。

删除任何与“检查并下载依赖”相关的函数调用。

确保应用不会再尝试从网络下载 MediaMTX 或 cloudflared。

5. 更新 README.md
找到“主持方依赖”部分，将其替换为：

text
### 系统要求
- Windows 10 或更高版本
- 应用已内置所需组件，无需额外安装
删除任何“自动下载”、“手动下载链接”的提示。

6. 测试与打包
更新版本2.2.1
执行 rm -rf release out && npm run build:win。

安装生成的安装包，在安装目录的 resources/tools/ 下确认 mediamtx.exe 和 cloudflared.exe 存在。

启动应用，点击“开始共享”，确认 MediaMTX 和 cloudflared 均能正常启动，无“缺少文件”错误。

测试观众端观看功能正常。

验收标准
安装包中包含了 MediaMTX 和 cloudflared。

新安装的机器上，无需手动下载任何工具，主持人可以一键开始共享。

开发模式下仍可使用本地已安装的工具。

README 已更新，不再提及额外依赖。