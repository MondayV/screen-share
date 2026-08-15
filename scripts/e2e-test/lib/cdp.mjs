// CDP 调试连接库 —— 通过 Chrome DevTools Protocol 驱动 PCConnect 实例
// 用法: import { connectCDP } from './cdp.mjs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const WebSocket = require('ws')

export async function connectCDP(port, timeoutMs = 15000) {
  const listUrl = `http://127.0.0.1:${port}/json/list`
  const res = await fetch(listUrl)
  if (!res.ok) throw new Error(`CDP ${port} 不可达 (HTTP ${res.status})`)
  const targets = await res.json()
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error(`CDP ${port} 无 page target`)
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString())
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result)
      pending.delete(msg.id)
    }
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP WS 连接超时')), timeoutMs)
    ws.on('open', () => { clearTimeout(timer); resolve() })
    ws.on('error', (e) => { clearTimeout(timer); reject(e) })
  })
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const mid = ++id
      pending.set(mid, resolve)
      ws.send(JSON.stringify({ id: mid, method, params }))
    })
  // 始终以 return 结尾的表达式包装，支持 awaitPromise
  const evalJS = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression: `(async () => { return ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    if (r.exceptionDetails) return { __error: r.exceptionDetails.exception?.description || r.exceptionDetails.text }
    return r.result?.value
  }
  const close = () => { try { ws.close() } catch {} }
  return { ws, evalJS, close, port }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 等待某条件成立（轮询）
export async function waitFor(fn, timeoutMs, intervalMs = 1000, label = '') {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const v = await fn()
    if (v) return { ok: true, elapsed: (Date.now() - t0) / 1000, value: v }
    await sleep(intervalMs)
  }
  return { ok: false, elapsed: (Date.now() - t0) / 1000, value: null }
}

// 点击包含指定文本的按钮
export const clickBtn = (c, text) =>
  c.evalJS(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(${JSON.stringify(text)}))
    if (b) { b.click(); return true }
    return false
  })()`)
