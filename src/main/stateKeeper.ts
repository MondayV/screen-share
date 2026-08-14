import { screen } from 'electron'
import settings from 'electron-settings'
import { debounce } from './utils'

export type SettingsData = {
  username: string
  color: string
  language: string
}

type Settings = {
  get: () => SettingsData
  set: (data: SettingsData) => void
}

type WindowState = {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

type WindowStateKeeper = WindowState & {
  track: (win: Electron.BrowserWindow) => void
}

export const settingsKeeper = async (): Promise<Settings> => {
  const defaultSettings: SettingsData = {
    username: 'PC用户',
    color: '#ffffff',
    language: 'zh'
  }

  const get = (): SettingsData => {
    const username = settings.getSync('username') as string || defaultSettings.username
    const color = settings.getSync('color') as string || defaultSettings.color
    const language = settings.getSync('language') as string || defaultSettings.language

    return {
      username,
      color,
      language
    }
  }

  const set = (data: SettingsData): void => {
    settings.setSync('username', data.username)
    settings.setSync('color', data.color)
    settings.setSync('language', data.language)
  }

  return {
    get,
    set
  }
}

export const windowStateKeeper = async (windowName: string): Promise<WindowStateKeeper> => {
  let window: Electron.BrowserWindow
  let windowState: WindowState

  const eventHandlingDelay = 100
  const setBounds = debounce(() => {
    if (!window) return
    const bounds = window.getBounds()
    windowState.x = bounds.x
    windowState.y = bounds.y
    windowState.width = bounds.width
    windowState.height = bounds.height
    settings.setSync(`windowState.${windowName}`, windowState)
  }, eventHandlingDelay)

  const setMaximized = (): void => {
    windowState.isMaximized = window.isMaximized()
    settings.setSync(`windowState.${windowName}`, windowState)
  }

  const defaultState: WindowState = {
    width: 1200,
    height: 800,
    isMaximized: false
  }

  const currentState = settings.getSync(`windowState.${windowName}`) as WindowState | undefined
  windowState = { ...defaultState, ...currentState }

  // 校验保存的位置是否仍在某个显示器内，避免显示器变更后窗口跑到屏幕外
  if (windowState.x !== undefined && windowState.y !== undefined) {
    const isVisible = screen.getAllDisplays().some((display) => {
      const wa = display.workArea
      return (
        windowState.x! < wa.x + wa.width &&
        windowState.x! + windowState.width > wa.x &&
        windowState.y! < wa.y + wa.height &&
        windowState.y! + windowState.height > wa.y
      )
    })
    if (!isVisible) {
      windowState.x = undefined
      windowState.y = undefined
    }
  }

  const track = (win: Electron.BrowserWindow): void => {
    window = win
    ;['resize', 'move'].forEach((event) => {
      win.on(event as any, setBounds)
    })
    win.on('maximize', setMaximized)
    win.on('unmaximize', setMaximized)
  }

  return {
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    isMaximized: windowState.isMaximized,
    track
  }
}
