import { app, shell, BrowserWindow, session, desktopCapturer } from 'electron'
import path from 'path'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { windowStateKeeper } from './stateKeeper'
import { ipcMainHandlersInit, setMainWindow } from './ipcMainHandlers'
import { isInProductionMode } from './utils'
import { startSignalServer, stopSignalServer } from './signalServer'

const CUSTOM_PROTOCOL = 'pcconnect'

let MAIN_WINDOW: BrowserWindow

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL, process.execPath, [
      path.resolve(process.argv[1])
    ])
  }
} else {
  app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL)
}

if (isInProductionMode()) {
  const SINGLE_INSTANCE_LOCK = app.requestSingleInstanceLock()

  if (!SINGLE_INSTANCE_LOCK) {
    app.quit()
  }
}

const sendOpenPcConnectUrlToRenderer = (url: string): void => {
  MAIN_WINDOW.webContents.send('openPcConnectURL', url)
}

app.on('second-instance', (_, commandLine) => {
  if (MAIN_WINDOW) {
    if (MAIN_WINDOW.isMinimized()) MAIN_WINDOW.restore()
    MAIN_WINDOW.focus()
  }
  const url = commandLine.pop()
  if (url) sendOpenPcConnectUrlToRenderer(url)
})

app.on('open-url', (evt, url: string) => {
  evt.preventDefault()
  sendOpenPcConnectUrlToRenderer(url)
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
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: true
    }
  })

  mainWindowState.track(MAIN_WINDOW)

  session.defaultSession.setDisplayMediaRequestHandler((_, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({ video: sources[0] })
    })
  })

  MAIN_WINDOW.on('ready-to-show', () => {
    MAIN_WINDOW.show()
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

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMainHandlersInit()

  await createWindow()
  setMainWindow(() => MAIN_WINDOW)

  // Notify renderer that signaling server is ready
  const serverPort = await startSignalServer(3456)
  MAIN_WINDOW.webContents.send('signal-server-ready', serverPort)
  const coldStartUrl = process.argv.find((arg) => arg.startsWith(CUSTOM_PROTOCOL + '://'))
  if (coldStartUrl) {
    sendOpenPcConnectUrlToRenderer(coldStartUrl)
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopSignalServer()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
