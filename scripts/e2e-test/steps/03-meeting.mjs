// 步骤 3: A 创建会议 → 输出会议链接 → B 加入会议
// 注意: B 加入后不会自动播放，需在步骤 4 点击共享列表项（已知问题 #K3）
import { loadConfig } from '../lib/config.mjs'
import { connectCDP, sleep, waitFor, clickBtn } from '../lib/cdp.mjs'

const cfg = loadConfig()

async function aCreateMeeting(a) {
  // 若已在会议视图则先退出
  const inMeeting = await a.evalJS(`document.body.innerText.includes('参会人')`)
  if (inMeeting) {
    await clickBtn(a, '退出会议')
    await sleep(1200)
    await a.evalJS(`(() => { const b = [...document.querySelectorAll('.swal2-confirm')].find(x => x.textContent.includes('退出')); if (b) { b.click(); return true } return false })()`)
    await sleep(1500)
  }
  const clicked = await clickBtn(a, '创建会议')
  if (!clicked) throw new Error('未找到"创建会议"按钮')
  // 等待会议视图 + 链接（最多 60s；云隧道建立可能需要时间）
  const r = await waitFor(async () => {
    const st = await a.evalJS(`(() => {
      const m = document.querySelector('.is-family-monospace')
      return { inMeeting: document.body.innerText.includes('参会人'), link: m ? m.textContent.trim() : null, err: document.body.innerText.includes('创建会议失败') }
    })()`)
    if (st.err) throw new Error('A 端创建会议失败（房间服务/隧道异常）')
    return st.inMeeting && st.link && st.link.includes('trycloudflare.com/room/') ? st.link : null
  }, 60000, 3000, '会议创建')
  if (!r.ok) throw new Error('会议创建超时（60s）')
  console.log(`[会议] A 创建会议成功: ${r.value}`)
  return r.value
}

async function bJoinMeeting(b, link) {
  const filled = await b.evalJS(`(() => {
    const inputs = [...document.querySelectorAll('input[type="text"]')]
    const input = inputs.find(i => (i.placeholder || '').includes('trycloudflare')) || inputs[inputs.length - 1]
    if (!input) return false
    input.value = ${JSON.stringify(link)}
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  if (!filled) throw new Error('B 端未找到会议链接输入框')
  await sleep(800)
  const clicked = await clickBtn(b, '加入会议')
  if (!clicked) throw new Error('B 端未找到"加入会议"按钮')
  const r = await waitFor(async () => {
    const inMeeting = await b.evalJS(`document.body.innerText.includes('参会人')`)
    const connected = await b.evalJS(`document.body.innerText.includes('已连接')`)
    return inMeeting && connected
  }, 30000, 2000, 'B 加入会议')
  if (!r.ok) throw new Error('B 加入会议超时（30s，可能是隧道域名访问不稳）')
  console.log(`[会议] B 加入会议成功 (${r.elapsed}s)`)
}

export async function run() {
  console.log('======== 步骤 3/5: 创建会议并加入 ========')
  const a = await connectCDP(cfg.aPort)
  const b = await connectCDP(cfg.bPort)
  try {
    const link = await aCreateMeeting(a)
    await bJoinMeeting(b, link)
    return link
  } finally {
    a.close(); b.close()
  }
}

if (process.argv[1]?.endsWith('03-meeting.mjs')) {
  run().then((l) => { console.log('LINK:', l); process.exit(0) }).catch((e) => { console.error(e.message); process.exit(1) })
}
