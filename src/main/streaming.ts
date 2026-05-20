import { spawn, ChildProcess } from 'child_process'

let mediamtxProcess: ChildProcess | null = null
let cloudflaredProcess: ChildProcess | null = null

export function startMediaMTX(): Promise<void> {
  return new Promise((resolve, reject) => {
    mediamtxProcess = spawn('C:\\mediamtx\\mediamtx.exe', [], { cwd: 'C:\\mediamtx' })
    mediamtxProcess.stdout?.on('data', (data) => {
      const text = data.toString()
      console.log('[MediaMTX]', text.trim())
      if (text.includes('HLS listener opened') || text.includes('is ready')) {
        resolve()
      }
    })
    mediamtxProcess.stderr?.on('data', (data) => {
      const text = data.toString()
      console.log('[MediaMTX]', text.trim())
      if (text.includes('HLS listener opened') || text.includes('is ready')) {
        resolve()
      }
    })
    mediamtxProcess.on('error', reject)
  })
}

export function startCloudflared(): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudflaredProcess = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:8888'])
    cloudflaredProcess.stdout?.on('data', (data) => {
      const output = data.toString()
      console.log('[Cloudflared]', output.trim())
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
      if (match) {
        resolve(match[0])
      }
    })
    cloudflaredProcess.stderr?.on('data', (data) => {
      const output = data.toString()
      console.log('[Cloudflared]', output.trim())
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
      if (match) {
        resolve(match[0])
      }
    })
    cloudflaredProcess.on('error', reject)
  })
}

export function stopAll(): void {
  if (mediamtxProcess) { mediamtxProcess.kill(); mediamtxProcess = null }
  if (cloudflaredProcess) { cloudflaredProcess.kill(); cloudflaredProcess = null }
}
