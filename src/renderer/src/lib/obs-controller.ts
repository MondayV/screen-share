import OBSWebSocket from 'obs-websocket-js'

let obs: OBSWebSocket | null = null

function getOBSPassword(): string {
  return localStorage.getItem('obs-websocket-password') || ''
}

export async function connectToOBS(): Promise<void> {
  obs = new OBSWebSocket()
  const password = getOBSPassword()
  await obs.connect('ws://localhost:4455', password)
}

export async function getStreamStatus(): Promise<boolean> {
  if (!obs) return false
  const { outputActive } = await obs.call('GetStreamStatus')
  return outputActive
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
