import type { SettingsData } from './stateKeeper'
import { app, BrowserWindow, ipcMain, screen, desktopCapturer } from 'electron'
import { createCursorsWindow } from './cursors'
import { settingsKeeper } from './stateKeeper'

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
  ipcMain.handle('getSources', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
    return sources.map(s => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }))
  })
  ipcMain.handle('simulateInput', async (_, data: { type: string; x: number; y: number }) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return
    const bounds = screen.getPrimaryDisplay().bounds
    const absX = Math.round(data.x * bounds.width)
    const absY = Math.round(data.y * bounds.height)

    if (data.type === 'mousemove') {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: absX, y: absY })
    } else if (data.type === 'mousedown' || data.type === 'mouseup') {
      win.webContents.sendInputEvent({
        type: data.type as 'mousedown' | 'mouseup',
        x: absX,
        y: absY,
        button: 'left',
        clickCount: 1
      })
    } else if (data.type === 'click') {
      win.webContents.sendInputEvent({ type: 'mousedown', x: absX, y: absY, button: 'left', clickCount: 1 })
      win.webContents.sendInputEvent({ type: 'mouseup', x: absX, y: absY, button: 'left', clickCount: 1 })
    } else if (data.type === 'contextmenu') {
      win.webContents.sendInputEvent({ type: 'mousedown', x: absX, y: absY, button: 'right', clickCount: 1 })
      win.webContents.sendInputEvent({ type: 'mouseup', x: absX, y: absY, button: 'right', clickCount: 1 })
    } else if (data.type === 'dblclick') {
      win.webContents.sendInputEvent({ type: 'mousedown', x: absX, y: absY, button: 'left', clickCount: 2 })
      win.webContents.sendInputEvent({ type: 'mouseup', x: absX, y: absY, button: 'left', clickCount: 2 })
    }
  })
}
