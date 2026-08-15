# PCConnect 标准化回归测试流程

> 每个版本发布前必须执行本测试。自动化脚本 + 人工观察双轨并行。
> 测试目标：验证屏幕共享链路的**启动延迟、观看延迟、播放稳定性、三档画质码率**是否符合基线。

## 一、测试环境要求

| 项 | 要求 |
|----|------|
| 操作系统 | Windows（本机为 Windows） |
| OBS Studio | 已安装，WebSocket 服务开启（默认端口 4455），**高级输出模式** |
| OBS 场景 | 含"显示器采集"源（测试共享源，见已知问题 K1） |
| 播放器 | PotPlayer（`PotPlayerMini64.exe`），用于播放测试视频 |
| 测试视频 | 高码率电影（如《奥本海默》1080p，测试用 30s × 3 档） |
| 被测应用 | 发布版 PCConnect.exe（每版本打包后测试） |
| 网络 | 两台机器跨机测试为佳；同机 hairpin 亦可（延迟基线偏高，见 K6） |

## 二、首次使用：配置

```bash
# 进入测试目录
cd scripts/e2e-test

# 复制配置模板并按本机环境修改
copy config.example.json config.json
```

`config.json` 关键项：
- `appPath`: 被测 PCConnect.exe 路径
- `obsPassword`: OBS WebSocket 密码
- `obsDisplaySource`: OBS 显示器采集源名（默认"显示器采集"）
- `aPort` / `bPort`: A/B 实例 CDP 调试端口
- `potPlayerPath` / `testVideo`: 播放器与测试视频路径
- `watchSeconds`: 每档观察秒数（默认 30）
- `modes`: 测试档位（默认 smooth,smart,clear）

> `config.json` 已加入 .gitignore，不入库；`config.example.json` 为模板。

## 三、执行测试（一键）

```bash
node scripts/e2e-test/run-test.mjs
```

自动完成 5 步：
1. **环境准备** — 启动 PotPlayer 全屏播放测试视频；验证 OBS 显示器采集画面非黑屏
2. **启动实例** — 启动 A（CDP aPort）/ B（CDP bPort，独立 user-data-dir），等待就绪
3. **会议** — A 创建会议 → 自动复制链接 → B 加入会议（等待"已连接"）
4. **核心测试** — 逐档切换画质 → 重启共享 → B 选择共享项观看 → 观察 N 秒 → 采样统计
5. **清理** — A/B 退出会议并关闭（触发 stopAllProcesses）→ 关闭 OBS → **关闭 PotPlayer**（用户要求测试后一并关闭）

### 常用参数

```bash
# 只跑 30s、指定档位
node scripts/e2e-test/run-test.mjs --mode smooth,clear --watch 30

# 调试：测试后不清理环境
node scripts/e2e-test/run-test.mjs --no-cleanup

# 环境已就绪时跳过准备步骤
node scripts/e2e-test/run-test.mjs --skip-prepare
```

### 分步执行（定位问题时用）

```bash
node scripts/e2e-test/steps/01-prepare.mjs     # 仅准备
node scripts/e2e-test/steps/02-instances.mjs   # 仅启动实例
node scripts/e2e-test/steps/03-meeting.mjs     # 仅创建/加入会议
node scripts/e2e-test/steps/04-run-modes.mjs   # 仅跑核心测试
node scripts/e2e-test/steps/05-cleanup.mjs     # 仅清理
```

## 四、结果判定基线

测试报告自动保存至 `scripts/e2e-test/reports/report-<时间戳>.json`，并打印汇总。

| 指标 | 基线（通过条件） | 实测参考（v2.6.0 首次测试） |
|------|------------------|------------------------------|
| 启动延迟（流到达） | ≤ 15s | 8.1–9.1s |
| B 端画面出现 | ≤ 15s | 5.1–6.1s |
| 停滞次数 | smooth/smart = 0；clear ≤ 2 | 0 / 0 / 1 |
| 码率偏差 | ≤ ±20% | 1375 / 3184 / 6155 kbps |
| behind 均值 | 跨机 ≤ 5s；同机 hairpin ≤ 8s | 同机 5.8–6.9s |

**判定规则**:
- 码率三档必须区分明显（smooth < smart < clear 且各自落在目标 ±20% 内）
- 停滞次数超基线或流到达超 15s → 测试失败，记录问题到 KNOWN-ISSUES.md 后修复
- 同机 hairpin 的 behind 偏高的不判失败，但须在报告中注明环境

## 五、测试报告归档

- 每次测试的 JSON 报告：`scripts/e2e-test/reports/`
- 人工观察补充（画面流畅度主观感受、音画同步等）建议记录在版本发布说明中
- 遇到的新问题：追加到 `KNOWN-ISSUES.md`（编号 K8+），修复后在下一个版本测试中回归验证

## 六、人工观察检查表（脚本之外）

- [ ] 共享画面清晰度与码率档位匹配（smooth 明显模糊 / clear 清晰）
- [ ] 切换档位后重启共享，B 端正常重连观看
- [ ] 无音画不同步（如测试含音频源）
- [ ] 会议中两人同时在场（roster 显示正常）
- [ ] 退出会议后进程清理干净（mediamtx / cloudflared 无残留）
- [ ] PotPlayer 已被自动关闭（步骤 5）

## 七、已知问题与解决方案

详见 [KNOWN-ISSUES.md](./KNOWN-ISSUES.md)（当前收录 K1–K7，含本次测试发现的黑屏采集、B 端不自动播放等问题的根因与处理）。
