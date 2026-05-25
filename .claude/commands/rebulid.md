# 指令：最终发布版本（安装版通过测试），更新所有文档

## 当前状态
- 安装版双开测试通过，OBS 推流正常，观众端可观看。
- 问题根源：打包后缺少 `mediamtx.yml` 且启动命令错误，已修复。
- 代码已提交，但尚未打标签和发布新版本。

## 目标
1. 升级版本号至 `2.3.0`（标志着推流路径问题彻底解决，安装版可正式分发）。
2. 更新 `README.md`，补充使用教程、常见问题和最新变化。
3. 更新 `CHANGELOG.md`（如果存在）或 Release 描述，记录本次修复内容。
4. 提交所有更改，打标签 `v2.3.0`，推送到 GitHub。
5. 创建 GitHub Release 并上传生成的安装包。

## 执行步骤（AI 严格按序完成）

### 1. 升级版本号
- 修改 `package.json` 中的 `version` 字段为 `"2.3.0"`。
- 运行 `npm install` 同步 `package-lock.json`（可选，若未自动更新可忽略）。

### 2. 更新 README.md
- 用以下内容**覆盖**现有的 `README.md`（注意使用项目实际名称和链接）：

```markdown
# PCConnect - 零门槛屏幕共享

一款基于 OBS + MediaMTX + Cloudflare 免费隧道的屏幕共享工具，**主持人无需注册、无需域名、无需 API Key**，观众只需粘贴链接即可观看。

## ✨ 功能特点
- 🖥️ **屏幕共享**：利用 OBS 强大的采集能力，支持整个屏幕、窗口、游戏画面。
- 🔗 **零门槛分享**：自动生成公网播放链接，发给朋友即可观看，无需任何网络配置。
- 💰 **永久免费**：基于开源组件，无次数限制，无月费。
- 🎨 **多款皮肤**：内置深色和赛博朋克皮肤，一键切换。

## 📥 安装
1. 下载最新安装包：从 [GitHub Releases](https://github.com/MondayV/screen-share/releases) 下载 `PCConnect Setup x.x.x.exe`。
2. 双击安装，勾选“创建桌面快捷方式”。
3. 安装完成后，桌面会出现 `PCConnect` 图标。

## 🚀 使用教程

### 作为主持人（共享你的屏幕）
1. **安装 OBS Studio**：从 [obsproject.com](https://obsproject.com/) 下载并安装 OBS。
2. **启动 PCConnect**，点击 **“开始共享”**。
3. 应用会自动在后台启动 MediaMTX 和 cloudflared 隧道，并显示：
   - **OBS 服务器地址**：`rtmp://localhost:1935`
   - **OBS 串流密钥**：`随机6位密钥`
   - **公网播放链接**：`https://xxx.trycloudflare.com/密钥/index.m3u8`
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

## 🎨 皮肤切换
在 PCConnect 设置中，你可以选择 **深色** 或 **赛博朋克** 两款皮肤，一键切换，立刻生效。

## 🔄 更新日志
### v2.3.0 (2026-05-25)
- 修复安装包缺失 `mediamtx.yml` 导致推流路径拒绝的问题
- 修正 MediaMTX 启动参数，移除无效的 `-c` 前缀
- 修复观众端反复 500 错误
- 优化推流状态指示灯，实时反馈 OBS 连接和推流状态
- 增加观众端停止推流后的友好提示

## 📜 开源协议
MIT License
3. 更新 CHANGELOG.md（如果存在）
若项目根目录存在 CHANGELOG.md，则在其顶部插入 v2.3.0 的条目，内容与上述更新日志一致。

若不存在，可选择不创建，而是在 GitHub Release 的描述中写明。

4. 提交所有更改
bash
git add -A
git commit -m "release: v2.3.0 - 修复安装版推流问题，正式可用，更新文档"
5. 打标签并推送
bash
git tag v2.3.0 -m "v2.3.0 正式稳定版"
git push origin main --tags
6. 重新构建安装包
bash
rm -rf release out
npm run build:win
7. 创建 GitHub Release 并上传安装包
bash
gh release create v2.3.0 \
  --title "v2.3.0 正式稳定版 - 推流路径修复" \
  --notes "🎉 经过多轮测试，安装版已可正常使用！

✨ 新特性
- 零门槛屏幕共享：主持人无需注册、无需域名、无需 API Key
- 观众粘贴链接即可观看，无需任何网络配置
- 内置深色与赛博朋克皮肤，一键切换
- 实时推流状态指示，一目了然

🐛 修复
- 修复安装包缺失 mediamtx.yml 导致推流路径拒绝 (500 错误)
- 修正 MediaMTX 启动参数，确保配置文件正确加载
- 观众端停止推流后友好提示，不再反复重试

📥 下载：PCConnect Setup 2.3.0.exe" \
  release/PCConnect\ Setup\ 2.3.0.exe
8. 输出结果
显示 Release 链接：https://github.com/MondayV/screen-share/releases/tag/v2.3.0

提示用户：README 已更新，安装版可正式分享给朋友使用。