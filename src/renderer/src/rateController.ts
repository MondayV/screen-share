type QualityPreset = 'auto' | 'quality' | 'smooth'

interface StatsSnapshot {
  packetsLost: number
  packetsSent: number
  rtt: number
  lossRate: number
}

let pollingTimer: ReturnType<typeof setInterval> | null = null
let currentPreset: QualityPreset = 'auto'
let lastGoodState = 0

export function setQualityPreset(preset: QualityPreset) {
  currentPreset = preset
}

export function startRateControl(pc: RTCPeerConnection) {
  if (pollingTimer) clearInterval(pollingTimer)

  pollingTimer = setInterval(async () => {
    try {
      const stats = await pc.getStats()
      let packetsLost = 0, packetsSent = 0, rtt = 0

      stats.forEach((report: any) => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          packetsLost = report.packetsLost || 0
          packetsSent = (report.packetsReceived || 0) + packetsLost
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          rtt = report.currentRoundTripTime || 0
        }
      })

      const lossRate = packetsSent > 0 ? packetsLost / packetsSent : 0

      if (currentPreset === 'auto') {
        applyAdaptiveBitrate(pc, { packetsLost, packetsSent, rtt, lossRate })
      }
    } catch { /* stats may fail */ }
  }, 3000)
}

function applyAdaptiveBitrate(pc: RTCPeerConnection, s: StatsSnapshot) {
  const senders = pc.getSenders().filter(s => s.track?.kind === 'video')
  if (senders.length === 0) return

  const now = Date.now()

  if (s.lossRate > 0.15 || s.rtt > 0.5) {
    // Heavy degradation: 480p, 15fps, 800kbps
    applyEncoderParams(senders, { scaleResolutionDownBy: 2, maxFramerate: 15, maxBitrate: 800000 })
  } else if (s.lossRate > 0.05 || s.rtt > 0.3) {
    // Moderate: 720p, 20fps, 1.5Mbps
    applyEncoderParams(senders, { scaleResolutionDownBy: 1.5, maxFramerate: 20, maxBitrate: 1500000 })
  } else if (s.lossRate < 0.02) {
    lastGoodState = now
  }

  // Restore quality after 10s of good conditions
  if (now - lastGoodState > 10000 && s.lossRate < 0.02 && s.rtt < 0.2) {
    applyEncoderParams(senders, { scaleResolutionDownBy: 1, maxFramerate: 30, maxBitrate: 4000000 })
  }
}

function applyEncoderParams(senders: RTCRtpSender[], params: {
  scaleResolutionDownBy: number
  maxFramerate: number
  maxBitrate: number
}) {
  senders.forEach(async (sender) => {
    const p = sender.getParameters()
    if (!p.encodings) p.encodings = [{}]
    p.encodings[0].scaleResolutionDownBy = params.scaleResolutionDownBy
    p.encodings[0].maxFramerate = params.maxFramerate
    p.encodings[0].maxBitrate = params.maxBitrate
    try { await sender.setParameters(p) } catch { /* may not be supported */ }
  })
}

export function stopRateControl() {
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null }
}
