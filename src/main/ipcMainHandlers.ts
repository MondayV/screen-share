import type { SettingsData } from './stateKeeper'
import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { createCursorsWindow } from './cursors'
import { settingsKeeper } from './stateKeeper'
import { spawn, ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'

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
let cloudflaredProcess: ChildProcess | null = null

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
  killProcess(cloudflaredProcess, 'Cloudflared'); cloudflaredProcess = null
}

export const ipcMainHandlersInit = (): void => {
  const availableDimensions = screen.getPrimaryDisplay().workAreaSize
  let remoteCursorsWindow: BrowserWindow | null = null
  let remoteCursorsActive = false

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
    const env = { ...process.env }
    delete env.http_proxy; delete env.https_proxy
    delete env.HTTP_PROXY; delete env.HTTPS_PROXY

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

    const startTunnel = async (): Promise<string> => {
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
      if (cloudflaredProcess) { cloudflaredProcess.kill(); cloudflaredProcess = null }
      cloudflaredProcess = spawn(cfPath, ['tunnel', '--url', 'http://localhost:8888', '--protocol', 'http2', '--no-autoupdate'], { env, windowsHide: true })
      let buffer = ''
      cloudflaredProcess.stderr?.on('data', (d) => { const m = d.toString(); buffer += m; console.log('[Cloudflared]', m.trim()); sendLog(`[Cloudflared] ${m.trim()}`) })
      cloudflaredProcess.stdout?.on('data', (d) => { const m = d.toString(); buffer += m; console.log('[Cloudflared]', m.trim()); sendLog(`[Cloudflared] ${m.trim()}`) })
      return new Promise<string>((resolve, reject) => {
        const done = (url: string) => { clearTimeout(timer); resolve(url) }
        const fail = (err: Error) => { clearTimeout(timer); reject(err) }
        const check = (data: string) => {
          const m = data.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
          if (m) { sendLog(`[Cloudflared] 隧道已建立: ${m[0]}`); done(m[0]) }
        }
        cloudflaredProcess!.stderr?.on('data', (d) => check(d.toString()))
        cloudflaredProcess!.stdout?.on('data', (d) => check(d.toString()))
        cloudflaredProcess!.on('error', (e) => fail(e))
        cloudflaredProcess!.on('close', (code) => fail(new Error(`Cloudflared 进程退出(code ${code})`)))
        const timer = setTimeout(() => { fail(new Error('Cloudflared 隧道启动超时')) }, 90000)
      })
    }

    const publicUrl = await startTunnel()
    // 加密级随机密钥（36 进制大写字母数字），避免使用 Math.random
    const STREAM_KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const streamKey = Array.from(randomBytes(6), (b) => STREAM_KEY_ALPHABET[b % STREAM_KEY_ALPHABET.length]).join('')
    return { publicUrl, streamKey }
  })
  ipcMain.handle('stopStreaming', async (): Promise<void> => {
    stopAllProcesses()
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
  ipcMain.handle('checkObsConnection', async () => {
    const net = require('net')
    return new Promise((resolve) => {
      const s = net.createConnection({ host: '127.0.0.1', port: 4455 })
      s.setTimeout(3000)
      s.on('connect', () => { s.end(); resolve({ connected: true, reason: '' }) })
      s.on('timeout', () => { s.destroy(); resolve({ connected: false, reason: 'OBS WebSocket 连接超时' }) })
      s.on('error', () => { s.destroy(); resolve({ connected: false, reason: '无法连接 OBS，请确认 OBS 已启动并开启 WebSocket 服务' }) })
    })
  })
  ipcMain.handle('checkPathActive', async (_e, streamKey: string) => {
    const http = require('http')
    return new Promise((resolve) => {
      const req = http.request({ hostname: 'localhost', port: 8888, path: `/${streamKey}/index.m3u8`, method: 'GET', timeout: 3000 }, (res: any) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve({ active: true, reason: '' })
        } else if (res.statusCode === 404) {
          resolve({ active: false, reason: '推流未到达，请检查 OBS 推流密钥是否填写正确' })
        } else {
          resolve({ active: false, reason: `推流异常 (${res.statusCode})` })
        }
      })
      req.on('timeout', () => { req.destroy(); resolve({ active: false, reason: '查询超时，请确认 MediaMTX 已启动' }) })
      req.on('error', () => { resolve({ active: false, reason: '无法查询推流状态，请确认 MediaMTX 已启动' }) })
      req.end()
    })
  })
}
