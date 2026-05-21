import OBSWebSocket from 'obs-websocket-js'

let obs: OBSWebSocket | null = null

export async function connectToOBS(password?: string): Promise<void> {
  obs = new OBSWebSocket()
  await obs.connect('ws://localhost:4455', password || '')
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
