# 指令：修复安装包缺失 mediamtx.yml 导致的推流拒绝问题

## 问题
打包后的 `resources\tools\` 中没有 `mediamtx.yml`，MediaMTX 使用默认空配置，导致所有推流路径被拒绝。

## 修复步骤
1. 将 `C:\mediamtx\mediamtx.yml`（已确认包含 `all_others: source: publisher`）复制到 `resources/tools/`。
2. 在 `src/main/ipcMainHandlers.ts` 中，确保启动 MediaMTX 时传递配置文件路径（不添加 `-c` 前缀）。
3. 检查 `electron-builder.yml` 的 `extraResources` 是否包含 `*.yml`，若无则添加。
4. 清理并重新构建：`rm -rf release out && npm run build:win` 版本2.2.11
5. 构建成功后，安装新版本，验证推流正常。

## 验收
- 安装目录 `resources\tools\mediamtx.yml` 存在。
- 启动应用后，MediaMTX 日志中显示 `configuration loaded from ...`。
- 观众端不再出现 500 错误。