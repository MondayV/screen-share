import type { SettingsData } from './stateKeeper'
import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { createCursorsWindow } from './cursors'
import { settingsKeeper } from './stateKeeper'
import { spawn, ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'
import { startRoomServer, getRoomInfo } from './roomServer'

// ================= 大陆网络 DNS 污染绕过（DoH 代理） =================
// trycloudflare 随机域名在国内常被 DNS 污染导致 ERR_NAME_NOT_RESOLVED（K9），
// 渲染层所有指向公网隧道的请求（房间同步/共享注册/WHEP 信令）改由主进程代理：
// 用 DoH(223.5.5.5 阿里/1.1.1.1) 解析出真实 IP 后直连，绕过系统 DNS 污染。
const https = require('https')

/** 通过 DoH 解析域名（多服务器轮询），返回 IP；失败返回 null */
const resolveViaDoH = async (host: string): Promise<string | null> => {
  const dohServers = [
    { host: '223.5.5.5', path: `/resolve?name=${encodeURIComponent(host)}&type=A&ct=application/dns-json` }, // 阿里
    { host: '1.1.1.1', path: `/dns-query?name=${encodeURIComponent(host)}&type=A` },                       // Cloudflare
    { host: '8.8.8.8', path: `/resolve?name=${encodeURIComponent(host)}&type=A` },                         // Google
  ]
  for (const s of dohServers) {
    try {
      const ip = await new Promise<string | null>((resolve) => {
        const req = https.request({ host: s.host, path: s.path, method: 'GET', timeout: 5000 }, (res: any) => {
          let body = ''
          res.on('data', (d: Buffer) => { body += d.toString() })
          res.on('end', () => {
            try {
              const data = JSON.parse(body)
              const answers = data.Answer || []
              const a = answers.find((x: any) => x.type === 1 && x.data)
              resolve(a ? a.data : null)
            } catch { resolve(null) }
          })
        })
        req.on('timeout', () => { req.destroy(); resolve(null) })
        req.on('error', () => resolve(null))
        req.end()
      })
      if (ip) return ip
    } catch {}
  }
  return null
}

/** 主进程代理请求：解析域名→IP 直连（Host 头保留域名，绕过系统 DNS 污染）。
 * 返回 { status, headers, body }；headers 为小写键。
 * binary=true 时 body 为 base64（用于 HLS 媒体分片等二进制内容）。 */
const proxyRequest = async (method: string, url: string, body?: string, extraHeaders?: Record<string, string>, binary = false): Promise<{ status: number; headers: Record<string, string>; body: string }> => {
  const u = new URL(url)
  const host = u.hostname
  // 解析 IP：本机地址直接使用；否则优先 DoH，其次系统 DNS（dns.lookup 可被污染，仅作兜底）
  let ip = host
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    ip = await resolveViaDoH(host)
    if (!ip) {
      const dns = require('dns')
      ip = await new Promise((resolve) => dns.lookup(host, (err: Error | null, addr: string) => resolve(err ? '' : addr)))
    }
    if (!ip) throw new Error(`域名解析失败: ${host}`)
  }
  const headers: Record<string, string> = {
    Host: u.port && ((u.protocol === 'http:' && u.port !== '80') || (u.protocol === 'https:' && u.port !== '443')) ? `${host}:${u.port}` : host,
    ...(body !== undefined ? { 'Content-Length': Buffer.byteLength(body).toString() } : {}),
    ...extraHeaders,
  }

  // 单次请求（递归用于跟随重定向）
  const once = (targetUrl: string, cookie = '', hops = 0): Promise<{ status: number; headers: Record<string, string>; body: string }> => {
    const tu = new URL(targetUrl)
    const tHost = tu.hostname
    const finalIp = tHost === '127.0.0.1' || tHost === 'localhost' || tHost === '::1' ? tHost : ip // 重定向到同域时复用已解析 IP
    const h: Record<string, string> = { ...headers, Host: tu.port && tu.port !== (tu.protocol === 'http:' ? '80' : '443') ? `${tHost}:${tu.port}` : tHost }
    if (cookie) h['Cookie'] = cookie
    return new Promise<{ status: number; headers: Record<string, string>; body: string }>((resolve, reject) => {
      const transport = tu.protocol === 'http:' ? require('http') : https
      const req = transport.request({
        host: finalIp,
        port: tu.port || (tu.protocol === 'http:' ? 80 : 443),
        servername: tHost !== finalIp ? tHost : undefined,
        path: tu.pathname + tu.search,
        method,
        headers: h,
        timeout: 10000,
        rejectUnauthorized: false,
      }, (res: any) => {
        const chunks: Buffer[] = []
        res.on('data', (d: Buffer) => chunks.push(d))
        res.on('end', () => {
          const rh: Record<string, string> = {}
          for (const [k, v] of Object.entries(res.headers)) rh[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : String(v)
          const buf = Buffer.concat(chunks)
          // 跟随重定向（MediaMTX cookie 校验 302），最多 3 跳
          if (hops < 3 && res.statusCode >= 300 && res.statusCode < 400 && rh.location) {
            const setCookies = res.headers['set-cookie']
            const nextCookie = Array.isArray(setCookies) ? setCookies.map((c: string) => c.split(';')[0]).join('; ') : ''
            const nextUrl = new URL(rh.location, targetUrl).toString()
            once(nextUrl, nextCookie || cookie, hops + 1).then(resolve).catch(reject)
            return
          }
          resolve({ status: res.statusCode, headers: rh, body: binary ? buf.toString('base64') : buf.toString('utf8') })
        })
      })
      req.on('timeout', () => { req.destroy(); reject(new Error(`请求超时: ${method} ${tHost}`)) })
      req.on('error', (e: NodeJS.ErrnoException) => reject(new Error(e.code === 'ENOTFOUND' ? `域名无法解析: ${tHost}` : e.message)))
      if (body !== undefined) req.write(body)
      req.end()
    })
  }
  const result = await once(url)
  return result
}
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
// url 缓存当前公网地址，进程存活时复用，避免反复 kill 重建导致域名失效
const mediaTunnel = { proc: null as ChildProcess | null, url: null as string | null }
const roomTunnel = { proc: null as ChildProcess | null, url: null as string | null }

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
  killProcess(mediaTunnel.proc, 'Cloudflared(媒体)'); mediaTunnel.proc = null; mediaTunnel.url = null
  killProcess(roomTunnel.proc, 'Cloudflared(房间)'); roomTunnel.proc = null; roomTunnel.url = null
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

/** 启动一个 cloudflared 快速隧道，映射到本地端口，返回公网 https URL。
 *  - 复用：若 holder 已有存活隧道（进程在、URL 已记录），直接返回缓存 URL，避免反复 kill 重建
 *    导致旧域名 DNS 记录被移除、参会者全部失联（曾出现 ERR_NAME_NOT_RESOLVED 故障）
 *  - 守护：进程意外退出时自动重建（quick tunnel 域名每次变化，重建后通过 log 通知）
 */
const startCloudflaredTunnel = async (localPort: number, holder: { proc: ChildProcess | null; url: string | null }): Promise<string> => {
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

  // 复用：进程存活且已有 URL
  if (holder.proc && !holder.proc.killed && holder.url) {
    console.log('[Cloudflared] 复用现有隧道:', holder.url)
    return holder.url
  }

  const spawnTunnel = (): Promise<string> => {
    if (holder.proc) { killProcess(holder.proc, 'Cloudflared(旧隧道)'); holder.proc = null }
    holder.url = null
    const proc = spawn(cfPath, ['tunnel', '--url', `http://localhost:${localPort}`, '--protocol', 'http2', '--no-autoupdate'], { env: noProxyEnv(), windowsHide: true })
    holder.proc = proc
    proc.stderr?.on('data', (d) => { const m = d.toString().trim(); if (m) { console.log('[Cloudflared]', m); sendLog(`[Cloudflared] ${m}`) } })
    proc.stdout?.on('data', (d) => { const m = d.toString().trim(); if (m) { console.log('[Cloudflared]', m); sendLog(`[Cloudflared] ${m}`) } })
    // 进程守护：意外退出（非主动 kill）时自动重建
    proc.on('exit', (code, signal) => {
      if (!proc.killed && holder.proc === proc) {
        holder.proc = null
        holder.url = null
        const reason = signal ? `signal ${signal}` : `code ${code}`
        console.warn(`[Cloudflared] 隧道进程意外退出(${reason})，将自动重建`)
        sendLog('[Cloudflared] 隧道连接中断，正在自动重建...')
        setTimeout(() => {
          if (!holder.proc && !holder.url) {
            spawnTunnel().then((url) => {
              holder.url = url
              sendLog(`[Cloudflared] 隧道已重建: ${url}（域名已变化，如需共享请重新开始共享）`)
            }).catch((e) => sendLog(`[Cloudflared] 隧道重建失败: ${e.message}`))
          }
        }, 3000)
      }
    })
    return new Promise<string>((resolve, reject) => {
      const done = (url: string) => { clearTimeout(timer); resolve(url) }
      const fail = (err: Error) => { clearTimeout(timer); reject(err) }
      let resolved = false
      const check = (data: string) => {
        const m = data.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
        if (m && !resolved) { resolved = true; sendLog(`[Cloudflared] 隧道已建立: ${m[0]}`); done(m[0]) }
      }
      proc.stderr?.on('data', (d) => check(d.toString()))
      proc.stdout?.on('data', (d) => check(d.toString()))
      proc.on('error', (e) => fail(e))
      proc.on('close', (code) => { if (!resolved) fail(new Error(`Cloudflared 进程退出(code ${code})`)) })
      const timer = setTimeout(() => { fail(new Error('Cloudflared 隧道启动超时')) }, 90000)
    })
  }

  const url = await spawnTunnel()
  holder.url = url
  // DNS 可达性预检：域名刚注册时本机 DNS 可能尚未生效，等待并确认可解析/可访问
  await verifyTunnelReachable(url, 3)
  return url
}

/** 验证隧道公网域名可访问（DNS 解析 + HTTPS GET），失败重试 */
const verifyTunnelReachable = async (url: string, attempts = 3): Promise<void> => {
  const { host } = new URL(url)
  for (let i = 0; i < attempts; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = require('https').request({ host, path: '/', method: 'GET', timeout: 10000 }, (res: any) => {
          res.resume()
          // 2xx/3xx/4xx 均视为可达（4xx 是应用层响应，说明隧道已连通）
          resolve()
        })
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
        req.on('error', reject)
        req.end()
      })
      console.log(`[Cloudflared] 隧道可达性验证通过: ${url}`)
      return
    } catch (e) {
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 3000))
      else console.warn(`[Cloudflared] 隧道可达性验证未通过: ${(e as Error).message}（可能需数秒后生效）`)
    }
  }
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
  // 确保 MediaMTX 已启动（幂等）
  const ensureMediamtx = async (): Promise<void> => {
    if (mediamtxProcess) return
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

  const STREAM_KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const genStreamKey = (): string =>
    Array.from(randomBytes(6), (b) => STREAM_KEY_ALPHABET[b % STREAM_KEY_ALPHABET.length]).join('')

  // 媒体隧道（后台进行，供 getStreamUrl 等待）
  let pendingMediaTunnel: Promise<string> | null = null
  let mediaTunnelUrl: string | null = null

  // 开始共享：启动 MediaMTX 并立即返回密钥；隧道在后台并行建立，
  // 渲染进程可同时配置 OBS 推流，待 getStreamUrl 就绪后再注册共享
  ipcMain.handle('startStreaming', async (): Promise<{ streamKey: string }> => {
    await ensureMediamtx()
    const streamKey = genStreamKey()
    // 复用已建隧道（进程存活时 startCloudflaredTunnel 直接返回缓存 URL）
    if (!pendingMediaTunnel) {
      pendingMediaTunnel = startCloudflaredTunnel(8888, mediaTunnel)
      pendingMediaTunnel
        .then((url) => { mediaTunnelUrl = url })
        .catch((e) => console.error('[Cloudflared] 媒体隧道失败:', e))
    }
    return { streamKey }
  })
  // 获取公网媒体地址（等待后台隧道就绪）
  ipcMain.handle('getStreamUrl', async (): Promise<string> => {
    if (mediaTunnelUrl) return mediaTunnelUrl
    if (!pendingMediaTunnel) throw new Error('尚未开始共享')
    mediaTunnelUrl = await pendingMediaTunnel
    return mediaTunnelUrl
  })
  ipcMain.handle('stopStreaming', async (): Promise<void> => {
    killProcess(mediamtxProcess, 'MediaMTX'); mediamtxProcess = null
    killProcess(mediaTunnel.proc, 'Cloudflared(媒体)'); mediaTunnel.proc = null
    pendingMediaTunnel = null; mediaTunnelUrl = null
    mediaTunnel.url = null
  })
  // 预热：提前启动 MediaMTX（开始共享时复用，缩短等待）
  ipcMain.handle('warmupMedia', async (): Promise<void> => {
    await ensureMediamtx()
  })
  // 画质档位：改写 OBS 高级模式编码器配置（streamEncoder.json）
  // bitrate=推流码率；keyint_sec=关键帧间隔(1s)——LL-HLS 分片依赖关键帧，
  // 间隔过大会导致画面出现慢、延迟高（实测默认 10.5s -> 1s 后 3.6s）
  const OBS_PROFILE_DIR = path.join(process.env.APPDATA || '', 'obs-studio', 'basic', 'profiles')
  const QUALITY_MODES: Record<string, number> = { smooth: 1200, smart: 3000, clear: 6000 }
  ipcMain.handle('setQualityMode', async (_e, mode: string): Promise<boolean> => {
    const bitrate = QUALITY_MODES[mode]
    if (!bitrate) return false
    try {
      const profileDir = fs.readdirSync(OBS_PROFILE_DIR, { withFileTypes: true })
        .find((d) => d.isDirectory())?.name
      if (!profileDir) return false
      const encoderFile = path.join(OBS_PROFILE_DIR, profileDir, 'streamEncoder.json')
      if (!fs.existsSync(encoderFile)) return false
      const cfg = JSON.parse(fs.readFileSync(encoderFile, 'utf-8'))
      cfg.rate_control = 'CBR'
      cfg.bitrate = bitrate
      cfg.keyint_sec = 1
      fs.writeFileSync(encoderFile, JSON.stringify(cfg), 'utf-8')
      console.log(`[画质] ${mode} -> ${bitrate}kbps, keyint 1s`)
      return true
    } catch (e) {
      console.error('[画质] 设置失败:', e)
      return false
    }
  })
  ipcMain.handle('getQualityMode', async (): Promise<string> => {
    try {
      const profileDir = fs.readdirSync(OBS_PROFILE_DIR, { withFileTypes: true })
        .find((d) => d.isDirectory())?.name
      if (!profileDir) return 'smart'
      const encoderFile = path.join(OBS_PROFILE_DIR, profileDir, 'streamEncoder.json')
      if (!fs.existsSync(encoderFile)) return 'smart'
      const cfg = JSON.parse(fs.readFileSync(encoderFile, 'utf-8'))
      const bitrate = Number(cfg.bitrate || 0)
      return bitrate <= 1500 ? 'smooth' : bitrate >= 5000 ? 'clear' : 'smart'
    } catch {
      return 'smart'
    }
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
    roomTunnel.url = null
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

  ipcMain.handle('checkObsConnection', async () => {    const net = require('net')
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
  // 主进程代理 HTTP 请求（DoH 绕过 DNS 污染）：渲染层房间同步/WHEP 信令/HLS 播放全部走此通道
  ipcMain.handle('proxyFetch', async (_e, method: string, url: string, body?: string, extraHeaders?: Record<string, string>, binary = false) => {
    return await proxyRequest(method, url, body, extraHeaders, binary)
  })
  // 公网隧道可达性：区分"隧道失效(DNS/连接)"与"推流未到(应用层)"两类故障
  // 远端 B 端"启动共享失败"常因 A 端房间隧道域名失效（ERR_NAME_NOT_RESOLVED/530），
  // 渲染层在报错前可借此给出明确指引
  ipcMain.handle('checkTunnelReachable', async (_e, url: string) => {
    try {
      const u = new URL(url)
      await new Promise<void>((resolve, reject) => {
        const req = require('https').request({ host: u.host, path: u.pathname || '/', method: 'GET', timeout: 8000 }, (res: any) => {
          res.resume()
          resolve()
        })
        req.on('timeout', () => { req.destroy(); reject(new Error('连接超时')) })
        req.on('error', (err: NodeJS.ErrnoException) => {
          // ENOTFOUND = DNS 解析失败（隧道域名已失效）；ECONNREFUSED = 隧道离线
          reject(new Error(err.code === 'ENOTFOUND' ? '域名无法解析（隧道已失效）' : err.code === 'ECONNREFUSED' ? '隧道离线' : err.message))
        })
        req.end()
      })
      return { ok: true, reason: '' }
    } catch (e) {
      return { ok: false, reason: (e as Error).message }
    }
  })
}
