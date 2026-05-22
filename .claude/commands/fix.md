# 指令：修复 cloudflared shim 文件导致退出，改用真实可执行文件

## 问题
打包后的 `cloudflared.exe` 是 Scoop 的 shim 文件，无法在独立环境中运行，导致进程退出 code 1。

## 修复目标
1. 从 Scoop 的实际安装目录复制真实的 `cloudflared.exe` 到 `resources/tools/`。
2. 确保 MediaMTX 也是真实的可执行文件（通常没问题，但一并验证）。
3. 增加构建脚本中的文件检查，防止未来再次打包 shim。
4. 重新构建并发布 v2.2.7。

## 执行步骤

### 1. 定位真实的 cloudflared.exe
- 在开发机上执行 `where cloudflared` 得到 shim 路径（如 `C:\Users\MONv\scoop\shims\cloudflared.exe`）。
- 通过查看该 shim 文件的大小（通常只有几百 KB）或执行 `scoop which cloudflared` 找到真实路径。
- 真实路径一般为 `C:\Users\MONv\scoop\apps\cloudflared\current\cloudflared.exe`。
- **如果找不到**，可直接从 [cloudflared GitHub Release](https://github.com/cloudflare/cloudflared/releases/latest) 下载 `cloudflared-windows-amd64.exe`，重命名为 `cloudflared.exe` 并放到 `resources/tools/`。

### 2. 更新 `resources/tools/cloudflared.exe`
- 删除现有的 `resources/tools/cloudflared.exe`。
- 将真实的 `cloudflared.exe`（约 20-30 MB）复制到 `resources/tools/`。
- 验证文件大小应在 20 MB 以上，如果小于 1 MB，说明仍然是 shim。

### 3. 更新打包配置（可选）
- 在 `electron-builder.yml` 中添加文件大小检查（构建时报警），但不强制。

### 4. 重新构建并发布
- 清理：`rm -rf release out`
- 构建：`npm run build:win`
- 确认 `release/win-unpacked/resources/tools/cloudflared.exe` 大小正确。
- 升级版本号：修改 `package.json` 的 `version` 为 `2.2.7`。
- 提交并发布：
```bash
git add -A && git commit -m "fix: 替换cloudflared为真实可执行文件，修复shim错误，发布v2.2.7"
git tag v2.2.7 -m "v2.2.7 修复cloudflared shim问题"
git push origin main --tags
gh release create v2.2.7 release/PCConnect\ Setup\ 2.2.7.exe --title "v2.2.7 修复cloudflared启动错误" --notes "**紧急修复**：因打包了Scoop的shim文件导致cloudflared无法运行。现已替换为真实可执行文件，请更新。"
验收标准
安装 v2.2.7 后，点击“开始共享”，不再报 shim 错误，隧道能正常启动并获得公网链接。

 在 `README` 中添加开发提醒：打包依赖时，从实际安装目录复制二进制文件，不要从系统 `shims` 目录。
- 如果未来依赖有更新，直接去 GitHub 下载官方 Release 文件，而不依赖本地 Scoop 安装。
