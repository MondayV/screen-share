// 步骤 1: 环境准备 —— 启动 PotPlayer 全屏播放测试视频，验证 OBS 显示器采集画面
// 导出 run() 供 run-test.mjs 调用；也可直接 node steps/01-prepare.mjs 单独执行
import { spawnSync } from 'node:child_process'
import { loadConfig } from '../lib/config.mjs'
import { connectOBS, screenshotSize } from '../lib/obs.mjs'
import { sleep } from '../lib/cdp.mjs'

const cfg = loadConfig()

async function ensurePotPlayer() {
  // 若 PotPlayer 已在运行则跳过（不打断用户正在播放的内容? 不——测试必须播放指定视频）
  const check = spawnSync('powershell', [
    '-NoProfile', '-Command',
    `(Get-Process PotPlayerMini64 -ErrorAction SilentlyContinue | Measure-Object).Count`,
  ], { encoding: 'utf8' })
  const running = parseInt((check.stdout || '0').trim() || '0', 10)
  if (running > 0) {
    console.log('[准备] PotPlayer 已在运行，跳过启动（需确保正在播放测试视频并全屏）')
    return
  }
  console.log('[准备] 启动 PotPlayer 播放测试视频...')
  const r = spawnSync(cfg.potPlayerPath, [cfg.testVideo], { detached: true, stdio: 'ignore' })
  if (r.error) throw new Error(`PotPlayer 启动失败: ${r.error.message}`)
  await sleep(4000)
}

async function maximizePotPlayer() {
  // ShowWindow(SW_MAXIMIZE=3)
  const r = spawnSync('powershell', [
    '-NoProfile', '-Command',
    `$p=Get-Process PotPlayerMini64 -ErrorAction SilentlyContinue | Select-Object -First 1; if($p){$sig='[DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);'; $t=Add-Type -MemberDefinition $sig -Name W2 -Namespace W2 -PassThru; $t::ShowWindow($p.MainWindowHandle,3) | Out-Null; 'maximized'}else{'no-proc'}`,
  ], { encoding: 'utf8' })
  const out = (r.stdout || '').trim()
  if (out !== 'maximized') console.warn('[准备] PotPlayer 窗口最大化失败（不影响测试，若画面非全屏请手动最大化）')
  await sleep(1000)
}

async function verifyObsCapture() {
  let obs = null
  try {
    obs = await connectOBS(cfg.obsPassword)
    const size = await screenshotSize(obs, cfg.obsDisplaySource)
    console.log(`[准备] OBS 显示器采集截图: ${size} 字节`)
    if (size < 20000) {
      console.warn('[准备] 警告: 显示器采集截图过小（可能黑屏）。请确认 PotPlayer 已全屏播放、OBS 场景含显示器采集源且未被遮挡')
    }
  } catch (e) {
    throw new Error(`OBS 连接/截图失败: ${e.message}。请确认 OBS 已启动、WebSocket 端口 4455 已启用且密码正确`)
  } finally {
    if (obs) { try { await obs.disconnect() } catch {} }
  }
}

export async function run() {
  console.log('======== 步骤 1/5: 环境准备 ========')
  await ensurePotPlayer()
  await maximizePotPlayer()
  await verifyObsCapture()
  console.log('[准备] 完成')
}

// 直接执行
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('01-prepare.mjs')) {
  run().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1) })
}
