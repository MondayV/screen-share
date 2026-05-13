import http from 'http'
import crypto from 'crypto'

const store = new Map<string, { hostSdp: any; hostName: string; participantSdp?: any; participantName?: string; time: number }>()
const TIMEOUT = 5 * 60 * 1000
let server: http.Server | null = null
let port: number = 3456

function shortCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[crypto.randomInt(chars.length)]
  return code
}

function cleanCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

function jsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body)) }
      catch { resolve(null) }
    })
    req.on('error', reject)
  })
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://localhost:${port}`)
  const path = url.pathname

  // POST /host — store host SDP
  if (req.method === 'POST' && path === '/host') {
    jsonBody(req).then((body) => {
      if (!body?.sdp) { res.writeHead(400, {}).end(JSON.stringify({ error: 'missing sdp' })); return }
      const code = shortCode()
      store.set(code, { hostSdp: body.sdp, hostName: body.username || '', time: Date.now() })
      setTimeout(() => store.delete(code), TIMEOUT)
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ code }))
    })
    return
  }

  // GET /offer/:code
  const offerMatch = path.match(/^\/offer\/([A-Za-z0-9]+)$/)
  if (req.method === 'GET' && offerMatch) {
    const code = cleanCode(offerMatch[1])
    const data = store.get(code)
    if (!data) { res.writeHead(404, {}).end(JSON.stringify({ error: 'not found' })); return }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ sdp: data.hostSdp, username: data.hostName }))
    return
  }

  // POST /answer/:code
  const answerMatch = path.match(/^\/answer\/([A-Za-z0-9]+)$/)
  if (req.method === 'POST' && answerMatch) {
    const code = cleanCode(answerMatch[1])
    const data = store.get(code)
    if (!data) { res.writeHead(404, {}).end(JSON.stringify({ error: 'not found' })); return }
    jsonBody(req).then((body) => {
      if (!body?.sdp) { res.writeHead(400, {}).end(JSON.stringify({ error: 'missing sdp' })); return }
      data.participantSdp = body.sdp
      data.participantName = body.username || ''
      data.time = Date.now()
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }))
    })
    return
  }

  // GET /answer/:code (poll)
  if (req.method === 'GET' && answerMatch) {
    const code = cleanCode(answerMatch[1])
    const data = store.get(code)
    if (!data) { res.writeHead(404, {}).end(JSON.stringify({ error: 'not found' })); return }
    if (!data.participantSdp) {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ready: false }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ready: true, sdp: data.participantSdp, username: data.participantName }))
    return
  }

  // /health
  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, stored: store.size }))
    return
  }

  res.writeHead(404).end('not found')
}

export function startSignalServer(p?: number): Promise<number> {
  return new Promise((resolve) => {
    if (server) { resolve(port); return }
    port = p || 3456
    server = http.createServer(handleRequest)
    server.listen(port, () => {
      console.log(`信令服务器已启动: http://localhost:${port}`)
      resolve(port)
    })
    server.on('error', () => {
      // Port in use, try next
      port++
      server?.close()
      server = http.createServer(handleRequest)
      server.listen(port, () => {
        console.log(`信令服务器已启动: http://localhost:${port}`)
        resolve(port)
      })
    })
  })
}

export function stopSignalServer(): void {
  if (server) {
    server.close()
    server = null
    console.log('信令服务器已停止')
  }
}

export function getSignalServerPort(): number {
  return port
}
