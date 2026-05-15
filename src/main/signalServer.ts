import http from 'http'
import crypto from 'crypto'
import { WebSocketServer, WebSocket } from 'ws'

interface Room {
  host: WebSocket | null
  hostName: string
  hostSdp: string | null
  participantSdp: string | null
  participantName: string
  time: number
}

const rooms = new Map<string, Room>()
const TIMEOUT = 10 * 60 * 1000
let server: http.Server | null = null
let wss: WebSocketServer | null = null
let port: number = 3456

function shortCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[crypto.randomInt(chars.length)]
  return code
}

function send(ws: WebSocket, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data))
  }
}

export function startSignalServer(p?: number): Promise<number> {
  return new Promise((resolve) => {
    if (server) { resolve(port); return }
    port = p || 3456

    server = http.createServer()
    wss = new WebSocketServer({ server })

    // Periodic cleanup
    setInterval(() => {
      const now = Date.now()
      rooms.forEach((room, code) => {
        if (now - room.time > TIMEOUT) {
          rooms.delete(code)
          console.log(`[信令] 房间过期清理: ${code}`)
        }
      })
    }, 60000)

    wss.on('connection', (ws) => {
      console.log(`[信令] 新WebSocket连接 (当前房间数: ${rooms.size})`)
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString())
          handleMessage(ws, msg)
        } catch { /* ignore malformed */ }
      })

      ws.on('close', () => {
        rooms.forEach((room, code) => {
          if (room.host === ws) {
            room.host = null
            console.log(`[信令] 主持人断开，房间保留: ${code} (hostSdp=${!!room.hostSdp}, participant=${!!room.participantSdp})`)
          }
        })
      })
    })

    server.listen(port, () => {
      console.log(`信令服务器已启动: ws://localhost:${port}`)
      resolve(port)
    })

    server.on('error', () => {
      port++
      server?.close()
      server = http.createServer()
      wss = new WebSocketServer({ server })
      server.listen(port, () => {
        console.log(`信令服务器已启动: ws://localhost:${port}`)
        resolve(port)
      })
    })
  })
}

function handleMessage(ws: WebSocket, msg: any) {
  const { type } = msg

  if (type === 'host-offer') {
    // Support reconnection: if client sends existing code, reuse the room
    const existingCode = msg.code?.trim().toUpperCase()
    if (existingCode && rooms.has(existingCode)) {
      const room = rooms.get(existingCode)!
      room.host = ws
      room.hostName = msg.username || ''
      room.hostSdp = msg.sdp
      room.time = Date.now()
      console.log(`[信令] 主持人重连，复用房间: ${existingCode} (当前房间数: ${rooms.size})`)
      send(ws, { type: 'code', code: existingCode })
    } else {
      const code = shortCode()
      rooms.set(code, {
        host: ws,
        hostName: msg.username || '',
        hostSdp: msg.sdp,
        participantSdp: null,
        participantName: '',
        time: Date.now()
      })
      console.log(`[信令] 新建房间: ${code} (当前房间数: ${rooms.size})`)
      send(ws, { type: 'code', code })
    }
  }

  else if (type === 'join') {
    const code = msg.code?.trim().toUpperCase()
    console.log(`[信令] 加入请求: ${code} (当前房间列表: [${[...rooms.keys()].join(', ')}])`)
    const room = rooms.get(code)
    if (!room || !room.hostSdp) {
      console.log(`[信令] 加入失败 - 房间不存在或无SDP: ${code}`)
      send(ws, { type: 'error', message: '连接码无效或已过期' })
      return
    }
    console.log(`[信令] 加入成功: ${code}, 发送offer给参与者`)
    send(ws, { type: 'offer', sdp: room.hostSdp, username: room.hostName })
  }

  else if (type === 'participant-answer') {
    const code = msg.code?.trim().toUpperCase()
    console.log(`[信令] 参与者应答: ${code}`)
    const room = rooms.get(code)
    if (!room || !room.host || room.host.readyState !== WebSocket.OPEN) {
      console.log(`[信令] 参与者应答失败 - 主持人已离线: ${code}`)
      send(ws, { type: 'error', message: '主持人已离线' })
      return
    }
    room.participantSdp = msg.sdp
    room.participantName = msg.username || ''
    send(room.host, { type: 'participant-answer', sdp: msg.sdp, username: msg.username })
    console.log(`[信令] 参与者应答已转发给主持人: ${code}`)
  }
}

export function stopSignalServer(): void {
  if (wss) { wss.close(); wss = null }
  if (server) { server.close(); server = null }
}

export function getSignalServerPort(): number {
  return port
}
