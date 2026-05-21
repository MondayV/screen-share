import OBSWebSocket from 'obs-websocket-js'

let obs: OBSWebSocket | null = null

async function getOBSPassword(): Promise<string> {
  try {
    return await window.PcConnectApi.getObsPassword()
  } catch {
    return ''
  }
}

export async function connectToOBS(): Promise<void> {
  obs = new OBSWebSocket()
  const password = await getOBSPassword()
  try {
    await obs.connect('ws://localhost:4455', password)
  } catch (err) {
    const msg = (err as Error).message || ''
    if (msg.includes('authentication') || msg.includes('Authentication')) {
      throw new Error('OBS 密码错误，请在设置中更新 WebSocket 密码')
    }
    throw new Error('无法连接到 OBS，请确认 OBS 已启动并开启 WebSocket 服务')
  }
}

export async function startStream(): Promise<void> {
  if (!obs) throw new Error('OBS 未连接')
  await obs.call('StartStream')
}

export async function stopStream(): Promise<void> {
  if (!obs) return
  try { await obs.call('StopStream') } catch {}
}

export function disconnectOBS(): void {
  if (!obs) return
  try { obs.disconnect() } catch {}
  obs = null
}
