import type OBSWebSocketType from 'obs-websocket-js'

let obs: InstanceType<typeof OBSWebSocketType> | null = null

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
  // 按需加载（仅共享时需要），减小应用首屏体积
  const OBSWebSocket = (await import('obs-websocket-js')).default
  obs = new OBSWebSocket()
  const password = await getOBSPassword()
  try {
    // OBS WebSocket 异常时可能"连上但不应答"，加超时避免共享流程永久卡住
    await Promise.race([
      obs.connect('ws://localhost:4455', password),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('连接超时')), 8000))
    ])
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

/**
 * 确保 OBS 推流到指定密钥路径（P1 修复）：
 * 应用生成的公网 URL 指向 /<key>/index.m3u8，因此 OBS 必须推流到该路径。
 * OBS 不允许在推流中修改推流服务配置，密钥不一致时需要先停流再配置。
 */
export async function startStreamWithKey(key: string): Promise<void> {
  if (!obs) throw new Error('OBS 未连接')
  if (!key) throw new Error('缺少串流密钥')

  const status = await obs.call('GetStreamStatus')
  const svc = await obs.call('GetStreamServiceSettings')
  const currentKey = svc?.streamServiceSettings?.key

  // 已在推目标密钥：直接复用，不打扰用户
  if (status.outputActive && currentKey === key) return

  // 正在推其他密钥：OBS 不允许流中改配置，先停止
  if (status.outputActive) {
    await obs.call('StopStream')
    // 轮询等待真正停止（最多 6 秒）
    for (let i = 0; i < 20; i++) {
      const s = await obs.call('GetStreamStatus')
      if (!s.outputActive) break
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  // 写入目标推流配置（rtmp_custom + 本机服务器 + 应用生成的密钥）
  await obs.call('SetStreamServiceSettings', {
    streamServiceType: 'rtmp_custom',
    streamServiceSettings: {
      server: 'rtmp://localhost:1935',
      key,
      use_auth: false
    }
  })

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
