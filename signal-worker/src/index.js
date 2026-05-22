const COLORS = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff922b','#e040ff','#00e5ff','#ff6090','#69f0ae','#40c4ff']

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] !== 'room' || !parts[1]) {
      return new Response('PC Connect Signaling', { status: 200 })
    }
    const roomCode = parts[1].toUpperCase().slice(0, 8)
    const id = env.ROOM.idFromName(roomCode)
    const stub = env.ROOM.get(id)
    return stub.fetch(request)
  }
}

export class Room {
  constructor(state) {
    this.state = state
    this.sessions = new Map()
  }

  async fetch(request) {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.state.acceptWebSocket(server)
    const peerId = crypto.randomUUID()
    const colorIdx = this.sessions.size % COLORS.length
    const color = COLORS[colorIdx]
    this.sessions.set(server, { id: peerId, color })
    server.send(JSON.stringify({ type: 'color', peerId, color }))
    for (const [ws, info] of this.sessions) {
      if (ws !== server) {
        ws.send(JSON.stringify({ type: 'peer-joined', peerId, color: info.color }))
        server.send(JSON.stringify({ type: 'peer-joined', peerId: info.id, color: info.color }))
      }
    }
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws, raw) {
    let data
    try { data = JSON.parse(raw) } catch { return }
    const sender = this.sessions.get(ws)
    if (!sender) return
    if (data.type === 'chat') {
      const msg = { type: 'chat', peerId: sender.id, color: sender.color, text: data.text, timestamp: Date.now() }
      for (const [w] of this.sessions) {
        if (w.readyState === 1) w.send(JSON.stringify(msg))
      }
    } else if (data.type === 'draw') {
      const msg = { type: 'draw', peerId: sender.id, color: sender.color, points: data.points, brushSize: data.brushSize || 3 }
      for (const [w] of this.sessions) {
        if (w !== ws && w.readyState === 1) w.send(JSON.stringify(msg))
      }
    } else if (data.type === 'clear') {
      for (const [w] of this.sessions) {
        if (w !== ws && w.readyState === 1) w.send(JSON.stringify({ type: 'clear' }))
      }
    }
  }

  async webSocketClose(ws) {
    const info = this.sessions.get(ws)
    if (!info) return
    for (const [w] of this.sessions) {
      if (w !== ws && w.readyState === 1) w.send(JSON.stringify({ type: 'peer-left', peerId: info.id }))
    }
    this.sessions.delete(ws)
    if (this.sessions.size === 0) {
      for (const [w] of this.sessions) { try { w.close() } catch {} }
      this.sessions.clear()
    }
  }

  async webSocketError(ws, error) {
    console.error('WebSocket error:', error)
  }
}
