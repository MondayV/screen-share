import { screen } from 'electron'
import settings from 'electron-settings'
import { debounce } from './utils'

type IceServer = {
  urls: string
  username?: string
  credential?: string
}

export type SettingsData = {
  username: string
  color: string
  language: string
  serverUrl: string
  isMicrophoneEnabledOnConnect: boolean
  iceServers: IceServer[]
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
    language: 'zh',
    serverUrl: 'http://localhost:3456',
    isMicrophoneEnabledOnConnect: true,
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }

  const get = (): SettingsData => {
    const username = settings.getSync('username') as string || defaultSettings.username
    const color = settings.getSync('color') as string || defaultSettings.color
    const language = settings.getSync('language') as string || defaultSettings.language
    const serverUrl = settings.getSync('serverUrl') as string || defaultSettings.serverUrl
    const isMicrophoneEnabledOnConnect = settings.getSync('isMicrophoneEnabledOnConnect') as boolean ?? defaultSettings.isMicrophoneEnabledOnConnect
    const iceServers = settings.getSync('iceServers') as IceServer[] || defaultSettings.iceServers

    return {
      username,
      color,
      language,
      serverUrl,
      isMicrophoneEnabledOnConnect,
      iceServers
    }
  }

  const set = (data: SettingsData): void => {
    settings.setSync('username', data.username)
    settings.setSync('color', data.color)
    settings.setSync('language', data.language)
    settings.setSync('serverUrl', data.serverUrl)
    settings.setSync('isMicrophoneEnabledOnConnect', data.isMicrophoneEnabledOnConnect)
    settings.setSync('iceServers', data.iceServers)
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
