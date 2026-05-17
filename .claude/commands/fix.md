# 指令：自动发布安装包到 GitHub Release

## 目标
1. 提交所有本地修改
2. 打版本标签 `v1.0.1`
3. 推送代码和标签到远程仓库
4. 创建 GitHub Release 并上传安装包 `release/pc-connect-1.0.1-setup.exe`

## 执行步骤（AI 自动完成）

### 1. 检查构建产物
- 确认 `release/pc-connect-1.0.1-setup.exe` 存在。
- 若不存在，提示先运行 `npm run build:win`。

### 2. 提交代码
- 运行 `git add -A`
- 运行 `git commit -m "release: v1.0.1 正式版"`

### 3. 打标签
- 运行 `git tag v1.0.1 -m "v1.0.1 正式版"`

### 4. 推送
- 运行 `git push origin dev/v1.0.1 --tags`
- （如果分支名不同，AI 需根据当前分支调整）

### 5. 创建 GitHub Release
- 使用 `gh release create` 命令：
```bash
gh release create v1.0.1 \
  --title "v1.0.1 正式版 - 稳定屏幕共享" \
  --notes "🎉 首个正式版发布

✨ 新特性
- 屏幕共享（支持选择单个窗口）
- 语音通话（麦克风开关）
- 6位连接码，异地免费连接
- 简洁安装与卸载流程

🐛 修复
- 修复发行版无法连接信令的问题
- 修复窗口共享失败回退全屏的问题
- 移除摄像头相关误触发

📥 下载安装包：PCConnect Setup 1.0.1.exe" \
  release/pc-connect-1.0.1-setup.exe
如果 gh 未登录，提示用户先执行 gh auth login。

6. 输出结果
显示 Release 链接：https://github.com/MondayV/screen-share/releases/tag/v1.0.1

提示用户可以下载安装包测试。