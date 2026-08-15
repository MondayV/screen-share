// 步骤 2: 启动 A/B 两个 PCConnect 实例并等待 CDP 端口就绪
import { spawn, execSync } from 'node:child_process'
import { loadConfig } from '../lib/config.mjs'
import { connectCDP, sleep } from '../lib/cdp.mjs'

const cfg = loadConfig()

async function isCDPReady(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`)
    return res.ok
  } catch { return false }
}

// 启动单个实例；返回是否新启动
function startInstance(port, extraArgs = []) {
  const args = [`--remote-debugging-port=${port}`, ...extraArgs]
  spawn(cfg.appPath, args, { detached: true, stdio: 'ignore', windowsHide: false }).unref()
}

export async function run() {
  console.log('======== 步骤 2/5: 启动 A/B 实例 ========')
  // 清理可能残留的同端口 CDP 进程（旧会话）
  for (const port of [cfg.aPort, cfg.bPort]) {
    if (await isCDPReady(port)) {
      console.log(`[启动] 端口 ${port} 已有实例在运行，复用（如需全新会话请先关闭）`)
    }
  }
  if (!(await isCDPReady(cfg.aPort))) {
    console.log(`[启动] 启动实例 A (CDP ${cfg.aPort})...`)
    startInstance(cfg.aPort)
  }
  if (!(await isCDPReady(cfg.bPort))) {
    console.log(`[启动] 启动实例 B (CDP ${cfg.bPort}, user-data-dir=${cfg.bUserDataDir})...`)
    startInstance(cfg.bPort, [`--user-data-dir=${cfg.bUserDataDir}`])
  }
  // 等待两个 CDP 均就绪（最多 60s）
  for (let i = 0; i < 20; i++) {
    const aOk = await isCDPReady(cfg.aPort)
    const bOk = await isCDPReady(cfg.bPort)
    if (aOk && bOk) {
      console.log('[启动] A、B 实例就绪')
      return
    }
    await sleep(3000)
  }
  throw new Error('实例启动超时（60s），请检查 appPath 与端口占用')
}

if (process.argv[1]?.endsWith('02-instances.mjs')) {
  run().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1) })
}
