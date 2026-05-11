import { BrowserWindow } from 'electron'
import { loadWindowContents } from './utils'
import path from 'path'

let cursorsWindow: BrowserWindow | null = null

export async function createCursorsWindow(): Promise<BrowserWindow> {
  const availableDimensions = await getAvailableDimensions()
  cursorsWindow = new BrowserWindow({
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false
    }
  })

  loadWindowContents(cursorsWindow, 'cursors.html')

  cursorsWindow.on('ready-to-show', () => {
    if (!cursorsWindow) return
    cursorsWindow.setBounds({
      width: availableDimensions.width,
      height: availableDimensions.height,
      x: 0,
      y: 0
    })
    cursorsWindow.showInactive()
  })

  return cursorsWindow
}

async function getAvailableDimensions(): Promise<{ width: number; height: number }> {
  const { screen } = require('electron')
  return screen.getPrimaryDisplay().workAreaSize
}
