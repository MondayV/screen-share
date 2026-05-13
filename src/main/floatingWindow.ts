import { BrowserWindow } from 'electron'
import path from 'path'

let floatingWindow: BrowserWindow | null = null

export async function createFloatingWindow(): Promise<BrowserWindow> {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.show()
    return floatingWindow
  }

  floatingWindow = new BrowserWindow({
    width: 260,
    height: 80,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false
    }
  })

  // Position at top-right
  const { screen } = require('electron')
  const { width } = screen.getPrimaryDisplay().workAreaSize
  floatingWindow.setPosition(width - 280, 20)

  if (process.env['ELECTRON_RENDERER_URL']) {
    floatingWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/floating.html')
  } else {
    floatingWindow.loadFile(path.join(__dirname, '../renderer/floating.html'))
  }

  floatingWindow.on('closed', () => { floatingWindow = null })
  return floatingWindow
}

export function closeFloatingWindow(): void {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.close()
    floatingWindow = null
  }
}

export function isFloatingWindowOpen(): boolean {
  return floatingWindow !== null && !floatingWindow.isDestroyed()
}
