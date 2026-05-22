const WORKER_URL = 'wss://screen-share-signal.mondayv-screen-share.workers.dev'

type Listener = (data: any) => void
const listeners = new Map<string, Listener[]>()
let ws: WebSocket | null = null
let myPeerId = ''
let myColor = '#ffffff'

export function getMyColor(): string { return myColor }
export function getMyPeerId(): string { return myPeerId }

export function connect(roomCode: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws) { try { ws.close() } catch {} }
    ws = new WebSocket(`${WORKER_URL}/room/${roomCode}`)
    ws.onopen = () => resolve()
    ws.onerror = () => reject(new Error('信令连接失败'))
    ws.onmessage = (e) => {
      let msg: any
      try { msg = JSON.parse(e.data) } catch { return }
      if (msg.type === 'color') {
        myPeerId = msg.peerId
        myColor = msg.color
      }
      const cbs = listeners.get(msg.type)
      if (cbs) cbs.forEach((cb) => cb(msg))
    }
    ws.onclose = () => emit('close', {})
  })
}

export function sendChat(text: string): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat', text }))
}

export function sendDraw(points: { x: number; y: number }[], brushSize: number): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'draw', points, brushSize }))
}

export function sendClear(): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'clear' }))
}

export function on(event: string, cb: Listener): void {
  if (!listeners.has(event)) listeners.set(event, [])
  listeners.get(event)!.push(cb)
}

export function off(event: string, cb: Listener): void {
  const cbs = listeners.get(event)
  if (cbs) listeners.set(event, cbs.filter((c) => c !== cb))
}

export function disconnect(): void {
  if (ws) { ws.close(); ws = null }
  listeners.clear()
}

function emit(event: string, data: any): void {
  const cbs = listeners.get(event)
  if (cbs) cbs.forEach((cb) => cb(data))
}
