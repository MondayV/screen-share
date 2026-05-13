import { writable, get } from 'svelte/store'

export type SignalingState = 'connecting' | 'connected' | 'error'

export const signalingState = writable<SignalingState>('connecting')

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let messageHandlers: Map<string, (data: any) => void> = new Map()
let serverUrl: string = 'ws://localhost:3456'

export function setSignalingUrl(url: string) {
  serverUrl = url.replace(/^http/, 'ws')
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
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    signalingState.set('connected')
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
    signalingState.set('error')
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  signalingState.set('connecting')
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, 2000)
}

export function initSignaling(url?: string) {
  if (url) setSignalingUrl(url)
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
