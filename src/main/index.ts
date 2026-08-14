import { app, shell, BrowserWindow, session, safeStorage, ipcMain } from 'electron'
import path from 'path'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import icon from '../../resources/icon.png?asset'
import { windowStateKeeper } from './stateKeeper'
import { ipcMainHandlersInit, stopAllProcesses } from './ipcMainHandlers'
import { isInProductionMode } from './utils'

let MAIN_WINDOW: BrowserWindow

if (isInProductionMode()) {
  const SINGLE_INSTANCE_LOCK = app.requestSingleInstanceLock()

  if (!SINGLE_INSTANCE_LOCK) {
    app.quit()
  }
}

app.on('second-instance', () => {
  if (MAIN_WINDOW && !MAIN_WINDOW.isDestroyed()) {
    if (MAIN_WINDOW.isMinimized()) MAIN_WINDOW.restore()
    MAIN_WINDOW.focus()
  }
})

async function createWindow(): Promise<void> {
  const mainWindowState = await windowStateKeeper('main')

  MAIN_WINDOW = new BrowserWindow({
    width: mainWindowState.width,
    height: mainWindowState.height,
    minWidth: 400,
    minHeight: 200,
    x: mainWindowState.x,
    y: mainWindowState.y,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 安全基线：禁用 Node 集成、开启沙箱（Electron 安全清单要求）
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindowState.track(MAIN_WINDOW)

  MAIN_WINDOW.on('ready-to-show', () => {
    MAIN_WINDOW.show()
  })

  // 每次创建窗口都挂上退出确认，保证 macOS 上重建的窗口行为一致
  MAIN_WINDOW.on('close', (e) => {
    e.preventDefault()
    MAIN_WINDOW.webContents.send('confirm-exit')
  })

  MAIN_WINDOW.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    MAIN_WINDOW.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    MAIN_WINDOW.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (mainWindowState.isMaximized) {
    MAIN_WINDOW.maximize()
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('net.getpcconnect')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; connect-src 'self' ws: wss: https://*.trycloudflare.com https://*.workers.dev ws://localhost:4455 ws://127.0.0.1:4455; media-src 'self' blob: https://*.trycloudflare.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: blob:"
        ]
      }
    })
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMainHandlersInit()

  const passwordFile = path.join(app.getPath('userData'), 'obs-password.enc')
  ipcMain.handle('save-obs-password', (_e, pwd: string) => {
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(passwordFile, safeStorage.encryptString(pwd))
      return true
    }
    return false
  })
  ipcMain.handle('get-obs-password', () => {
    if (safeStorage.isEncryptionAvailable() && fs.existsSync(passwordFile)) {
      return safeStorage.decryptString(fs.readFileSync(passwordFile))
    }
    return ''
  })

  await createWindow()
  ipcMain.on('force-close', () => {
    if (MAIN_WINDOW && !MAIN_WINDOW.isDestroyed()) {
      MAIN_WINDOW.removeAllListeners('close')
      MAIN_WINDOW.close()
    }
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => { stopAllProcesses() })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
