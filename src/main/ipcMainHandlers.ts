import type { SettingsData } from './stateKeeper'
import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { createCursorsWindow } from './cursors'
import { createFloatingWindow, closeFloatingWindow, isFloatingWindowOpen } from './floatingWindow'
import { settingsKeeper } from './stateKeeper'
import { getLocalIP } from './local-ip'
import os from 'os'

let robot: any = null
try { robot = require('robotjs') } catch { /* optional */ }

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

  ipcMain.handle('getLocalIPs', (): string[] => {
    const interfaces = os.networkInterfaces()
    const ips: string[] = []
    for (const [, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          ips.push(addr.address)
        }
      }
    }
    return ips
  })

  ipcMain.handle('get-signaling-address', async (): Promise<string> => {
    return `ws://${getLocalIP()}:3456`
  })

  ipcMain.handle('isTestMode', async (): Promise<boolean> => {
    return process.argv.some((arg) => arg.includes('test2'))
  })

  // Floating window
  ipcMain.handle('toggleFloatingWindow', async (_, show: boolean) => {
    if (show) {
      await createFloatingWindow()
    } else {
      closeFloatingWindow()
    }
  })

  ipcMain.on('floating-mic-toggle', () => {
    if (MAIN_WINDOW() && !MAIN_WINDOW().isDestroyed()) {
      MAIN_WINDOW().webContents.send('floating-mic-toggle')
    }
  })

  ipcMain.on('floating-restore', () => {
    closeFloatingWindow()
    if (MAIN_WINDOW() && !MAIN_WINDOW().isDestroyed()) {
      MAIN_WINDOW().restore()
      MAIN_WINDOW().focus()
    }
  })

  ipcMain.on('floating-end', () => {
    closeFloatingWindow()
    if (MAIN_WINDOW() && !MAIN_WINDOW().isDestroyed()) {
      MAIN_WINDOW().webContents.send('floating-end')
      MAIN_WINDOW().restore()
    }
  })
  // Remote control input injection
  ipcMain.handle('remote-control-mouse', async (_, data) => {
    if (!robot) return
    const { x, y, button, action } = data
    robot.moveMouse(x, y)
    if (action === 'down') robot.mouseToggle('down', button || 'left')
    if (action === 'up') robot.mouseToggle('up', button || 'left')
    if (action === 'click') robot.mouseClick(button || 'left')
  })

  ipcMain.handle('remote-control-key', async (_, data) => {
    if (!robot) return
    const { key, action } = data
    if (action === 'down') robot.keyToggle(key, 'down')
    if (action === 'up') robot.keyToggle(key, 'up')
    if (action === 'tap') robot.keyTap(key)
  })
}

// Need access to MAIN_WINDOW
let MAIN_WINDOW: () => BrowserWindow
export const setMainWindow = (getter: () => BrowserWindow) => { MAIN_WINDOW = getter }
