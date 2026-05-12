const express = require('express')
const http = require('http')
const crypto = require('crypto')
const app = express()
const server = http.createServer(app)

app.use(express.json({ limit: '1mb' }))

// In-memory store for SDP exchange (auto-expire after 5 minutes)
const store = new Map()
const TIMEOUT = 5 * 60 * 1000

function shortCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(chars.length)]
  }
  return code
}

function cleanCode(code) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

// Store SDP and return short code
app.post('/host', (req, res) => {
  const { sdp, username } = req.body
  if (!sdp) return res.status(400).json({ error: 'missing sdp' })
  const code = shortCode()
  store.set(code, {
    hostSdp: sdp,
    hostName: username || '',
    time: Date.now()
  })
  // Auto-expire
  setTimeout(() => store.delete(code), TIMEOUT)
  res.json({ code })
})

// Participant: get host SDP by code
app.get('/offer/:code', (req, res) => {
  const code = cleanCode(req.params.code)
  const data = store.get(code)
  if (!data) return res.status(404).json({ error: 'code not found or expired' })
  res.json({ sdp: data.hostSdp, username: data.hostName })
})

// Participant: submit answer SDP
app.post('/answer/:code', (req, res) => {
  const code = cleanCode(req.params.code)
  const data = store.get(code)
  if (!data) return res.status(404).json({ error: 'code not found or expired' })
  const { sdp, username } = req.body
  if (!sdp) return res.status(400).json({ error: 'missing sdp' })
  data.participantSdp = sdp
  data.participantName = username || ''
  data.time = Date.now()
  res.json({ ok: true })
})

// Host: poll for participant answer
app.get('/answer/:code', (req, res) => {
  const code = cleanCode(req.params.code)
  const data = store.get(code)
  if (!data) return res.status(404).json({ error: 'code not found or expired' })
  if (!data.participantSdp) return res.json({ ready: false })
  res.json({
    ready: true,
    sdp: data.participantSdp,
    username: data.participantName
  })
})

// Health
app.get('/health', (_, res) => res.json({ ok: true, stored: store.size }))

const PORT = process.env.PORT || 3456
server.listen(PORT, () => {
  console.log(`PC Connect 信令服务器运行在 http://localhost:${PORT}`)
})
