import type { SettingsData } from './stateKeeper'
import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { createCursorsWindow } from './cursors'
import { settingsKeeper } from './stateKeeper'
import { spawn, ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'
import { startRoomServer, getRoomInfo } from './roomServer'

function getMediaMTXPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tools', 'mediamtx.exe')
  }
  return path.join(__dirname, '..', '..', 'resources', 'tools', 'mediamtx.exe')
}

function getCloudflaredPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tools', 'cloudflared.exe')
  }
  const candidates: string[] = []
  if (process.platform === 'win32') {
    const userProfile = process.env.USERPROFILE || process.env.HOME || ''
    if (userProfile) {
      candidates.push(
        path.join(userProfile, 'scoop', 'apps', 'cloudflared', 'current', 'cloudflared.exe'),
        path.join(userProfile, 'scoop', 'shims', 'cloudflared.exe')
      )
    }
    candidates.push('C:\\Windows\\System32\\cloudflared.exe')
  } else {
    candidates.push('/usr/local/bin/cloudflared', '/usr/bin/cloudflared')
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
}

let mediamtxProcess: ChildProcess | null = null
// 两个 cloudflared 隧道：媒体(8888→HLS) 与 房间服务(房间端口)
const mediaTunnel = { proc: null as ChildProcess | null }
const roomTunnel = { proc: null as ChildProcess | null }

function sendLog(msg: string): void {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length > 0) wins[0].webContents.send('log-message', msg)
}

function killProcess(p: ChildProcess | null, name: string): void {
  if (!p) return
  try {
    if (process.platform === 'win32') {
      // 异步终止整个进程树，避免阻塞退出流程
      spawn('taskkill', ['/PID', String(p.pid), '/F', '/T'], { stdio: 'ignore' })
    } else {
      p.kill('SIGTERM')
    }
  } catch {}
  try { p.kill() } catch {}
  console.log(`[Cleanup] ${name} 已终止`)
}

export function stopAllProcesses(): void {
  killProcess(mediamtxProcess, 'MediaMTX'); mediamtxProcess = null
  killProcess(mediaTunnel.proc, 'Cloudflared(媒体)'); mediaTunnel.proc = null
  killProcess(roomTunnel.proc, 'Cloudflared(房间)'); roomTunnel.proc = null
}

const noProxyEnv = (): NodeJS.ProcessEnv => {
  const env = { ...process.env }
  delete env.http_proxy; delete env.https_proxy
  delete env.HTTP_PROXY; delete env.HTTPS_PROXY
  return env
}

const checkCloudflared = (p: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const proc = spawn(p, ['--version'], { windowsHide: true })
    let stderr = ''
    let settled = false
    const finish = (v: string | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(v)
    }
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('close', (code) => finish(code !== 0 ? (stderr || `exit code ${code}`) : null))
    proc.on('error', (err) => finish(err.message))
    const timer = setTimeout(() => { proc.kill(); finish('自检超时') }, 5000)
  })
}

/** 启动一个 cloudflared 快速隧道，映射到本地端口，返回公网 https URL */
const startCloudflaredTunnel = async (localPort: number, holder: { proc: ChildProcess | null }): Promise<string> => {
  const cfPath = getCloudflaredPath()
  console.log('[Cloudflared] 使用路径:', cfPath)
  const checkErr = await checkCloudflared(cfPath)
  if (checkErr) {
    if (checkErr.includes('VCRUNTIME') || checkErr.includes('DLL') || checkErr.includes('140')) {
      throw new Error('缺少 Visual C++ 运行库，请下载安装: https://aka.ms/vs/17/release/vc_redist.x64.exe')
    }
    if (checkErr.includes('Permission') || checkErr.includes('denied') || checkErr.includes('EACCES')) {
      throw new Error('cloudflared 被系统或杀毒软件阻止，请将 PCConnect 添加至信任列表')
    }
    throw new Error(`Cloudflared 组件异常: ${checkErr}`)
  }
  if (holder.proc) { killProcess(holder.proc, 'Cloudflared(旧隧道)'); holder.proc = null }
  holder.proc = spawn(cfPath, ['tunnel', '--url', `http://localhost:${localPort}`, '--protocol', 'http2', '--no-autoupdate'], { env: noProxyEnv(), windowsHide: true })
  let buffer = ''
  holder.proc.stderr?.on('data', (d) => { const m = d.toString(); buffer += m; console.log('[Cloudflared]', m.trim()); sendLog(`[Cloudflared] ${m.trim()}`) })
  holder.proc.stdout?.on('data', (d) => { const m = d.toString(); buffer += m; console.log('[Cloudflared]', m.trim()); sendLog(`[Cloudflared] ${m.trim()}`) })
  return new Promise<string>((resolve, reject) => {
    const done = (url: string) => { clearTimeout(timer); resolve(url) }
    const fail = (err: Error) => { clearTimeout(timer); reject(err) }
    const check = (data: string) => {
      const m = data.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
      if (m) { sendLog(`[Cloudflared] 隧道已建立: ${m[0]}`); done(m[0]) }
    }
    holder.proc!.stderr?.on('data', (d) => check(d.toString()))
    holder.proc!.stdout?.on('data', (d) => check(d.toString()))
    holder.proc!.on('error', (e) => fail(e))
    holder.proc!.on('close', (code) => fail(new Error(`Cloudflared 进程退出(code ${code})`)))
    const timer = setTimeout(() => { fail(new Error('Cloudflared 隧道启动超时')) }, 90000)
  })
}

export const ipcMainHandlersInit = (): void => {
  const availableDimensions = screen.getPrimaryDisplay().workAreaSize
  let remoteCursorsWindow: BrowserWindow | null = null
  let remoteCursorsActive = false

  // 预启动本地房间服务（会议共享列表用），端口自动挑选
  startRoomServer().catch((e) => console.error('[RoomServer] 启动失败:', e))

  ipcMain.handle('toggleRemoteCursors', async (_, state) => {
    remoteCursorsActive = state
    if (!remoteCursorsWindow && remoteCursorsActive) {
      remoteCursorsWindow = await createCursorsWindow()
      remoteCursorsWindow.on('closed', () => {
        remoteCursorsWindow = null
        remoteCursorsActive = false
      })
      return
    }
    if (remoteCursorsWindow && !remoteCursorsActive) {
      remoteCursorsWindow.close()
      remoteCursorsWindow = null
      return
    }
    console.error('无效状态')
  })
  ipcMain.handle('updateRemoteCursor', async (_, state): Promise<void> => {
    if (!remoteCursorsActive) return
    if (!remoteCursorsWindow) return
    const realX: string = (state.x * availableDimensions.width).toString()
    const realY: string = (state.y * availableDimensions.height).toString()
    const x = parseInt(realX, 10)
    const y = parseInt(realY, 10)
    const data = {
      ...state,
      x,
      y
    }
    remoteCursorsWindow.webContents.send('updateRemoteCursor', data)
  })
  ipcMain.handle('remoteCursorPing', async (_, cursorId): Promise<void> => {
    if (!remoteCursorsActive) return
    if (!remoteCursorsWindow) return
    remoteCursorsWindow.webContents.send('remoteCursorPing', cursorId)
  })
  ipcMain.handle('updateSettings', async (_, settings): Promise<void> => {
    const settingsKeeperInstance = await settingsKeeper()
    settingsKeeperInstance.set(settings)
  })
  ipcMain.handle('getSettings', async (): Promise<SettingsData> => {
    const settingsKeeperInstance = await settingsKeeper()
    return settingsKeeperInstance.get()
  })
  ipcMain.handle('getAppVersion', (): string => {
    return app.getVersion()
  })
  ipcMain.handle('startStreaming', async (): Promise<{ publicUrl: string; streamKey: string }> => {
    if (!mediamtxProcess) {
      mediamtxProcess = spawn(getMediaMTXPath(), [], { cwd: path.dirname(getMediaMTXPath()) })
      try {
        await new Promise<void>((resolve, reject) => {
          let settled = false
          const settle = (fn: () => void) => (): void => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            fn()
          }
          const timeout = setTimeout(() => {
            reject(new Error('MediaMTX 启动超时（30秒），请重试或重启应用'))
          }, 30000)
          const onData = (d: { toString(): string }): void => {
            const m = d.toString()
            const line = m.trim()
            if (line) { console.log('[MediaMTX]', line); sendLog(`[MediaMTX] ${line}`) }
            if (m.includes('HLS') || m.includes('ready')) settle(resolve)()
          }
          mediamtxProcess!.stdout?.on('data', onData)
          mediamtxProcess!.stderr?.on('data', onData)
          mediamtxProcess!.on('error', (e) => settle(() => reject(e))())
          mediamtxProcess!.on('close', (code) => settle(() => reject(new Error(`MediaMTX 进程退出(code ${code})`)))())
        })
      } catch (err) {
        // 启动失败：清理子进程并允许重试，绝不向主进程抛出未捕获异常
        killProcess(mediamtxProcess, 'MediaMTX')
        mediamtxProcess = null
        throw err instanceof Error ? err : new Error('MediaMTX 启动失败')
      }
    }
    const publicUrl = await startCloudflaredTunnel(8888, mediaTunnel)
    // 加密级随机密钥（36 进制大写字母数字），避免使用 Math.random
    const STREAM_KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const streamKey = Array.from(randomBytes(6), (b) => STREAM_KEY_ALPHABET[b % STREAM_KEY_ALPHABET.length]).join('')
    return { publicUrl, streamKey }
  })
  ipcMain.handle('stopStreaming', async (): Promise<void> => {
    killProcess(mediamtxProcess, 'MediaMTX'); mediamtxProcess = null
    killProcess(mediaTunnel.proc, 'Cloudflared(媒体)'); mediaTunnel.proc = null
  })
  // 创建会议：确保房间服务运行并为其建立公网隧道，返回会议链接
  ipcMain.handle('createMeeting', async (): Promise<{ roomUrl: string; roomId: string }> => {
    const roomPort = await startRoomServer()
    const roomHost = await startCloudflaredTunnel(roomPort, roomTunnel)
    const { roomId } = getRoomInfo()
    return { roomUrl: `${roomHost}/room/${roomId}`, roomId }
  })
  // 结束会议（仅房间创建者）：关闭房间隧道（媒体/共享由各自 stopShare 处理）
  ipcMain.handle('stopMeeting', async (): Promise<void> => {
    killProcess(roomTunnel.proc, 'Cloudflared(房间)'); roomTunnel.proc = null
  })
  ipcMain.handle('write-push-config', async (_event, data: { server: string; key: string }) => {
    const obsAppDataDir = path.join(process.env.APPDATA || '', 'obs-studio')
    if (!fs.existsSync(obsAppDataDir)) fs.mkdirSync(obsAppDataDir, { recursive: true })
    fs.writeFileSync(path.join(obsAppDataDir, 'pc-connect-push.json'), JSON.stringify(data, null, 2), 'utf-8')
    return true
  })
  ipcMain.handle('open-obs-script-folder', async () => {
    const scriptDir = app.isPackaged
      ? path.join(process.resourcesPath, 'obs-script')
      : path.join(__dirname, '..', '..', 'resources', 'obs-script')
    if (!fs.existsSync(scriptDir)) fs.mkdirSync(scriptDir, { recursive: true })
    await shell.openPath(scriptDir)
    return true
  })
  ipcMain.handle('runDiagnostics', async () => {
    const results: { name: string; status: string; message: string; suggestion: string }[] = []
    const pass = (name: string) => results.push({ name, status: 'pass', message: '正常', suggestion: '' })
    const fail = (name: string, msg: string, sug: string) => results.push({ name, status: 'fail', message: msg, suggestion: sug })

    // 1. Mediamtx file check
    const mtPath = getMediaMTXPath()
    if (fs.existsSync(mtPath)) pass('MediaMTX 文件存在')
    else fail('MediaMTX 文件存在', `未找到 ${mtPath}`, '请重新安装 PCConnect')

    // 2. Cloudflared file check
    const cfPath = getCloudflaredPath()
    if (fs.existsSync(cfPath)) pass('Cloudflared 文件存在')
    else fail('Cloudflared 文件存在', `未找到 ${cfPath}`, '请重新安装 PCConnect')

    // 3. Cloudflared --version test
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(cfPath, ['--version'], { windowsHide: true })
        const t = setTimeout(() => { proc.kill(); reject(new Error('timeout')) }, 5000)
        proc.on('close', (code) => { clearTimeout(t); code === 0 ? resolve() : reject(new Error(`exit ${code}`)) })
        proc.on('error', reject)
      })
      pass('Cloudflared 可执行')
    } catch { fail('Cloudflared 可执行', '无法运行 cloudflared --version', '可能缺少 VC++ 运行库，下载: https://aka.ms/vs/17/release/vc_redist.x64.exe') }

    // 4. Port 8888 check
    try {
      await new Promise<void>((resolve, reject) => {
        const s = require('net').createServer()
        s.once('error', reject); s.once('listening', () => { s.close(); resolve() })
        s.listen(8888, '127.0.0.1')
      })
      pass('端口 8888 空闲')
    } catch { fail('端口 8888', '端口 8888 已被占用', '请关闭占用 8888 端口的程序后重试') }

    // 5. Port 1935 check
    try {
      await new Promise<void>((resolve, reject) => {
        const s = require('net').createServer()
        s.once('error', reject); s.once('listening', () => { s.close(); resolve() })
        s.listen(1935, '127.0.0.1')
      })
      pass('端口 1935 空闲')
    } catch { fail('端口 1935', '端口 1935 已被占用', '请关闭占用 1935 端口的程序后重试') }

    // 6. Network reachability
    try {
      await new Promise<void>((resolve, reject) => {
        const s = require('net').createConnection({ host: 'trycloudflare.com', port: 443 })
        s.on('connect', () => { s.end(); resolve() })
        s.on('error', reject)
        setTimeout(() => { s.destroy(); reject(new Error('timeout')) }, 5000)
      })
      pass('出站网络连接')
    } catch { fail('出站网络', '无法连接 trycloudflare.com', '请检查网络连接或关闭代理/VPN') }

    return results
  })
  // OBS WebSocket 握手探测：区分"服务可达"与"需要密码"
  const probeOBSWebSocketAuth = (): Promise<{ up: boolean; authRequired: boolean | null }> => {
    return new Promise((resolve) => {
      let settled = false
      const finish = (v: { up: boolean; authRequired: boolean | null }): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(v)
      }
      let ws: WebSocket
      try {
        ws = new WebSocket('ws://127.0.0.1:4455')
      } catch {
        finish({ up: false, authRequired: null })
        return
      }
      const timer = setTimeout(() => { try { ws.close() } catch {}; finish({ up: false, authRequired: null }) }, 3000)
      ws.onmessage = (ev): void => {
        try {
          const msg = JSON.parse(String(ev.data))
          if (msg?.op === 0 && msg?.d) {
            finish({ up: true, authRequired: !!msg.d.authentication })
            try { ws.close() } catch {}
          }
        } catch { /* 忽略非 JSON 消息 */ }
      }
      ws.onerror = (): void => finish({ up: false, authRequired: null })
      ws.onclose = (): void => finish({ up: false, authRequired: null })
    })
  }

  ipcMain.handle('checkObsConnection', async () => {
    const net = require('net')
    const tcpUp = await new Promise<boolean>((resolve) => {
      const s = net.createConnection({ host: '127.0.0.1', port: 4455 })
      s.setTimeout(3000)
      s.on('connect', () => { s.end(); resolve(true) })
      s.on('timeout', () => { s.destroy(); resolve(false) })
      s.on('error', () => { s.destroy(); resolve(false) })
    })
    if (!tcpUp) {
      return { connected: false, reason: 'OBS 未运行或 WebSocket 未开启（OBS → 工具 → WebSocket 服务器设置）' }
    }
    const probe = await probeOBSWebSocketAuth()
    if (probe.up && probe.authRequired) {
      return { connected: true, reason: 'OBS 已连接（需 WebSocket 密码，请在设置中填写）' }
    }
    if (probe.up) {
      return { connected: true, reason: '' }
    }
    return { connected: false, reason: 'OBS WebSocket 服务异常，请确认已开启' }
  })
  ipcMain.handle('checkPathActive', async (_e, streamKey: string) => {
    const http = require('http')
    // 跟随 mediamtx 的 cookie 校验重定向（302 + Set-Cookie），最多 3 跳
    const fetchBody = (path: string, cookie = '', hops = 0): Promise<{ status: number; body: string }> => {
      return new Promise((resolve) => {
        const headers: Record<string, string> = {}
        if (cookie) headers['Cookie'] = cookie
        const req = http.request({ hostname: '127.0.0.1', port: 8888, path, method: 'GET', timeout: 3000, headers }, (res: any) => {
          let body = ''
          res.on('data', (d: Buffer) => { body += d.toString() })
          res.on('end', () => {
            if (hops < 3 && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              const setCookies = res.headers['set-cookie']
              const nextCookie = Array.isArray(setCookies)
                ? setCookies.map((c: string) => c.split(';')[0]).join('; ')
                : ''
              fetchBody(res.headers.location, nextCookie, hops + 1).then(resolve)
              return
            }
            resolve({ status: res.statusCode, body })
          })
        })
        req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }) })
        req.on('error', () => resolve({ status: 0, body: '' }))
        req.end()
      })
    }
    // 判断播放列表是否包含媒体引用（master 的 #EXT-X-STREAM-INF 或分片行）
    const hasMediaRef = (body: string): boolean =>
      body.includes('#EXT-X-STREAM-INF') || /\.(m4s|ts)(?="|$)/i.test(body) || body.includes('#EXTINF')

    const index = await fetchBody(`/${streamKey}/index.m3u8`)
    if (index.status === 0) {
      return { active: false, reason: '查询超时，请确认 MediaMTX 已启动' }
    }
    if (index.status >= 400) {
      return { active: false, reason: '推流未到达，请检查 OBS 推流密钥是否填写正确' }
    }
    // mediamtx 仅在推流在线时才返回该路径的播放列表（无推流为 404）；
    // 再校验内容包含媒体引用，避免重定向残留等空响应误判
    if (hasMediaRef(index.body)) {
      return { active: true, reason: '' }
    }
    return { active: false, reason: '推流未到达（播放列表为空），请确认 OBS 已开始推流' }
  })
}
