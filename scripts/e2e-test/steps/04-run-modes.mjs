// 步骤 4: 核心测试执行器 —— 逐档切换画质 → 重启共享 → B 观看 → 采样统计
// 复用自 pc-test/meeting-test.mjs 的经验（含 B 端需手动点击共享项的修复 #K3）
import { loadConfig } from '../lib/config.mjs'
import { connectCDP, sleep, waitFor, clickBtn } from '../lib/cdp.mjs'
import { connectOBS, createBitrateSampler } from '../lib/obs.mjs'

const cfg = loadConfig()

const aVideo = (a) => a.evalJS(`(()=>{const v=document.querySelector('video');return v?{ct:Math.round(v.currentTime*10)/10,behind:v.duration?Math.round((v.duration-v.currentTime)*10)/10:null,w:v.videoWidth,rs:v.readyState,paused:v.paused}:{nv:1}})()`)
const bVideo = (b) => b.evalJS(`(()=>{const v=document.querySelector('video');return v?{ct:Math.round(v.currentTime*10)/10,behind:v.duration?Math.round((v.duration-v.currentTime)*10)/10:null,w:v.videoWidth,rs:v.readyState,paused:v.paused}:{nv:1}})()`)
const bIsWatching = (b) => (async () => { const v = await bVideo(b); return v.w > 0 && v.rs >= 2 })()
const aInMeeting = (a) => a.evalJS(`document.body.innerText.includes('参会人')`)
const aIsSharing = (a) => a.evalJS(`document.body.innerText.includes('停止共享')`)
const aStreamArrived = (a) => (async () => { const t = await a.evalJS(`document.body.innerText.includes('流到达')`); return t === true })()

const setQuality = (c, mode) => c.evalJS(`(()=>{const sel=document.querySelector('select');if(!sel)return false;sel.value=${JSON.stringify(mode)};sel.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)

// B 端点击共享列表项（不含"（我）"的按钮）—— 加入会议后必须手动选择共享源
async function bPickShare(b) {
  const r = await b.evalJS(`(() => {
    const btns = [...document.querySelectorAll('button')].filter(x => x.className.includes('is-fullwidth') && x.className.includes('mb-2') && x.textContent.trim().length > 0)
    const mine = btns.find(x => x.textContent.includes('（我）'))
    const target = mine ? btns.find(x => x !== mine) : btns[0]
    if (!target) return false
    target.click()
    return true
  })()`)
  return r === true
}

export async function run({ modes, watchSeconds } = {}) {
  const modeList = (modes || cfg.modes).split(',')
  const watchSec = watchSeconds || cfg.watchSeconds
  console.log(`======== 步骤 4/5: 核心测试 (档位 ${modeList.join(',')}, 观察 ${watchSec}s) ========`)

  const a = await connectCDP(cfg.aPort)
  const b = await connectCDP(cfg.bPort)
  let obs = null
  try {
    if (!(await aInMeeting(a))) throw new Error('A 不在会议视图，请先运行步骤 3')
    try { obs = await connectOBS(cfg.obsPassword); console.log('[OBS] 已连接（码率采样）') }
    catch (e) { console.warn('[OBS] 连接失败（码率将缺失）:', e.message) }

    const results = []
    for (const mode of modeList) {
      console.log(`\n===== 档位: ${mode} =====`)
      const rec = { mode, start: 0, pick: 0, joinFrame: 0, samples: [], stalls: 0, behindAvg: null, behindMin: null, behindMax: null, bitrateAvg: null }

      // 1. 切画质（下次共享生效）
      await setQuality(a, mode)
      await sleep(1500)

      // 2. 若在共享则停止
      if (await aIsSharing(a)) {
        await clickBtn(a, '停止共享')
        await waitFor(async () => !(await aIsSharing(a)), 15000, 1000, '停止共享')
        await sleep(2000)
      }

      // 3. 开始共享 → 测启动延迟
      const t0 = Date.now()
      await clickBtn(a, '开始共享')
      const arrival = await waitFor(aStreamArrived(a), 40000, 1000, '流到达')
      rec.start = arrival.elapsed
      if (!arrival.ok) { console.warn(`[${mode}] 流到达超时`); results.push(rec); continue }
      console.log(`[${mode}] 流到达: ${arrival.elapsed}s`)
      await sleep(3000)

      // 4. B 选择共享项 + 等画面
      const tf0 = Date.now()
      const picked = await waitFor(() => bPickShare(b), 20000, 1000, 'B 选择共享')
      rec.pick = picked.elapsed
      if (!picked.ok) { console.warn(`[${mode}] B 未找到共享项`); results.push(rec); await sleep(3000); continue }
      const watching = await waitFor(() => bIsWatching(b), 30000, 1000, 'B 观看')
      rec.joinFrame = (Date.now() - tf0) / 1000
      if (!watching.ok) { console.warn(`[${mode}] B 画面未出现（30s 超时）`); results.push(rec); await sleep(3000); continue }
      console.log(`[${mode}] B 端画面出现: ${rec.joinFrame}s`)

      // 5. 观察期采样
      const sampler = obs ? createBitrateSampler(obs, 5000) : null
      const sampleTimer = setInterval(async () => {
        const v = await bVideo(b)
        rec.samples.push({ t: (Date.now() - t0) / 1000, ...v })
      }, 2000)
      await sleep(watchSec * 1000)
      clearInterval(sampleTimer)
      if (sampler) sampler.stop()

      // 6. 汇总
      const ctSeq = rec.samples.filter((s) => typeof s.ct === 'number')
      for (let i = 1; i < ctSeq.length; i++) {
        if (ctSeq[i].ct - ctSeq[i - 1].ct < 0.4 && ctSeq[i].ct > 0) rec.stalls++
      }
      const behinds = rec.samples.filter((s) => typeof s.behind === 'number').map((s) => s.behind)
      rec.behindAvg = behinds.length ? Math.round((behinds.reduce((x, y) => x + y, 0) / behinds.length) * 10) / 10 : null
      rec.behindMin = behinds.length ? Math.min(...behinds) : null
      rec.behindMax = behinds.length ? Math.max(...behinds) : null
      rec.bitrateAvg = sampler ? sampler.avg() : null
      console.log(`[${mode}] behind 均=${rec.behindAvg}s(min=${rec.behindMin},max=${rec.behindMax}) 停滞=${rec.stalls}次 码率≈${rec.bitrateAvg}kbps`)

      results.push(rec)

      // 7. 停共享准备下一档
      if (await aIsSharing(a)) { await clickBtn(a, '停止共享'); await sleep(3000) }
    }

    // ---------- 汇总 ----------
    console.log('\n========== 测试汇总 ==========')
    console.log(JSON.stringify(results, null, 2))
    console.log('\n档位对比:')
    for (const r of results) {
      console.log(`  ${r.mode.padEnd(7)}: 启动${r.start?.toFixed(2)}s | B画面${r.joinFrame?.toFixed(2)}s | behind 均${r.behindAvg}s(min ${r.behindMin}) | 停滞${r.stalls}次 | 码率≈${r.bitrateAvg}kbps`)
    }
    return results
  } finally {
    if (obs) { try { await obs.disconnect() } catch {} }
    a.close(); b.close()
  }
}

if (process.argv[1]?.endsWith('04-run-modes.mjs')) {
  run().then((r) => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1) })
}
