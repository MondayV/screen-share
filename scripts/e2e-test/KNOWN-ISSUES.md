# PCConnect 测试已知问题与解决方案清单

> 本文档收录标准化测试流程中遇到的所有报错/异常、根因分析与解决方案。
> 每次版本测试遇到新问题时，追加到本清单（编号递增），并在修复后标注状态。

## 问题状态说明
- ✅ 已解决：已有规避方案或已修复
- 🔄 观察中：有规避方案但根因未完全消除
- ❌ 未解决：无方案，需人工介入

---

## K1. OBS 窗口采集 PotPlayer 画面黑屏
**状态**: ✅ 已解决（改用显示器采集）

**现象**: 通过 OBS WebSocket `CreateInput` 创建 window_capture 源采集 PotPlayer 窗口，`GetSourceScreenshot` 仅返回约 620 字节（纯黑），而显示器采集返回 100KB+ 正常。

**根因**: PotPlayer 播放使用 DXVA 硬件渲染（GPU 表面），OBS 窗口采集基于 GDI 抓取窗口内容，无法获取硬件加速渲染画面（OBS 已知限制）。

**解决**: 测试改用**显示器采集 + PotPlayer 全屏播放**。全屏后显示器采集画面即电影画面，效果等同窗口采集且画面纯净。

**注意事项**:
- 窗口匹配参数 `PotPlayerMini64.exe:标题` 与 `PotPlayerMini64.exe:类名:标题` 均无法解决黑屏（非匹配问题）
- 实测显示器采集截图 176KB（640×360 PNG）画面正常
- 若将来 OBS 窗口采集支持硬件加速窗口（DXGI），可重新评估

---

## K2. obs-websocket-js 5.0.8 请求集受限
**状态**: ✅ 已解决（使用支持的请求子集）

**现象**: 调用 `ReorderSceneItem` 报 `Your request type is not valid`。

**根因**: obs-websocket-js 5.0.8 仅封装部分请求。已验证支持: `GetStreamStatus` / `GetStreamServiceSettings` / `SetStreamServiceSettings` / `StartStream` / `StopStream` / `GetOutputStatus` / `GetStats` / `GetSceneList` / `GetInputList` / `GetSourceSettings` / `GetSourceScreenshot` / `CreateInput` / `RemoveInput`。

**不支持**: `CreateSource`（应为 `CreateInput`）、`SetInputSettings`、`GetEncoderSettings`、`GetOutputEncoderSettings`、`GetRequestList`、`ReorderSceneItem`。

**解决**: 测试脚本仅使用支持子集；场景项顺序调整改为手动确认（或删除重建源）。

---

## K3. B（观看端）加入会议后不自动播放
**状态**: ✅ 已解决（测试脚本增加选择共享步骤）

**现象**: 首次测试中 B 端所有采样 `w:0, rs:0, paused:true`，`joinFrame` 恒为 30s（超时值），behind 全部为 null——B 从未开始观看。

**根因**: 产品设计为"从左侧列表选择一路共享开始观看"，B 加入会议后需**手动点击共享列表项**才会 attachMedia 播放；测试脚本缺此步骤。

**解决**: 测试脚本 `04-run-modes.mjs` 在等待 B 画面出现前，先点击共享列表中的项（选择不含"（我）"的共享按钮）。修复后 B 画面出现时间 5-6s 正常。

**产品建议（可选）**: 会议内仅一路共享时，可考虑自动选中播放，减少用户操作。

---

## K4. 码率采样 GetStats 无 bytesSent
**状态**: ✅ 已解决（改用 GetOutputStatus 字节增量）

**现象**: 需实测推流码率，但 `GetStats` 返回值无发送字节数。

**根因**: obs-websocket-js 5.0.8 的 `GetStats` 映射不含 `bytesSent` 字段。

**解决**: 用 `GetOutputStatus({ outputName: 'adv_stream' })` 的 `outputBytes` 差值除以采样间隔（5s）计算 kbps。实测与目标码率吻合（1200→1375、3000→3184、6000→6155 kbps，CBR + 少量协议开销）。

---

## K5. 管理员权限进程无法用 Stop-Process 关闭
**状态**: ✅ 已解决（UAC 提权 taskkill）

**现象**: `Stop-Process obs64 -Force` 报 `Access is denied`；`taskkill /F /IM obs64.exe` 同样被拒。

**根因**: OBS 以管理员权限运行，普通权限进程无法结束。

**解决**: `Start-Process taskkill.exe -ArgumentList '/F','/IM','obs64.exe' -Verb RunAs -Wait` 触发 UAC 提权后成功关闭。已封装进 `05-cleanup.mjs`。

---

## K6. 同机 hairpin 访问云隧道域名不稳定
**状态**: 🔄 观察中（测试环境特有，真实多机不受影响）

**现象**: 本机（A/B 同机）访问 trycloudflare 随机隧道域名间歇性不可达（HTTP 000/530），房间服务 `POST /api/share` 偶发 `Failed to fetch`，HLS m3u8 偶发 000。

**根因**: NAT hairpin（回环访问自己发布的公网隧道）在部分网络环境下不稳定；DNS 解析随机域名也偶发失败。

**影响**: 测试观测到的 behind 均值 5.8-6.9s（同机绕行公网），真实跨机器局域网预计 ~3s 级。同机测试中若遇到隧道访问失败，重建会议重试即可。

**缓解**: 房间 API 调用已有 3 次重试；测试脚本对关键等待设置 60s 超时并允许重跑。

---

## K7. 启动延迟历史优化记录（非本次测试问题）
**状态**: ✅ 已解决（v2.6.0）

- **OBS keyframe 间隔导致 HLS 生成慢**: 默认 keyint 5-10s → 写 `streamEncoder.json` 设 `keyint_sec:1`，HLS 生成 10.5s → 3.6s。**该值为关键延迟修复，质量模式切换时必须保持 1s。**
- **串行启动慢**: OBS 启动、隧道建立、MediaMTX 预热改为并行 + `warmupMedia`，共享启动延迟 25s → 13s → 8.4s。
- **实测各档启动延迟**: smooth 8.1s / smart 8.1s / clear 9.1s（流到达），B 端画面出现 5-6s。

---

## 测试结论参考基线（2026-08-15 首次标准化测试, v2.6.0）

| 档位 | 流到达 | B画面 | behind均值 | 停滞 | 实际码率 |
|------|--------|-------|-----------|------|----------|
| smooth | 8.09s | 6.07s | 6.9s | 0 | 1375 kbps |
| smart | 8.08s | 5.07s | 6.2s | 0 | 3184 kbps |
| clear | 9.11s | 6.08s | 5.8s | 1 | 6155 kbps |

判定基线（建议）:
- 启动延迟（流到达）≤ 15s
- B 端画面出现 ≤ 15s
- 停滞：smooth/smart = 0 次，clear ≤ 2 次
- 码率偏差 ≤ ±20%（CBR 特性）
