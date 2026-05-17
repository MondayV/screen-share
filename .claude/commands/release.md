# 指令：全自动版本提交、打标签、创建 GitHub Release

## 目标
提交所有修改 → 升级版本号 → 打标签 → 推送 → 在 GitHub 上创建 Release 并可选上传安装包。

## 前置条件
- 已安装 [GitHub CLI](https://cli.github.com/) 并登录 (`gh auth login`)。
- 项目内已配置 `npm run dist` 生成安装包（生成目录通常为 `dist/`）。

## 使用方式
执行 `/release <版本号> [简短描述]`，例如：
- `/release 1.0.2`           → 自动生成描述
- `/release 1.0.2 修复远程控制` → 自定义描述

## 执行步骤（AI 自动完成）

### 1. 确认版本号与描述
- 若用户未提供版本号，反问：“请输入新版本号（如 1.0.2）”。
- 若未提供描述，自动从最近提交提取关键词或使用 "例行更新"。

### 2. 检查工作区
- 运行 `git status --short`，若无改动，提示“工作区干净，是否仅创建 Release？”。

### 3. 更新版本号
- 修改 `package.json` 的 `version` 字段为给定版本号。
- 运行 `npm install` 同步 `package-lock.json`（可选，视项目情况）。

### 4. 提交所有改动
```bash
git add -A
git commit -m "chore: release v<版本号> - <描述>"
5. 打标签并推送
bash
git tag v<版本号> -m "v<版本号>: <描述>"
git push origin HEAD --tags
6. 生成安装包（可选）
询问用户：“是否生成安装包并上传到 Release？(y/n)”

若同意，运行 npm run dist，等待完成。

检查 dist/ 目录，识别出安装文件（如 .exe, .dmg, .AppImage）。

7. 创建 GitHub Release 并上传资产
使用 gh 命令创建 Release：

bash
gh release create v<版本号> \
  --title "v<版本号>: <描述>" \
  --notes "<描述>" \
  dist/*.exe dist/*.dmg dist/*.AppImage
若未生成安装包，则只创建无资产的 Release：

bash
gh release create v<版本号> --title "v<版本号>" --notes "<描述>"