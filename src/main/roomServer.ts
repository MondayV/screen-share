/**
 * 房间服务：为"多人屏幕共享"提供共享列表（roster）聚合与实时广播。
 *
 * - 每个实例启动一个本地房间服务（自动挑选空闲端口，默认 8891 起，支持同机多实例）
 * - 会议创建者通过第二个 cloudflared 隧道将其暴露为公网房间地址
 * - 会议内成员通过 HTTP 轮询获取列表（WS 在 cloudflared http2 隧道上偶发挂起，已弃用）
 * - 共享者注册/更新/取消自己的共享（name + streamUrl），其余成员点击切换观看
 * - /api/whep/* 代理：转发到本地 MediaMTX WebRTC 信令(8889)，供 WHEP 播放器打洞直连
 */
import { createServer } from 'http'
import type { IncomingMessage, ServerResponse } from 'http'
import { request } from 'http'

export type RoomShare = {
  id: string
  name: string
  streamUrl: string
  whepUrl?: string
  hlsUrl?: string
  updatedAt: number
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

let httpServer: ReturnType<typeof createServer> | null = null
let serverPort = 0
let starting: Promise<number> | null = null

const roomId = Math.random().toString(36).slice(2, 8).toUpperCase()
const shares = new Map<string, RoomShare>()

const json = (res: ServerResponse, status: number, data: unknown): void => {
  res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let body = ''
    req.on('data', (d: Buffer) => { body += d.toString() })
    req.on('end', () => resolve(body))
  })

const snapshot = (): { type: string; roomId: string; shares: RoomShare[] } => ({
  type: 'room',
  roomId,
  shares: [...shares.values()].sort((a, b) => a.updatedAt - b.updatedAt)
})

const broadcast = (): void => {
  // HTTP 轮询模式下无推送通道；列表变更由成员轮询获取。
  // 保留函数签名以兼容调用点（内部无需广播）。
}

/** WHEP 信令代理：把 /api/whep/* 请求转发到本地 MediaMTX WebRTC(8889) */
const MEDIAMTX_WEBRTC_PORT = 8889

const handleWhepProxy = (req: IncomingMessage, res: ServerResponse): void => {
  const url = new URL(req.url || '/', 'http://localhost')
  // /api/whep/{streamKey}/whep... → /{streamKey}/whep...
  const targetPath = url.pathname.replace(/^\/api\/whep/, '') + url.search
  const targetUrl = `http://127.0.0.1:${MEDIAMTX_WEBRTC_PORT}${targetPath}`
  const chunks: Buffer[] = []
  req.on('data', (d: Buffer) => chunks.push(d))
  req.on('end', () => {
    const body = Buffer.concat(chunks)
    const headers: Record<string, string> = {
      'Content-Type': req.headers['content-type'] || 'application/octet-stream',
      ...(body.length ? { 'Content-Length': String(body.length) } : {}),
    }
    const upstream = request(targetUrl, {
      method: req.method,
      headers,
    }, (upRes) => {
      // 重写 Location：MediaMTX 返回内部相对路径（如 /MA5F34/whep/{id}），
      // 客户端需经本代理访问 → 补回 /api/whep 前缀
      const outHeaders: Record<string, string | number | string[]> = { ...upRes.headers }
      if (outHeaders.location && typeof outHeaders.location === 'string') {
        outHeaders.location = '/api/whep' + outHeaders.location
      }
      res.writeHead(upRes.statusCode || 502, {
        ...outHeaders,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,If-Match',
        'Access-Control-Expose-Headers': 'Location,Link',
      })
      upRes.pipe(res)
    })
    upstream.on('error', (e) => {
      res.writeHead(502, CORS_HEADERS)
      res.end(JSON.stringify({ status: 'error', error: `WHEP 代理失败: ${e.message}` }))
    })
    if (body.length) upstream.write(body)
    upstream.end()
  })
}

const handleShare = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  try {
    const body = JSON.parse((await readBody(req)) || '{}')
    const name = String(body.name || '').slice(0, 32)
    const streamUrl = String(body.streamUrl || '').trim()
    const whepUrl = String(body.whepUrl || '').trim() || undefined
    const hlsUrl = String(body.hlsUrl || '').trim() || undefined
    if (!streamUrl || !/^https?:\/\//.test(streamUrl)) {
      json(res, 400, { error: 'streamUrl 无效' })
      return
    }
    // 同一流地址幂等更新（共享者重连/改名）
    let share = [...shares.values()].find((s) => s.streamUrl === streamUrl)
    if (share) {
      share.name = name || share.name
      share.whepUrl = whepUrl || share.whepUrl
      share.hlsUrl = hlsUrl || share.hlsUrl
      share.updatedAt = Date.now()
    } else {
      share = { id: Math.random().toString(36).slice(2, 10), name: name || '未命名', streamUrl, whepUrl, hlsUrl, updatedAt: Date.now() }
      shares.set(share.id, share)
    }
    broadcast()
    json(res, 200, { id: share.id })
  } catch {
    json(res, 400, { error: '请求体格式错误' })
  }
}

const handleUnshare = (req: IncomingMessage, res: ServerResponse): void => {
  const url = new URL(req.url || '', 'http://localhost')
  const id = url.searchParams.get('id') || ''
  if (id && shares.delete(id)) broadcast()
  json(res, 200, { ok: true })
}

/** 启动房间服务（幂等），resolve 时服务已监听成功，返回实际端口 */
export function startRoomServer(): Promise<number> {
  if (httpServer) return Promise.resolve(serverPort)
  if (starting) return starting

  starting = new Promise<number>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://localhost')
      // WHEP 信令代理（OPTIONS/POST/PATCH/DELETE 全透传）—— 必须优先于通用 OPTIONS 路由，
      // 因为 WHEP 的 OPTIONS 需返回 MediaMTX 的 Link(ICE servers) 头
      if (url.pathname.startsWith('/api/whep/')) {
        handleWhepProxy(req, res)
        return
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS)
        res.end()
        return
      }
      if (req.method === 'GET' && url.pathname === '/api/room') {
        json(res, 200, snapshot())
      } else if (req.method === 'POST' && url.pathname === '/api/share') {
        void handleShare(req, res)
      } else if (req.method === 'DELETE' && url.pathname === '/api/share') {
        handleUnshare(req, res)
      } else if (req.method === 'GET' && url.pathname === '/') {
        json(res, 200, { ok: true, roomId })
      } else {
        json(res, 404, { error: 'not found' })
      }
    })

    // 依次尝试 8891 起的端口，直到成功绑定
    const tryListen = (port: number): void => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          server.removeAllListeners('error')
          tryListen(port + 1)
        } else {
          console.error('[RoomServer] 启动失败:', err)
          reject(err)
        }
      })
      server.listen(port, '127.0.0.1', () => {
        serverPort = port
        httpServer = server
        console.log(`[RoomServer] 房间服务已启动 127.0.0.1:${port} roomId=${roomId}`)
        resolve(port)
      })
    }
    tryListen(8891)
  })
  return starting
}

export function getRoomInfo(): { roomId: string; port: number } {
  return { roomId, port: serverPort }
}
