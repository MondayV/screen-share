import { ipcRenderer } from 'electron'
import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const PcConnectApi = {
  getAppVersion: async (): Promise<string> => {
    return await ipcRenderer.invoke('getAppVersion')
  },
  getSettings: async (): Promise<{
    username: string
    color: string
    language: string
  }> => {
    return await ipcRenderer.invoke('getSettings')
  },
  updateSettings: async (settings: {
    username: string
    color: string
    language: string
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
  createMeeting: async (): Promise<{ roomUrl: string; roomId: string }> => {
    return await ipcRenderer.invoke('createMeeting')
  },
  stopMeeting: async (): Promise<void> => {
    ipcRenderer.invoke('stopMeeting')
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
  },
  onConfirmExit: (cb: () => void): void => {
    ipcRenderer.on('confirm-exit', () => cb())
  },
  forceClose: (): void => {
    ipcRenderer.send('force-close')
  },
  writePushConfig: (data: { server: string; key: string }): Promise<boolean> => {
    return ipcRenderer.invoke('write-push-config', data)
  },
  openObsScriptFolder: (): Promise<boolean> => {
    return ipcRenderer.invoke('open-obs-script-folder')
  }
}

try {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('PcConnectApi', PcConnectApi)
} catch (error) {
  console.error(error)
}
