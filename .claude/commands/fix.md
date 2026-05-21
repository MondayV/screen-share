# 指令：修复观众方 CSP 阻止 HLS 流加载的问题

## 问题
观众方无法播放 HLS 流，控制台报错：
- `Refused to connect to 'https://...trycloudflare.com/...' because it violates CSP directive: "connect-src ..."`
- `Refused to load media from 'blob:...' because it violates CSP directive: "default-src 'self'"`

## 根本原因
`src/renderer/index.html` 的 `<meta>` 标签中：
1. `connect-src` 缺少 `https://*.trycloudflare.com`
2. 未设置 `media-src`，导致 `blob:` 视频分片被 `default-src 'self'` 阻止

## 修复步骤

### 1. 更新 CSP 元标签
在 `src/renderer/index.html` 中找到 `<meta http-equiv="Content-Security-Policy" ...>`，修改为包含以下内容：

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self' ws: wss: https://*.workers.dev https://*.trycloudflare.com;
  media-src 'self' blob: https://*.trycloudflare.com;
">
2. 确保修改生效
保存文件

清理构建：rm -rf release out

重新构建：npm run build:win

3. 验证
主持方启动共享

观众方输入链接观看

控制台不再出现 CSP 相关错误

视频正常播放

注意事项
如果项目中有其他地方动态注入 CSP（如主进程 webRequest.onHeadersReceived），请一并修改，确保最终生效。

保存后执行 rm -rf release out && npm run build:win，安装新版本测试即可。

