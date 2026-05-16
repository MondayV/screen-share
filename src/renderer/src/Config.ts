type IceServer = {
  urls: string
  username?: string
  credential?: string
}

export const getRTCPeerConnectionConfig = async (): Promise<RTCConfiguration> => {
  const settings = await window.PcConnectApi.getSettings()

  // Test mode on same machine: STUN only, skip TURN for faster connection
  let isTest = false
  try { isTest = await window.PcConnectApi.isTestMode() } catch {}

  const iceServers = settings.iceServers
    .filter((server: IceServer) => {
      if (isTest && server.urls.startsWith('turn:')) return false
      return true
    })
    .map((server: IceServer) => {
      return {
        urls: server.urls,
        username: server.username,
        credential: server.credential
      }
    })

  return { iceServers }
}
