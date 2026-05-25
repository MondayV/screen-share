import { ipcRenderer } from 'electron'
import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

let HANDLE_URL_CLICKS = true

const onDocumentReady = (callback: () => void): void => {
  if (document.readyState !== 'complete') {
    document.addEventListener('DOMContentLoaded', callback)
  } else {
    callback()
  }
}

ipcRenderer.on('openPcConnectURL', (_, url) => {
  if (!HANDLE_URL_CLICKS) return
  onDocumentReady(() => {
    window.postMessage({ type: 'openPcConnectURL', url }, '*')
  })
})

type IceServer = {
  urls: string
  username?: string
  credential?: string
}

const PcConnectApi = {
  getAppVersion: async (): Promise<string> => {
    return await ipcRenderer.invoke('getAppVersion')
  },
  handleUrlClicks: (state: boolean | undefined): boolean => {
    if (state) HANDLE_URL_CLICKS = state
    return HANDLE_URL_CLICKS
  },
  getSettings: async (): Promise<{
    username: string
    color: string
    language: string
    isMicrophoneEnabledOnConnect: boolean
    iceServers: IceServer[]
  }> => {
    return await ipcRenderer.invoke('getSettings')
  },
  updateSettings: async (settings: {
    username: string
    color: string
    language: string
    isMicrophoneEnabledOnConnect: boolean
    iceServers: IceServer[]
  }): Promise<void> => {
    ipcRenderer.invoke('updateSettings', settings)
  },
  toggleRemoteCursors: async (state: boolean): Promise<void> => {
    ipcRenderer.invoke('toggleRemoteCursors', state)
  },
  remoteCursorPing: async (cursorId: string): Promise<void> => {
    ipcRenderer.invoke('remoteCursorPing', cursorId)
  },
  updateRemoteCursor: async (state: {
    id: string
    name: string
    color: string
    x: number
    y: number
  }): Promise<void> => {
    ipcRenderer.invoke('updateRemoteCursor', state)
  },
  startStreaming: async (): Promise<{ publicUrl: string; streamKey: string }> => {
    return await ipcRenderer.invoke('startStreaming')
  },
  stopStreaming: async (): Promise<void> => {
    ipcRenderer.invoke('stopStreaming')
  },
  saveObsPassword: async (pwd: string): Promise<boolean> => {
    return await ipcRenderer.invoke('save-obs-password', pwd)
  },
  getObsPassword: async (): Promise<string> => {
    return await ipcRenderer.invoke('get-obs-password')
  },
  runDiagnostics: async (): Promise<{ name: string; status: string; message: string; suggestion: string }[]> => {
    return await ipcRenderer.invoke('runDiagnostics')
  },
  checkObsConnection: async (): Promise<{ connected: boolean; reason: string }> => {
    return await ipcRenderer.invoke('checkObsConnection')
  },
  checkPathActive: async (key: string): Promise<{ active: boolean; reason: string }> => {
    return await ipcRenderer.invoke('checkPathActive', key)
  },
  onLogMessage: (cb: (msg: string) => void): (() => void) => {
    const handler = (_: any, msg: string) => cb(msg)
    ipcRenderer.on('log-message', handler)
    return () => ipcRenderer.removeListener('log-message', handler)
  }
}

try {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('PcConnectApi', PcConnectApi)
} catch (error) {
  console.error(error)
}
