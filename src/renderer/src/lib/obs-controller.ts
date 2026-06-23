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
  // 断开已有连接，避免连接泄漏
  if (obs) {
    try {
      const status = await obs.call('GetStats').catch(() => null)
      if (status) return // 已有活跃连接，复用
    } catch { /* 连接已失效，重建 */ }
    disconnectOBS()
  }
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
  fpsPrevFrames = 0
  fpsPrevTime = 0
}

let fpsPrevFrames = 0
let fpsPrevTime = 0

export async function getObsFps(): Promise<number> {
  if (!obs) return 0
  try {
    const stats = await obs.call('GetStats')
    const totalFrames = (stats as any).outputTotalFrames as number || 0
    const now = Date.now()
    if (fpsPrevFrames === 0) {
      fpsPrevFrames = totalFrames
      fpsPrevTime = now
      return 0
    }
    const dt = (now - fpsPrevTime) / 1000
    if (dt < 0.5) return 0
    const fps = (totalFrames - fpsPrevFrames) / dt
    fpsPrevFrames = totalFrames
    fpsPrevTime = now
    return Math.round(fps * 10) / 10
  } catch {
    return 0
  }
}
