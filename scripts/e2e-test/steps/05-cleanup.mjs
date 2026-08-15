// 步骤 5: 清理环境 —— 退出会议 → 关闭 A/B 实例 → 关闭 OBS → 关闭 PotPlayer
// 用户要求: 测试结束后一并关闭 PotPlayer 播放器
import { spawnSync } from 'node:child_process'
import { loadConfig } from '../lib/config.mjs'
import { connectCDP, sleep, clickBtn } from '../lib/cdp.mjs'

const cfg = loadConfig()

async function exitInstance(port) {
  let c = null
  try {
    c = await connectCDP(port)
    // 停止共享（若在共享）
    await clickBtn(c, '停止共享')
    await sleep(2000)
    // 退出会议
    const exit = await clickBtn(c, '退出会议')
    if (exit) {
      await sleep(1200)
      await c.evalJS(`(() => { const b = [...document.querySelectorAll('.swal2-confirm')].find(x => x.textContent.includes('退出')); if (b) { b.click(); return true } return false })()`)
      await sleep(1500)
    }
    // 关闭窗口（触发 before-quit → stopAllProcesses 清理 mediamtx/cloudflared）
    await c.evalJS(`window.close()`)
    await sleep(1500)
    return true
  } catch (e) {
    console.warn(`[清理] 端口 ${port} 实例无法通过 CDP 关闭: ${e.message}`)
    return false
  } finally {
    if (c) c.close()
  }
}

function killByImage(image) {
  const r = spawnSync('taskkill', ['/F', '/IM', image], { encoding: 'utf8' })
  return (r.stdout || '').includes('SUCCESS') || (r.stdout || '').includes('成功')
}

export async function run() {
  console.log('======== 步骤 5/5: 清理环境 ========')
  // 1. 优雅退出 A/B（触发 stopAllProcesses）
  await exitInstance(cfg.aPort)
  await exitInstance(cfg.bPort)
  await sleep(2000)

  // 2. 兜底：确保 PCConnect 全家桶退出
  spawnSync('taskkill', ['/F', '/IM', 'PCConnect.exe'], { encoding: 'utf8' })
  spawnSync('taskkill', ['/F', '/IM', 'mediamtx.exe'], { encoding: 'utf8' })
  spawnSync('taskkill', ['/F', '/IM', 'cloudflared.exe'], { encoding: 'utf8' })

  // 3. 关闭 OBS（管理员权限需 UAC 提权）
  const obsKilled = killByImage('obs64.exe')
  if (!obsKilled) {
    console.log('[清理] OBS 需管理员权限，尝试 UAC 提权...')
    try {
      spawnSync('powershell', ['-NoProfile', '-Command',
        `Start-Process taskkill.exe -ArgumentList '/F','/IM','obs64.exe' -Verb RunAs -Wait`],
        { encoding: 'utf8', timeout: 60000 })
    } catch (e) {
      console.warn('[清理] OBS 提权关闭失败，请手动关闭:', e.message)
    }
  }

  // 4. 关闭 PotPlayer（用户要求测试后一并关闭）
  const ppKilled = killByImage('PotPlayerMini64.exe')
  console.log(ppKilled ? '[清理] PotPlayer 已关闭' : '[清理] PotPlayer 未运行或已关闭')

  // 5. 验证
  await sleep(2000)
  const check = spawnSync('powershell', ['-NoProfile', '-Command',
    `(Get-Process PCConnect,mediamtx,cloudflared,obs64,PotPlayerMini64 -ErrorAction SilentlyContinue | Select-Object ProcessName,Id | Format-Table -AutoSize | Out-String).Trim()`],
    { encoding: 'utf8' })
  const remaining = (check.stdout || '').trim()
  console.log(remaining ? `[清理] 剩余进程:\n${remaining}` : '[清理] 所有测试相关进程已退出')
  console.log('[清理] 完成')
}

if (process.argv[1]?.endsWith('05-cleanup.mjs')) {
  run().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1) })
}
