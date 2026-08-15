// PCConnect 标准化测试入口 —— 一键执行完整回归测试
// 用法: node scripts/e2e-test/run-test.mjs [--mode smooth,smart,clear] [--watch 30] [--no-cleanup]
//   --mode      覆盖档位列表（默认取 config.json 的 modes）
//   --watch     覆盖每档观察秒数（默认 30）
//   --no-cleanup 测试后不自动清理（调试用）
//   --skip-prepare 跳过环境准备（PotPlayer/OBS 已就绪时）
// 说明: 首次使用请先复制 config.example.json 为 config.json 并按本机环境修改
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from './lib/config.mjs'
import { run as prepare } from './steps/01-prepare.mjs'
import { run as startInstances } from './steps/02-instances.mjs'
import { run as meeting } from './steps/03-meeting.mjs'
import { run as runModes } from './steps/04-run-modes.mjs'
import { run as cleanup } from './steps/05-cleanup.mjs'

const cfg = loadConfig()
const here = dirname(fileURLToPath(import.meta.url))

// 解析命令行
const args = process.argv.slice(2)
const argVal = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null }
const modes = argVal('--mode') || cfg.modes
const watch = Number(argVal('--watch') || cfg.watchSeconds)
const noCleanup = args.includes('--no-cleanup')
const skipPrepare = args.includes('--skip-prepare')

const reportDir = join(here, 'reports')
if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true })
const reportPath = join(reportDir, `report-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`)

async function main() {
  console.log(`===== PCConnect 标准化回归测试 =====`)
  console.log(`被测应用: ${cfg.appPath}`)
  console.log(`档位: ${modes} | 观察: ${watch}s | 视频: ${cfg.testVideo}`)
  const t0 = Date.now()

  try {
    if (!skipPrepare) await prepare()
    await startInstances()
    await meeting()

    const results = await runModes({ modes, watchSeconds: watch })
    writeFileSync(reportPath, JSON.stringify({ cfg: { modes, watch }, results, ts: new Date().toISOString() }, null, 2))

    // 判定
    const ok = results.every((r) => r.start != null && r.joinFrame != null)
    console.log(`\n===== 判定: ${ok ? '✅ 通过' : '❌ 失败/需复查'} =====`)
    console.log(`报告已保存: ${reportPath}`)

    if (noCleanup) {
      console.log('[--no-cleanup] 跳过清理，环境保留')
    } else {
      await cleanup()
    }
    console.log(`总耗时: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    process.exit(ok ? 0 : 2)
  } catch (e) {
    console.error('\n[测试中止]', e.message)
    if (!noCleanup) {
      console.log('尝试清理...')
      try { await cleanup() } catch {}
    }
    process.exit(1)
  }
}

main()
