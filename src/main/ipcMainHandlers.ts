import type { SettingsData } from './stateKeeper'
import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { createCursorsWindow } from './cursors'
import { settingsKeeper } from './stateKeeper'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'

function getMediaMTXPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tools', 'mediamtx.exe')
  }
  return 'C:\\mediamtx\\mediamtx.exe'
}

function getCloudflaredPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tools', 'cloudflared.exe')
  }
  const userProfile = process.env.USERPROFILE || 'C:\\Users\\MONv'
  const candidates = [
    path.join(userProfile, 'scoop', 'apps', 'cloudflared', 'current', 'cloudflared.exe'),
    path.join(userProfile, 'scoop', 'shims', 'cloudflared.exe'),
    'C:\\Windows\\System32\\cloudflared.exe'
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return 'cloudflared.exe'
}

export const ipcMainHandlersInit = (): void => {
  const availableDimensions = screen.getPrimaryDisplay().workAreaSize
  let remoteCursorsWindow: BrowserWindow | null = null
  let remoteCursorsActive = false
  let mediamtxProcess: ChildProcess | null = null
  let cloudflaredProcess: ChildProcess | null = null

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
      mediamtxProcess.stderr?.on('data', (d) => console.log('[MediaMTX]', d.toString().trim()))
      mediamtxProcess.stdout?.on('data', (d) => console.log('[MediaMTX]', d.toString().trim()))
      const timeout = setTimeout(() => {
        mediamtxProcess?.kill()
        throw new Error('MediaMTX 启动超时（30秒），请重试或重启应用')
      }, 30000)
      try {
        await new Promise<void>((resolve, reject) => {
          mediamtxProcess!.stdout?.on('data', (d) => {
            if (d.toString().includes('HLS') || d.toString().includes('ready')) { clearTimeout(timeout); resolve() }
          })
          mediamtxProcess!.stderr?.on('data', (d) => {
            if (d.toString().includes('HLS') || d.toString().includes('ready')) { clearTimeout(timeout); resolve() }
          })
          mediamtxProcess!.on('error', (e) => { clearTimeout(timeout); reject(e) })
        })
      } catch { clearTimeout(timeout); throw new Error('MediaMTX 启动失败') }
    }
    const env = { ...process.env }
    delete env.http_proxy; delete env.https_proxy
    delete env.HTTP_PROXY; delete env.HTTPS_PROXY

    const startTunnel = async (): Promise<string> => {
      const cfPath = getCloudflaredPath()
      console.log('[Cloudflared] 使用路径:', cfPath)
      if (cloudflaredProcess) { cloudflaredProcess.kill(); cloudflaredProcess = null }
      cloudflaredProcess = spawn(cfPath, ['tunnel', '--url', 'http://localhost:8888', '--no-autoupdate'], { env, windowsHide: true })
      let buffer = ''
      cloudflaredProcess.stderr?.on('data', (d) => { buffer += d.toString(); console.log('[Cloudflared]', d.toString().trim()) })
      cloudflaredProcess.stdout?.on('data', (d) => { buffer += d.toString(); console.log('[Cloudflared]', d.toString().trim()) })
      return new Promise<string>((resolve, reject) => {
        const done = (url: string) => { clearTimeout(timer); resolve(url) }
        const fail = (err: Error) => { clearTimeout(timer); reject(err) }
        const check = (data: string) => {
          const m = data.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
          if (m) done(m[0])
        }
        cloudflaredProcess!.stderr?.on('data', (d) => check(d.toString()))
        cloudflaredProcess!.stdout?.on('data', (d) => check(d.toString()))
        cloudflaredProcess!.on('error', (e) => fail(e))
        cloudflaredProcess!.on('close', (code) => fail(new Error(`Cloudflared 进程退出(code ${code})`)))
        const timer = setTimeout(() => { fail(new Error('Cloudflared 隧道启动超时')) }, 90000)
      })
    }

    const publicUrl = await startTunnel()
    const streamKey = Math.random().toString(36).slice(2, 8).toUpperCase()
    return { publicUrl, streamKey }
  })
  ipcMain.handle('stopStreaming', async (): Promise<void> => {
    if (mediamtxProcess) { mediamtxProcess.kill(); mediamtxProcess = null }
    if (cloudflaredProcess) { cloudflaredProcess.kill(); cloudflaredProcess = null }
  })
}
