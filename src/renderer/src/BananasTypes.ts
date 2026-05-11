export type PcConnectRemoteCursorData = {
  id: string
  name: string
  color: string
  x: number
  y: number
}

type IceServer = {
  urls: string
  username?: string
  credential?: string
}

export type SettingsData = {
  username: string
  color: string
  language: string
  isMicrophoneEnabledOnConnect: boolean
  iceServers: IceServer[]
}
