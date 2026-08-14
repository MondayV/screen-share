import { ElectronAPI } from '@electron-toolkit/preload'

type DiagResult = {
  name: string
  status: string
  message: string
  suggestion: string
}

type ObsConnectionStatus = {
  connected: boolean
  reason: string
}

type PathActiveStatus = {
  active: boolean
  reason: string
}

type StreamResult = {
  publicUrl: string
  streamKey: string
}

type SettingsData = {
  username: string
  color: string
  language: string
}

type RemoteCursorState = {
  id: string
  name: string
  color: string
  x: number
  y: number
}

type PushConfig = {
  server: string
  key: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    PcConnectApi: {
      // ---- 设置 ----
      getSettings: () => Promise<SettingsData>
      updateSettings: (settings: SettingsData) => Promise<void>

      // ---- 应用信息 ----
      getAppVersion: () => Promise<string>

      // ---- 流媒体 ----
      startStreaming: () => Promise<StreamResult>
      stopStreaming: () => Promise<void>

      // ---- OBS 密码 ----
      saveObsPassword: (pwd: string) => Promise<boolean>
      getObsPassword: () => Promise<string>

      // ---- 远程光标 ----
      toggleRemoteCursors: (state: boolean) => Promise<void>
      remoteCursorPing: (cursorId: string) => Promise<void>
      updateRemoteCursor: (state: RemoteCursorState) => Promise<void>

      // ---- 诊断 ----
      runDiagnostics: () => Promise<DiagResult[]>

      // ---- 状态检查 ----
      checkObsConnection: () => Promise<ObsConnectionStatus>
      checkPathActive: (key: string) => Promise<PathActiveStatus>

      // ---- 日志 ----
      onLogMessage: (cb: (msg: string) => void) => () => void

      // ---- 退出 ----
      onConfirmExit: (cb: () => void) => void
      forceClose: () => void

      // ---- OBS 一键推流 (Python) ----
      writePushConfig: (data: PushConfig) => Promise<boolean>
      openObsScriptFolder: () => Promise<boolean>
    }
  }
}
