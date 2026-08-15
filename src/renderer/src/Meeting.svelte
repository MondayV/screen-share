<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import Swal from 'sweetalert2'
  import { useNavigationEnabled } from './stores'
  import { connectToOBS, startStreamWithKey, stopStream, disconnectOBS, getObsFps } from './lib/obs-controller'
  import { ProxyHlsLoader, proxyHlsConfig } from './lib/proxy-hls-loader'

  const navigationEnabled = useNavigationEnabled()

  type ShareEntry = { id: string; name: string; streamUrl: string; whepUrl?: string; hlsUrl?: string }

  // hls.js 按需加载（仅观看时需要），减小首屏体积
  let HlsClass: typeof import('hls.js').default | null = null
  const getHls = async (): Promise<typeof import('hls.js').default> => {
    if (!HlsClass) HlsClass = (await import('hls.js')).default
    return HlsClass
  }

  // ---------- 视图与房间状态 ----------
  let mode: 'home' | 'meeting' = 'home'
  let myName = ''
  let meetingLinkInput = ''
  let meetingLink = ''                    // 当前会议链接（创建/加入后保存，用于展示与复制）
  let roomHost = ''                       // https://xxx.trycloudflare.com（房间服务）
  let roomConnected = false
  let roomClosed = false
  let leavingRoom = false
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let unlog: (() => void) | null = null
  let shares: ShareEntry[] = []
  let activeShare: ShareEntry | null = null
  let myShareId: string | null = null
  let amCreator = false

  // ---------- 我的共享(推流)状态 ----------
  let streamKey = ''
  let publicUrl = ''
  let hlsUrl = ''
  let whepUrl = ''
  let obsManualMode = false
  let obsAutoError = ''
  let pathActive = false
  let pathReason = ''
  let pathFailCount = 0
  let statusTimer: ReturnType<typeof setInterval> | null = null
  let fpsTimer: ReturnType<typeof setInterval> | null = null
  let currentFps = 0
  // 画质档位：smooth=流畅优先 / smart=智能 / clear=清晰优先
  let qualityMode = 'smart'
  const QUALITY_OPTIONS = [
    { value: 'smooth', label: '流畅度优先', desc: '低码率，网络差时更稳定' },
    { value: 'smart', label: '智能（推荐）', desc: '中码率 + 网络自适应' },
    { value: 'clear', label: '清晰度优先', desc: '高码率，画面更清晰' }
  ]

  const changeQuality = async (): Promise<void> => {
    const ok = await window.PcConnectApi.setQualityMode(qualityMode)
    if (ok) {
      const label = QUALITY_OPTIONS.find((q) => q.value === qualityMode)?.label || qualityMode
      Swal.fire({
        position: 'top-end', icon: 'success', title: `已切换为「${label}」`,
        text: myShareId ? '正在共享中，新画质将在下次开始共享时生效' : '将在开始共享时生效',
        showConfirmButton: false, timer: 2500
      })
    } else {
      Swal.fire({ position: 'top-end', icon: 'error', title: '画质设置失败', showConfirmButton: false, timer: 2500 })
    }
  }

  // ---------- 播放器状态 ----------
  let remoteScreen: HTMLVideoElement
  let hls: Hls | null = null
  let errorShown = false
  let isMuted = true
  let volume = 1
  let isPaused = false
  let zoomFactor = 1
  let shareStartedAt = 0
  // 播放重试（共享刚注册时 OBS 推流可能尚未就绪，404 先自动重试再提示）
  let playbackRetries = 0
  let playbackRetryTimer: ReturnType<typeof setTimeout> | null = null
  const MAX_PLAYBACK_RETRIES = 6

  onMount(async () => {
    try {
      const s = await window.PcConnectApi.getSettings()
      myName = s.username || '我'
    } catch { myName = '我' }
    try { qualityMode = await window.PcConnectApi.getQualityMode() } catch {}
    // 窗口恢复可见时续播（电量策略可能在后台暂停了视频）
    document.addEventListener('visibilitychange', onVisibilityChange)
    // 监听主进程日志：隧道重建（域名变化）时提示主持人重新分享链接
    unlog = window.PcConnectApi.onLogMessage((msg) => {
      if (msg.includes('隧道已重建') && amCreator && mode === 'meeting') {
        Swal.fire({
          position: 'top-end', icon: 'warning',
          title: '会议隧道已重建',
          text: '域名已变化，请将新的会议链接重新分享给参会者',
          showConfirmButton: false, timer: 6000
        })
      }
    })
  })

  onDestroy(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    if (unlog) { unlog(); unlog = null }
    stopRoomSync()
    stopPlayback()
    if (statusTimer) { clearInterval(statusTimer); statusTimer = null }
    if (fpsTimer) { clearInterval(fpsTimer); fpsTimer = null }
    disconnectOBS()
  })

  // 播放兜底：处理 Chromium 自动播放拦截/电量暂停（任何 play() 拒绝都重试）
  let playRetryCount = 0
  const tryPlay = (): void => {
    if (!remoteScreen) return
    remoteScreen.play().catch(() => {
      if (playRetryCount < 20) {
        playRetryCount++
        setTimeout(tryPlay, 500)
      }
    })
  }
  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible' && activeShare && !isPaused) {
      playRetryCount = 0
      tryPlay()
    }
  }

  // ================= 房间同步（HTTP 轮询，2.5s）=================
  // 说明：WS 在 cloudflared http2 隧道上偶发挂起（浏览器兼容问题），
  // 内部会议规模小，改用稳定的 HTTPS 轮询，简单可靠。
  // v2.7.0：请求经主进程 DoH 代理，绕过大陆 DNS 污染（K9）
  const roomFetch = async (path: string, init?: { method?: string; body?: string; headers?: Record<string, string> }): Promise<Response> => {
    const method = init?.method || 'GET'
    const body = init?.body
    const r = await window.PcConnectApi.proxyFetch(method, roomHost + path, body, init?.headers)
    // 包装为 fetch Response 兼容对象
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: new Headers(r.headers),
      json: async () => JSON.parse(r.body || '{}'),
      text: async () => r.body,
    } as unknown as Response
  }

  const syncRoom = async (): Promise<void> => {
    if (!roomHost || leavingRoom) return
    try {
      const res = await roomFetch('/api/room')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.type === 'room' && Array.isArray(data.shares)) {
        roomConnected = true; roomClosed = false
        shares = data.shares
        // 我的共享被移除时同步状态
        if (myShareId && !shares.some((s) => s.id === myShareId)) {
          myShareId = null
          if (activeShare?.streamUrl === whepUrl || activeShare?.streamUrl === hlsUrl) stopPlayback()
        }
        // 无观看对象时自动播放第一路共享
        if (!activeShare && shares.length > 0) setActiveShare(shares[0])
      }
    } catch {
      roomConnected = false
      roomClosed = true
    }
  }

  const startRoomSync = (): void => {
    void syncRoom()
    pollTimer = setInterval(() => { void syncRoom() }, 2500)
  }

  const stopRoomSync = (): void => {
    leavingRoom = true
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
    roomConnected = false
  }

  const roomApi = async (path: string, init?: { method?: string; body?: string }, retries = 3): Promise<Response> => {
    let lastErr: unknown = null
    for (let i = 0; i <= retries; i++) {
      try {
        return await roomFetch(path, init)
      } catch (e) {
        lastErr = e
        if (i < retries) await new Promise((r) => setTimeout(r, 1000))
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('请求失败')
  }

  // ================= 创建 / 加入会议 =================
  const createMeeting = async (): Promise<void> => {
    try {
      Swal.fire({ title: '正在创建会议...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
      const { roomUrl } = await window.PcConnectApi.createMeeting()
      amCreator = true
      meetingLink = roomUrl
      enterMeeting(roomUrl)
      // 预热：提前启动 MediaMTX 并连接 OBS，缩短"开始共享"等待
      void window.PcConnectApi.warmupMedia().catch(() => {})
      void connectToOBS().catch(() => {})
      await navigator.clipboard.writeText(roomUrl).catch(() => {})
      Swal.close()
      Swal.fire({ position: 'top-end', icon: 'success', title: '会议已创建，链接已复制', showConfirmButton: false, timer: 2500 })
    } catch (e) {
      console.error('创建会议失败:', e); Swal.close()
      Swal.fire({ position: 'top-end', icon: 'error', title: '创建会议失败，请检查网络', showConfirmButton: false, timer: 3000 })
    }
  }

  const joinMeeting = async (): Promise<void> => {
    const link = meetingLinkInput.trim()
    let u: URL
    try { u = new URL(link) } catch {
      Swal.fire({ icon: 'warning', title: '会议链接无效', text: '请粘贴完整的会议链接' })
      return
    }
    if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com\/room\//.test(link)) {
      Swal.fire({ icon: 'warning', title: '会议链接无效', text: '链接格式不正确' })
      return
    }
    amCreator = false
    enterMeeting(link)
  }

  const enterMeeting = (link: string): void => {
    const u = new URL(link)
    roomHost = u.origin
    leavingRoom = false
    startRoomSync()
    mode = 'meeting'
    $navigationEnabled = false
  }

  const copyMeetingLink = (): void => {
    navigator.clipboard.writeText(meetingLink).catch(() => {})
    Swal.fire({ position: 'top-end', icon: 'success', title: '会议链接已复制', showConfirmButton: false, timer: 1000 })
  }

  const exitMeeting = async (): Promise<void> => {
    const r = await Swal.fire({ title: '退出会议', text: '确定退出当前会议吗？', icon: 'warning', showCancelButton: true, confirmButtonText: '退出', cancelButtonText: '取消' })
    if (!r.isConfirmed) return
    await stopShare(true)
    if (amCreator) { try { await window.PcConnectApi.stopMeeting() } catch {} }
    stopRoomSync()
    stopPlayback()
    mode = 'home'
    $navigationEnabled = true
    shares = []; activeShare = null; roomClosed = false; amCreator = false; meetingLink = ''
  }

  // ================= 我的共享 =================
  let shareStarting = false

  const startShare = async (): Promise<void> => {
    if (shareStarting) return
    shareStarting = true
    try {
      Swal.fire({ title: '正在启动共享...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
      // 1. 启动 MediaMTX 并立即拿到会话密钥（不等待公网隧道）
      const { streamKey: key } = await window.PcConnectApi.startStreaming()
      streamKey = key
      // 2. 并行：配置 OBS 推流 + 等待公网隧道就绪
      const [publicUrlResult] = await Promise.allSettled([
        window.PcConnectApi.getStreamUrl(),
        (async () => {
          try { await connectToOBS(); await startStreamWithKey(key); obsManualMode = false; obsAutoError = '' } catch (e) {
            obsManualMode = true
            obsAutoError = (e as Error)?.message || '未知错误'
            console.warn('OBS 自动推流失败，切换手动模式:', e)
          }
          await window.PcConnectApi.writePushConfig({ server: 'rtmp://localhost:1935', key })
        })()
      ])
      if (publicUrlResult.status !== 'fulfilled') {
        throw publicUrlResult.reason instanceof Error ? publicUrlResult.reason : new Error('公网隧道建立失败')
      }
      publicUrl = publicUrlResult.value
      hlsUrl = `${publicUrl}/${key}/index.m3u8`
      whepUrl = `${roomHost}/api/whep/${key}/whep`
      // 3. 注册到房间共享列表：streamUrl 保持 HLS（向后兼容老版本观看端），
      //    whepUrl 为新字段，新版观看端优先走 WebRTC P2P
      const res = await roomApi('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: myName || '我', streamUrl: hlsUrl, whepUrl, hlsUrl })
      })
      if (!res.ok) throw new Error('注册共享失败')
      const { id } = await res.json()
      myShareId = id
      shareStartedAt = Date.now()
      Swal.close()
      refreshStatus(); statusTimer = setInterval(refreshStatus, 2000)
      currentFps = 0
      fpsTimer = setInterval(async () => { currentFps = await getObsFps() }, 1000)
      // 共享自己的画面
      const mine = { id, name: myName || '我', streamUrl: hlsUrl, whepUrl, hlsUrl }
      setActiveShare(mine)
    } catch (e) {
      const msg = (e as Error)?.message || String(e)
      console.error('启动共享失败:', e); Swal.close()
      // 失败回滚：停止 OBS 推流与媒体服务，避免残留
      try { await stopStream() } catch {}; disconnectOBS()
      try { await window.PcConnectApi.stopStreaming() } catch {}
      streamKey = ''; hlsUrl = ''; whepUrl = ''
      // 错误分类提示：区分"房间服务器不可达(隧道失效)"与"一般共享失败"
      const isRoomFailure = /Failed to fetch|NetworkError|ERR_NAME_NOT_RESOLVED|load failed|aborted|超时/i.test(msg)
      if (isRoomFailure) {
        // 诊断房间隧道是否失效，给出明确指引
        let tunnelInfo = ''
        try {
          const t = await window.PcConnectApi.checkTunnelReachable(roomHost + '/')
          tunnelInfo = t.ok ? '（会议服务器可达，可能网络波动，请重试）' : `（会议服务器不可达: ${t.reason}）`
        } catch { tunnelInfo = '' }
        Swal.fire({
          position: 'top-end', icon: 'error',
          title: '无法连接会议服务器，请重试',
          text: `请确认网络正常、主持人(创建者)在线。${tunnelInfo}`,
          showConfirmButton: false, timer: 5000
        })
      } else {
        Swal.fire({ position: 'top-end', icon: 'error', title: '启动共享失败，请重试', showConfirmButton: false, timer: 3000 })
      }
    } finally {
      shareStarting = false
    }
  }

  const stopShare = async (silent = false): Promise<void> => {
    // 先记录是否正在观看自己的共享（whepUrl/hlsUrl 即将清空）
    const wasWatchingMine = activeShare?.streamUrl === whepUrl || activeShare?.streamUrl === hlsUrl
    if (myShareId) {
      try { await roomApi(`/api/share?id=${encodeURIComponent(myShareId)}`, { method: 'DELETE' }) } catch {}
      myShareId = null
    }
    try { await stopStream() } catch {}; disconnectOBS()
    try { await window.PcConnectApi.stopStreaming() } catch {}
    if (statusTimer) { clearInterval(statusTimer); statusTimer = null }
    if (fpsTimer) { clearInterval(fpsTimer); fpsTimer = null }
    pathFailCount = 0; pathActive = false
    streamKey = ''; hlsUrl = ''; whepUrl = ''; currentFps = 0; obsManualMode = false
    if (!silent && wasWatchingMine) stopPlayback()
  }

  async function refreshStatus(): Promise<void> {
    if (!streamKey) return
    try {
      const path = await window.PcConnectApi.checkPathActive(streamKey)
      if (path.active) { pathActive = true; pathReason = ''; pathFailCount = 0 }
      else { pathFailCount++; if (pathFailCount >= 2) { pathActive = false; pathReason = path.reason } }
    } catch (e) { console.error('refreshStatus failed:', e) }
  }

  // ================= 观看（播放器） =================
  // v2.7.0：WebRTC(WHEP) 优先，P2P 打洞直连；失败自动回落 HLS
  let whepPc: RTCPeerConnection | null = null
  let whepSessionUrl: string | null = null

  const setActiveShare = (share: ShareEntry): void => {
    if (activeShare?.streamUrl === share.streamUrl && (hls || whepPc)) return
    activeShare = share
    void startPlayback(share).catch(() => {})
  }

  const clearPlaybackRetry = (): void => {
    if (playbackRetryTimer) { clearTimeout(playbackRetryTimer); playbackRetryTimer = null }
  }

  const schedulePlaybackRetry = (share: ShareEntry): void => {
    if (activeShare?.streamUrl !== share.streamUrl) return // 已切换或停止
    if (playbackRetries >= MAX_PLAYBACK_RETRIES) {
      Swal.fire({ icon: 'info', title: '该共享暂不可用', text: '共享者可能已结束共享，或网络不可达', confirmButtonText: '知道了' })
        .then(() => { if (activeShare?.streamUrl === share.streamUrl) activeShare = null })
      return
    }
    playbackRetries++
    clearPlaybackRetry()
    playbackRetryTimer = setTimeout(() => { void startPlayback(share, true) }, 3000)
  }

  // ---- WHEP 播放（WebRTC P2P）----
  // 信令经 proxyFetch 走 DoH 代理；5xx（隧道抖动 502/530）自动重试 2 次
  const whepFetch = async (url: string, method: string, body?: string, headers?: Record<string, string>, binary = false): Promise<{ status: number; headers: Headers; text: () => Promise<string> }> => {
    let last: { status: number; headers: Record<string, string>; body: string } | null = null
    for (let i = 0; i <= 2; i++) {
      try {
        const r = await window.PcConnectApi.proxyFetch(method, url, body, headers, binary)
        last = r
        if (r.status >= 500 || r.status === 0) {
          if (i < 2) { await new Promise((r2) => setTimeout(r2, 1500 * (i + 1))); continue }
        }
        return { status: r.status, headers: new Headers(r.headers), text: async () => r.body }
      } catch (e) {
        last = null
        if (i < 2) { await new Promise((r2) => setTimeout(r2, 1500 * (i + 1))); continue }
        throw e
      }
    }
    throw new Error(`WHEP 请求失败: ${last ? `HTTP ${last.status}` : '网络错误'}`)
  }

  const stopWhep = (): void => {
    if (whepPc) { try { whepPc.close() } catch {}; whepPc = null }
    if (whepSessionUrl) { void whepFetch(whepSessionUrl, 'DELETE').catch(() => {}); whepSessionUrl = null }
    if (remoteScreen) { remoteScreen.srcObject = null }
  }

  // WHEP 播放：基于 MediaMTX reader.js 协议（OPTIONS→POST offer→PATCH trickle candidates）
  const playWhep = async (whepUrl: string): Promise<void> => {
    stopWhep()
    const onTrack = (evt: RTCTrackEvent): void => {
      if (remoteScreen && evt.streams[0]) {
        remoteScreen.srcObject = evt.streams[0]
        isPaused = false
        tryPlay()
      }
    }
    // 1. OPTIONS 获取 ICE servers（来自 MediaMTX 的 Link 头）
    let iceServers: RTCIceServer[] = [{ urls: 'stun:stun.qq.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }]
    try {
      const opt = await whepFetch(whepUrl, 'OPTIONS')
      const link = opt.headers.get('Link') || ''
      const fromLink = link.split(',').map((s) => s.trim()).filter((s) => s.includes('rel="ice-server"'))
        .map((s) => ({ urls: s.match(/<(.*?)>/)?.[1] || '' })).filter((s) => s.urls)
      if (fromLink.length) iceServers = fromLink
    } catch {}
    // 2. 建立 RTCPeerConnection + 本地 offer
    const pc = new RTCPeerConnection({ iceServers, sdpSemantics: 'unified-plan' })
    whepPc = pc
    pc.addTransceiver('video', { direction: 'recvonly' })
    pc.addTransceiver('audio', { direction: 'recvonly' })
    pc.ontrack = onTrack
    pc.onconnectionstatechange = () => {
      if ((pc.connectionState === 'failed' || pc.connectionState === 'closed') && whepPc === pc) {
        // 打洞失败/连接断开 → 回落 HLS 兜底（同一网络环境重试 WHEP 大概率再失败）
        console.warn('[播放] WebRTC 连接失败，回落 HLS')
        stopWhep()
        if (activeShare && activeShare.whepUrl === whepUrl) {
          void playHls(activeShare.streamUrl).catch(() => {})
        }
      }
    }
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    // 3. POST offer → 拿 answer + session URL
    const post = await whepFetch(whepUrl, 'POST', pc.localDescription?.sdp || '', { 'Content-Type': 'application/sdp' })
    if (post.status !== 201) {
      const errBody = await post.text()
      throw new Error(`WHEP 创建会话失败 (${post.status}): ${errBody.slice(0, 120)}`)
    }
    const answerSdp = await post.text()
    whepSessionUrl = new URL(post.headers.get('location') || '', whepUrl).toString()
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
    // 4. 等本地 ICE 候选，通过 PATCH 发送（trickle ICE）
    pc.onicecandidate = (evt) => {
      if (evt.candidate && whepSessionUrl) {
        const frag = JSON.stringify([{
          candidate: evt.candidate.candidate,
          sdpMid: evt.candidate.sdpMid,
          sdpMLineIndex: evt.candidate.sdpMLineIndex,
        }])
        void whepFetch(whepSessionUrl, 'PATCH', frag, { 'Content-Type': 'application/trickle-ice-sdpfrag', 'If-Match': '*' }).catch(() => {})
      }
    }
  }

  // ---- HLS 播放（兜底）----
  const playHls = async (url: string): Promise<void> => {
    stopWhep()
    if (hls) { hls.destroy(); hls = null }
    const Hls = await getHls()
    if (Hls.isSupported()) {
      // 低延迟：LL-HLS + 1s 关键帧；自定义 loader 走主进程 DoH 代理（绕过 DNS 污染）
      hls = new Hls(proxyHlsConfig(Hls) as ConstructorParameters<typeof Hls>[0])
      hls.loadSource(url)
      hls.attachMedia(remoteScreen)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        isPaused = false
        tryPlay()
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          if (data.response?.code === 404 || data.response?.code === 0) {
            // 共享刚注册/刚停止的窗口期：先自动重试，不立即报"已结束"
            if (activeShare) schedulePlaybackRetry(activeShare)
            return
          }
          if (data.response?.code === 500) return
          if (!errorShown) {
            errorShown = true
            Swal.fire({ icon: 'warning', title: '无法加载画面', text: '共享者可能尚未开始推流', showConfirmButton: true, confirmButtonText: '重试', showCancelButton: true, cancelButtonText: '关闭' }).then((r) => {
              errorShown = false
              if (r.isConfirmed && activeShare) { hls?.destroy(); hls = null; void startPlayback(activeShare) }
              else { if (activeShare) activeShare = null }
            })
          }
        }
      })
    } else if (remoteScreen.canPlayType('application/vnd.apple.mpegurl')) {
      remoteScreen.src = url
      tryPlay()
    }
  }

  // 主播放入口：优先 WebRTC(WHEP)，失败/不可用回落 HLS
  async function startPlayback(share: ShareEntry, isRetry = false): Promise<void> {
    if (!isRetry) { playbackRetries = 0; clearPlaybackRetry(); playRetryCount = 0 }
    stopWhep()
    if (hls) { hls.destroy(); hls = null }
    // 1. 尝试 WHEP（新版本共享注册携带 whepUrl 时优先 P2P）
    const whepEndpoint = share.whepUrl
    if (whepEndpoint) {
      try {
        await playWhep(whepEndpoint)
        return // WHEP 成功
      } catch (e) {
        console.warn('[播放] WHEP 失败，回落 HLS:', (e as Error).message)
        stopWhep()
        if (hls) { hls.destroy(); hls = null }
      }
    }
    // 2. HLS 兜底（streamUrl 恒为 HLS 地址，向后兼容老版本）
    await playHls(share.streamUrl)
  }

  const stopPlayback = (): void => {
    clearPlaybackRetry()
    stopWhep()
    if (hls) { hls.destroy(); hls = null }
    remoteScreen?.pause?.()
    remoteScreen?.removeAttribute?.('src')
    if (remoteScreen) { try { remoteScreen.load() } catch {} }
    activeShare = null
  }

  const toggleMute = (): void => {
    isMuted = !isMuted
    remoteScreen.muted = isMuted
    if (!isMuted) remoteScreen.play().catch(() => {})
  }

  const onVolumeChange = (e: Event): void => {
    volume = parseFloat((e.target as HTMLInputElement).value)
    remoteScreen.volume = volume
  }

  const onPauseClick = (): void => {
    if (remoteScreen.paused) { remoteScreen.play(); isPaused = false }
    else { remoteScreen.pause(); isPaused = true }
  }

  const onZoomIn = (): void => { zoomFactor += 0.1; remoteScreen.style.scale = String(zoomFactor) }
  const onZoomOut = (): void => { if (zoomFactor <= 1) return; zoomFactor -= 0.1; remoteScreen.style.scale = String(zoomFactor) }
</script>

{#if mode === 'home'}
  <div class="container p-5">
    <h1 class="title">多人屏幕共享</h1>
    <div class="columns">
      <div class="column">
        <div class="box">
          <h2 class="title is-5">创建会议</h2>
          <p class="mb-3">作为主持人创建会议，生成链接发给同事加入</p>
          <div class="field">
            <label class="label">你的名字</label>
            <div class="control">
              <input class="input" type="text" bind:value={myName} maxlength="32" placeholder="显示在共享列表中的名字" />
            </div>
          </div>
          <button class="button is-link is-large is-fullwidth" on:click={createMeeting}>
            <span class="icon"><i class="fas fa-video"></i></span><span>创建会议</span>
          </button>
        </div>
      </div>
      <div class="column">
        <div class="box">
          <h2 class="title is-5">加入会议</h2>
          <p class="mb-3">粘贴主持人发来的会议链接</p>
          <div class="field">
            <label class="label">会议链接</label>
            <div class="control">
              <input class="input" type="text" bind:value={meetingLinkInput} placeholder="https://xxx.trycloudflare.com/room/XXXXXX" />
            </div>
          </div>
          <button class="button is-info is-large is-fullwidth" on:click={joinMeeting} disabled={!meetingLinkInput}>
            <span class="icon"><i class="fas fa-sign-in-alt"></i></span><span>加入会议</span>
          </button>
        </div>
      </div>
    </div>
  </div>
{:else}
  <div class="container p-5">
    <div class="columns">
      <!-- 左侧：共享列表 -->
      <div class="column is-3">
        <div class="box">
          <div class="is-flex is-justify-content-space-between is-align-items-center">
            <h2 class="title is-6 mb-1">参会人</h2>
            <span class="tag {roomConnected ? 'is-success' : 'is-danger'}">{roomConnected ? '已连接' : '已断开'}</span>
          </div>
          {#if meetingLink}
            <p class="is-size-7 is-family-monospace mt-2" style="word-break:break-all;">{meetingLink}</p>
            <button class="button is-small is-light mt-1 mb-2" on:click={copyMeetingLink}>
              <span class="icon is-small"><i class="fas fa-copy"></i></span><span>复制会议链接</span>
            </button>
          {/if}
          {#if roomClosed && !roomConnected}
            <p class="help has-text-danger">与会议服务器连接中断，正在重连...（可能会议已结束）</p>
          {/if}
          <hr class="my-2" />
          {#if shares.length === 0}
            <p class="help">暂无共享画面。点击下方"开始共享"或等待他人共享。</p>
          {:else}
            {#each shares as share (share.id)}
              <button
                class="button is-fullwidth mb-2 {activeShare?.streamUrl === share.streamUrl ? 'is-primary' : 'is-light'}"
                on:click={() => setActiveShare(share)}
              >
                <span class="icon is-small"><i class="fas {share.streamUrl === whepUrl || share.streamUrl === hlsUrl ? 'fa-broadcast-tower' : 'fa-desktop'}"></i></span>
                <span class="is-clipped" style="flex:1;text-align:left;">{share.name}{share.streamUrl === whepUrl || share.streamUrl === hlsUrl ? '（我）' : ''}</span>
              </button>
            {/each}
          {/if}
        </div>

        <div class="box">
          <h2 class="title is-6 mb-2">我的共享</h2>
          <div class="field">
            <label class="label" style="font-size:0.8rem;">画质（推流码率）</label>
            <div class="control">
              <div class="select is-fullwidth">
                <select bind:value={qualityMode} on:change={changeQuality}>
                  {#each QUALITY_OPTIONS as opt}
                    <option value={opt.value}>{opt.label}</option>
                  {/each}
                </select>
              </div>
            </div>
            <p class="help">{QUALITY_OPTIONS.find((q) => q.value === qualityMode)?.desc}</p>
          </div>
          {#if myShareId}
            <p class="mb-2">
              <span class="tag is-success">正在共享</span>
              {#if pathActive}
                <span class="tag">流到达</span>
              {:else if Date.now() - shareStartedAt < 30000}
                <span class="tag is-info">推流启动中…</span>
              {:else}
                <span class="tag is-warning" title={pathReason}>流未到达</span>
              {/if}
              <span class="tag">{currentFps > 0 ? currentFps + ' FPS' : '—'}</span>
            </p>
            {#if obsManualMode}<p class="help has-text-warning">OBS 未自动推流：{obsAutoError} —— 可在 OBS 中手动填写 rtmp://localhost:1935 与密钥</p>{/if}
            <button class="button is-danger is-fullwidth" on:click={() => stopShare()}>
              <span class="icon is-small"><i class="fas fa-stop"></i></span><span>停止共享</span>
            </button>
          {:else}
            <button class="button is-primary is-fullwidth" on:click={startShare}>
              <span class="icon is-small"><i class="fas fa-play"></i></span><span>开始共享</span>
            </button>
          {/if}
        </div>

        <button class="button is-light is-fullwidth" on:click={exitMeeting}>
          <span class="icon is-small"><i class="fas fa-sign-out-alt"></i></span><span>退出会议</span>
        </button>
      </div>

      <!-- 右侧：画面区 -->
      <div class="column is-9">
        <div class="box p-2">
          {#if activeShare}
            <div class="has-text-centered mb-2">
              <span class="tag is-info">正在观看：{activeShare.name}</span>
            </div>
          {:else}
            <div class="has-text-centered py-6">
              <p class="is-size-5">未选择共享画面</p>
              <p class="help">从左侧列表选择一路共享开始观看</p>
            </div>
          {/if}
          <div class="video-overflow" class:is-hidden={!activeShare}>
            <video bind:this={remoteScreen} class="video" autoplay playsinline muted={isMuted}></video>
          </div>
          {#if activeShare}
            <div class="controls-bar mt-2">
              <button class="button is-info is-small" on:click={onPauseClick} title={isPaused ? '播放' : '暂停'}>
                <span class="icon"><i class="fas fa-{isPaused ? 'play' : 'pause'}"></i></span>
              </button>
              <button class="button is-info is-small" on:click={toggleMute} title={isMuted ? '取消静音' : '静音'}>
                <span class="icon"><i class="fas fa-volume-{isMuted ? 'xmark' : 'up'}"></i></span>
              </button>
              <input type="range" min="0" max="1" value={volume} step="0.05" on:input={onVolumeChange} class="volume-bar" aria-label="音量" style="width:80px;accent-color:var(--accent-primary);" />
              <button class="button is-info is-small" on:click={onZoomIn} title="放大"><span class="icon"><i class="fas fa-search-plus"></i></span></button>
              <button class="button is-info is-small" on:click={onZoomOut} title="缩小"><span class="icon"><i class="fas fa-search-minus"></i></span></button>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .video { width: 100%; height: auto; transition: transform 0.5s linear; }
  .video-overflow { width: 100%; height: auto; overflow: hidden; }
  .controls-bar { display: flex; align-items: center; gap: 6px; }
</style>
