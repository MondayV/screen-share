import http from 'http'
import crypto from 'crypto'
import { WebSocketServer, WebSocket } from 'ws'

interface Room {
  host: WebSocket | null
  hostName: string
  hostSdp: string | null
  participantSdp: string | null
  participantName: string
}

const rooms = new Map<string, Room>()
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

// Extract roomId from message: support both 'roomId' and legacy 'code' field
function getRoomId(msg: any): string | undefined {
  const raw = msg.roomId || msg.code
  return raw?.trim().toUpperCase()
}

export function startSignalServer(p?: number): Promise<number> {
  return new Promise((resolve) => {
    if (server) { resolve(port); return }
    port = p || 3456

    server = http.createServer()
    wss = new WebSocketServer({ server })

    wss.on('connection', (ws) => {
      console.log(`[信令] 新WebSocket连接 (当前房间数: ${rooms.size})`)
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString())
          handleMessage(ws, msg)
        } catch { /* ignore malformed */ }
      })

      ws.on('close', () => {
        rooms.forEach((room, roomId) => {
          if (room.host === ws) {
            room.host = null
            console.log(`[信令] 主持人断开: ${roomId}`)
          }
          // Clean up room only when both sides are gone
          if (room.host === null && !room.participantSdp) {
            rooms.delete(roomId)
            console.log(`[信令] 房间清理: ${roomId} (无参与者，已删除)`)
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
    // Reconnection: if client sends existing roomId, reuse the room
    const existingId = getRoomId(msg)
    if (existingId && rooms.has(existingId)) {
      const room = rooms.get(existingId)!
      room.host = ws
      room.hostName = msg.username || ''
      room.hostSdp = msg.sdp
      console.log(`[信令] 房间已创建(复用): ${existingId}, 当前房间列表:`, Array.from(rooms.keys()))
      send(ws, { type: 'code', roomId: existingId })
    } else {
      const roomId = shortCode()
      rooms.set(roomId, {
        host: ws,
        hostName: msg.username || '',
        hostSdp: msg.sdp,
        participantSdp: null,
        participantName: ''
      })
      console.log(`[信令] 房间已创建: ${roomId}, 当前房间列表:`, Array.from(rooms.keys()))
      send(ws, { type: 'code', roomId })
    }
  }

  else if (type === 'join') {
    const roomId = getRoomId(msg)
    console.log(`[信令] 收到加入请求: ${roomId}, 房间存在: ${rooms.has(roomId!)}`)
    const room = rooms.get(roomId!)
    if (!room || !room.hostSdp) {
      console.log(`[信令] 加入失败 - 房间不存在或无SDP: ${roomId}`)
      send(ws, { type: 'error', message: '连接码无效或已过期' })
      return
    }
    console.log(`[信令] 加入成功: ${roomId}, 发送offer给参与者`)
    send(ws, { type: 'offer', sdp: room.hostSdp, username: room.hostName })
  }

  else if (type === 'participant-answer') {
    const roomId = getRoomId(msg)
    console.log(`[信令] 参与者应答: ${roomId}`)
    const room = rooms.get(roomId!)
    if (!room || !room.host || room.host.readyState !== WebSocket.OPEN) {
      console.log(`[信令] 参与者应答失败 - 主持人已离线: ${roomId}`)
      send(ws, { type: 'error', message: '主持人已离线' })
      return
    }
    room.participantSdp = msg.sdp
    room.participantName = msg.username || ''
    send(room.host, { type: 'participant-answer', sdp: msg.sdp, username: msg.username })
    console.log(`[信令] 参与者应答已转发给主持人: ${roomId}`)
  }
}

export function stopSignalServer(): void {
  if (wss) { wss.close(); wss = null }
  if (server) { server.close(); server = null }
}

export function getSignalServerPort(): number {
  return port
}
