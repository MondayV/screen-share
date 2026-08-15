// 配置加载库 —— 读取 scripts/e2e-test/config.json（不存在则用默认值）
// 用户本机配置请复制 config.example.json 为 config.json 并修改
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

export const DEFAULTS = {
  // 被测应用路径（发布版 exe）
  appPath: 'D:/Edge/PCConnect/PCConnect.exe',
  // OBS WebSocket 密码（与 OBS 设置一致）
  obsPassword: 'THhCJWGWJ3SeI5ps',
  // OBS 显示器采集源名（用于截图验证画面）
  obsDisplaySource: '显示器采集',
  // 实例 A（主持/共享端）CDP 端口
  aPort: 9333,
  // 实例 B（观看端）CDP 端口
  bPort: 9334,
  // 实例 B 的独立用户数据目录（避免与 A 冲突）
  bUserDataDir: 'D:/pc-test-viewer',
  // PotPlayer 播放器路径
  potPlayerPath: 'D:/PotPlayer/PotPlayerMini64.exe',
  // 测试视频路径
  testVideo: 'D:/BaiduNetdiskDownload/奥本海默.mp4',
  // 每档观察秒数
  watchSeconds: 30,
  // 测试档位（逗号分隔）
  modes: 'smooth,smart,clear',
  // 档位目标码率（仅展示用）
  modeBitrates: { smooth: 1200, smart: 3000, clear: 6000 },
}

export function loadConfig() {
  const configPath = join(here, 'config.json')
  if (existsSync(configPath)) {
    try {
      return { ...DEFAULTS, ...JSON.parse(readFileSync(configPath, 'utf8')) }
    } catch (e) {
      console.warn('[config] config.json 解析失败，使用默认值:', e.message)
    }
  }
  return { ...DEFAULTS }
}
