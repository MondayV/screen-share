# 指令：PCConnect v2.0.0 正式发布 (OBS串流模式) — 全自动整理与部署

## 目标
1. 更换项目图标，移除所有与借鉴项目（腾讯会议等）相关的图片，使用默认/通用图标。
2. 清理项目多余文件，确保代码整洁。
3. 更新 `README.md`，包含软件基本用法、OBS 配置教程、更新日志。
4. 将当前分支 `dev/v1.0.1` 设为 `main` 主分支，并强制推送到远程。
5. 升级版本号至 `2.0.0`，提交代码，打标签 `v2.0.0`，创建 GitHub Release。

## 执行步骤（AI 严格按顺序完成）

### 1. 更换应用图标，移除侵权素材
- 检查 `electron-builder.yml` 或 `package.json` 中 `build.win.icon` 配置，如果指向具体图标文件（如 `resources/icon.ico`），执行以下操作：
  - 使用 **Node.js 脚本** 生成一个极简的 256x256 像素 **绿色 PC 连接图标** (ICO 格式)。
    ```js
    // AI 可运行此脚本生成图标
    const fs = require('fs');
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(256, 256);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#00FF88';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 140px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PC', 128, 128);
    const buf = canvas.toBuffer();
    fs.writeFileSync('resources/icon.png', buf);
    // 然后使用 png-to-ico 转换
若 canvas 模块不可用，可改用 Electron 默认图标：直接移除 icon 配置项，打包时将使用 Electron 自带的默认图标，完全无版权风险。

删除其他可能存在的借鉴图片（如 resources/tencent-icon.ico、assets/qq-meeting.png 等），AI 需搜索 resources、assets 目录，凡是包含 tencent、qq、会议、meeting 等关键字的资源文件，一律删除或替换为通用图标。

确认项目中没有残留的腾讯会议 UI 截图或设计稿。

2. 清理项目多余文件
删除所有测试脚本和临时文件：

test-two.bat、test-two.sh、test-simple.ps1、build-portable.ps1

删除旧的开发者指令文件 .claude/commands/ 下除 release-v2.0.0.md 外的所有 .md 文件（如果存在）。

删除 ngrok、cloudflared 等残留的可执行文件和配置文件（确认 C:\ngrok-v3 等已删除，项目目录内无 ngrok.exe、cloudflared.exe）。

确保 node_modules 未进入版本库（.gitignore 已包含）。

3. 更新 README.md
使用以下 Markdown 模板 覆盖原有内容（AI 可根据实际文件路径微调）：

markdown
# PCConnect - 零门槛屏幕共享

一款基于 OBS + MediaMTX + Cloudflare 免费隧道的屏幕共享工具，**主持人无需注册、无需域名、无需 API Key**，观众只需粘贴链接即可观看。

## ✨ 功能特点
- 🖥️ **屏幕共享**：利用 OBS 强大的采集能力，支持整个屏幕、窗口、游戏画面。
- 🔊 **语音通话**：支持麦克风采集（需在 OBS 中配置音频源）。
- 🔗 **零门槛分享**：自动生成公网播放链接，发给朋友即可观看，无需任何网络配置。
- 💰 **永久免费**：基于开源组件，无次数限制，无月费。
- 🎨 **皮肤系统**：内置多款皮肤（默认、深色、赛博朋克、手账涂鸦、像素比特）。

## 📥 安装
1. 下载最新安装包：从 [GitHub Releases](https://github.com/MondayV/screen-share/releases) 下载 `PCConnect Setup 2.0.0.exe`。
2. 双击安装，勾选“创建桌面快捷方式”。
3. 安装完成后，桌面会出现 PCConnect 图标。

## 🚀 使用教程

### 作为主持人（共享你的屏幕）
1. **安装 OBS Studio**：从 [obsproject.com](https://obsproject.com/) 下载并安装 OBS。
2. **启动 PCConnect**，点击 **“开始共享”**。
3. 应用会自动在后台启动串流服务，并显示：
   - **OBS 服务器地址**：`rtmp://localhost:1935`
   - **OBS 串流密钥**：`随机6位密钥`
   - **公网播放链接**：`https://xxxx.trycloudflare.com/密钥/index.m3u8`
4. **配置 OBS**：
   - 打开 OBS，点击 **设置 → 推流**。
   - 服务选择 `自定义...`，填入上述服务器和密钥。
   - 在来源中添加要共享的内容（显示器采集 / 窗口采集 / 游戏采集）。
5. 点击 OBS 的 **“开始推流”**。
6. 将 **公网播放链接** 复制并发送给朋友。
7. 结束时，在 OBS 中点击“停止推流”，并在 PCConnect 中点击“停止共享”。

### 作为观众（观看朋友的屏幕）
1. 启动 PCConnect，点击 **“观看”** 选项卡。
2. 粘贴主持人分享的 **播放链接**，点击 **“观看”** 按钮。
3. 稍等片刻，应用内将播放共享画面（延迟约 1-5 秒）。

### OBS 使用注意事项
- 以管理员身份运行 OBS 可避免部分游戏黑屏或无法捕获的问题。
- 如果共享游戏，推荐使用“游戏采集”模式，性能更优。
- 网络不稳定时可降低 OBS 输出比特率（设置 → 输出 → 视频比特率，建议 2000-4000 Kbps）。

## 🛠️ 高级设置（可选）
- **自定义皮肤**：在 PCConnect 设置中可切换皮肤主题。
- **音频通话**：在 OBS 中添加“音频输入采集”作为麦克风源，观众就能听到你的声音。

## 🔄 更新日志
### v2.0.0 (2026-05-21)
- 重构为 OBS 串流模式，彻底解决网络连接问题
- 新增零门槛主持功能（无需注册、域名、API Key）
- 集成 HLS 播放器，观众端极简操作
- 更换默认图标，移除所有借鉴项目相关素材
- 清理项目多余文件，优化代码结构

## 📜 开源协议
MIT License
4. 版本号升级与提交
修改 package.json 中 version 字段为 "2.0.0"。

执行 npm install 同步 package-lock.json（可选）。

提交所有更改：

bash
git add -A
git commit -m "release: v2.0.0 - OBS串流模式正式版"
5. 分支管理：将当前分支设为 main
当前分支为 dev/v1.0.1，执行：

bash
git checkout -b main
git branch -D dev/v1.0.1   # 删除本地旧分支（可选）
git push origin main --force   # 强制推送到远程 main
推送成功后，指导用户前往 GitHub 仓库 → Settings → Branches，将默认分支改为 main。

6. 打标签并发布
bash
git tag v2.0.0 -m "v2.0.0 零门槛屏幕共享正式版"
git push origin v2.0.0

gh release create v2.0.0 \
  --title "v2.0.0 零门槛屏幕共享正式版" \
  --notes "🎉 全新架构：OBS串流模式，彻底告别网络配置烦恼

✨ 新特性
- 主持人无需注册、无需域名、无需 API Key
- 观众粘贴链接即可观看，零门槛
- 基于 OBS + MediaMTX + Cloudflare 免费隧道
- 更换默认图标，移除所有借鉴素材
- 全新 README，包含详细 OBS 使用教程

📥 下载：PCConnect Setup 2.0.0.exe" \
  release/pc-connect-2.0.0-setup.exe
7. 最终确认
执行 git status 确认工作区干净。

输出仓库地址：https://github.com/MondayV/screen-share

提示用户：现在主分支已是 main，后续开发请基于此分支。

注意事项
如果生成图标脚本缺乏依赖，AI 将直接移除图标配置，使用默认 Electron 图标。

强制推送 main 分支会覆盖远程，确保已备份旧代码（如有需要）。

如果 gh 未登录，AI 会提示先执行 gh auth login。