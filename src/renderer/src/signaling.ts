import { writable, get } from 'svelte/store'

export type SignalingState = 'connecting' | 'connected' | 'error'

export const signalingState = writable<SignalingState>('connecting')

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectCount = 0
const MAX_RETRIES = 5
let messageHandlers: Map<string, (data: any) => void> = new Map()
const signalPort = 3456
const fallbackUrl: string = `ws://localhost:${signalPort}`
let serverUrl: string = fallbackUrl
let triedFallback = false

export function setSignalingUrl(url: string) {
  serverUrl = url.replace(/^http/, 'ws')
  triedFallback = false
  reconnectCount = 0
}

export function getWs(): WebSocket | null {
  return ws
}

export function onSignalMessage(type: string, handler: (data: any) => void) {
  messageHandlers.set(type, handler)
}

export function offSignalMessage(type: string) {
  messageHandlers.delete(type)
}

export function sendSignal(data: any) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data))
  }
}

function connect() {
  if (ws) {
    try { ws.close() } catch {}
    ws = null
  }

  signalingState.set('connecting')
  try {
    ws = new WebSocket(serverUrl)
  } catch {
    tryFallbackOrReconnect()
    return
  }

  ws.onopen = () => {
    signalingState.set('connected')
    reconnectCount = 0
    triedFallback = false
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      const handler = messageHandlers.get(data.type)
      if (handler) handler(data)
    } catch {}
  }

  ws.onclose = () => {
    if (get(signalingState) !== 'error') {
      scheduleReconnect()
    }
  }

  ws.onerror = () => {
    if (!triedFallback && serverUrl !== fallbackUrl) {
      // Primary address failed, try localhost fallback
      triedFallback = true
      serverUrl = fallbackUrl
      console.log('[信令] 主地址连接失败，回退到:', fallbackUrl)
      setTimeout(() => connect(), 500)
      return
    }
    signalingState.set('error')
    if (reconnectCount >= MAX_RETRIES) {
      console.error('[信令] 连接失败已达最大重试次数，请检查防火墙是否放行端口 ' + signalPort)
    }
  }
}

function tryFallbackOrReconnect() {
  if (!triedFallback && serverUrl !== fallbackUrl) {
    triedFallback = true
    serverUrl = fallbackUrl
    console.log('[信令] 主地址连接失败，回退到:', fallbackUrl)
    setTimeout(() => connect(), 500)
    return
  }
  scheduleReconnect()
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectCount++
  if (reconnectCount >= MAX_RETRIES) {
    signalingState.set('error')
    console.error('[信令] 无法连接到信令服务 (' + serverUrl + ')，请检查防火墙是否放行端口 ' + signalPort)
    return
  }
  signalingState.set('connecting')
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, 3000)
}

export async function initSignaling(url?: string) {
  if (url) {
    setSignalingUrl(url)
  } else {
    // Try to get LAN IP from main process
    try {
      if (window.PcConnectApi?.getSignalingAddress) {
        const addr = await window.PcConnectApi.getSignalingAddress()
        serverUrl = addr
        console.log('[信令] 使用局域网地址:', addr)
      }
    } catch {
      // Fall back to localhost silently
      serverUrl = fallbackUrl
    }
  }
  connect()
}

export function destroySignaling() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (ws) {
    try { ws.close() } catch {}
    ws = null
  }
  messageHandlers.clear()
}
