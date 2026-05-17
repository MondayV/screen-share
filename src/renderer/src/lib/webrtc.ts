import type { SettingsData } from '../BananasTypes'

const DEFAULT_ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'turn:relay1.expressturn.com:3478', username: 'efree', credential: 'efree' },
    { urls: 'turn:relay2.expressturn.com:3478?transport=tcp', username: 'efree', credential: 'efree' }
  ]
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'closed'

export class WebRTCManager {
  private connections = new Map<string, RTCPeerConnection>()
  private displayStream: MediaStream | null = null
  private audioStream: MediaStream | null = null
  private remoteVideoElement: HTMLVideoElement | null = null
  private remoteCursorEnabled = false
  private cursorPositionChannels = new Map<string, RTCDataChannel>()
  private cursorPingChannels = new Map<string, RTCDataChannel>()
  private remoteClickChannel: RTCDataChannel | null = null
  private userSettings: SettingsData | null = null
  private onStateChange: ((state: ConnectionState) => void) | null = null
  private onRemoteClick: ((data: { type: string; x: number; y: number }) => void) | null = null
  private onIceCandidate: ((peerId: string, candidate: RTCIceCandidateInit) => void) | null = null
  // Queue ICE candidates that arrive before the PC is ready for this peer
  private pendingIceCandidates = new Map<string, RTCIceCandidateInit[]>()

  setStateCallback(cb: (state: ConnectionState) => void): void {
    this.onStateChange = cb
  }

  setRemoteClickCallback(cb: (data: { type: string; x: number; y: number }) => void): void {
    this.onRemoteClick = cb
  }

  setIceCandidateCallback(cb: (peerId: string, candidate: RTCIceCandidateInit) => void): void {
    this.onIceCandidate = cb
  }

  private updateState(state: ConnectionState): void {
    if (this.onStateChange) this.onStateChange(state)
  }

  async init(): Promise<void> {
    this.userSettings = await window.PcConnectApi.getSettings()
  }

  getAudioStream(): MediaStream | null {
    return this.audioStream
  }

  hasAudioInput(): boolean {
    return this.audioStream !== null
  }

  async setupLocalMedia(sourceId?: string): Promise<void> {
    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true
      }).catch(() => null)
    } catch {
      this.audioStream = null
    }

    try {
      if (sourceId) {
        const constraints = {
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId
            }
          }
        }
        this.displayStream = await navigator.mediaDevices.getUserMedia(constraints as any)
      } else {
        this.displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false
        })
      }
    } catch (e) {
      console.error('Failed to get display media:', e)
      const msg = (e as Error).message || String(e)
      if (msg.includes('Permission') || msg.includes('denied') || msg.includes('cancelled')) {
        throw new Error('用户取消了屏幕共享或拒绝了权限')
      }
      if (msg.includes('not found') || msg.includes('NotFound')) {
        throw new Error('未找到可共享的屏幕源')
      }
      throw new Error(`无法获取屏幕视频源: ${msg}`)
    }

    if (this.audioStream && this.userSettings) {
      for (const track of this.audioStream.getAudioTracks()) {
        track.enabled = this.userSettings.isMicrophoneEnabledOnConnect
      }
    }
  }

  async createConnectionForParticipant(peerId: string): Promise<RTCSessionDescriptionInit> {
    // Guard against duplicate connections for the same peer
    if (this.connections.has(peerId)) {
      console.warn(`Connection already exists for peer ${peerId}, reusing`)
      const existing = this.connections.get(peerId)!
      if (existing.localDescription) return existing.localDescription
      // Otherwise create a new offer on the existing PC
      const offer = await existing.createOffer()
      await existing.setLocalDescription(offer)
      return existing.localDescription
    }

    const config = await this.getConfig()
    const pc = new RTCPeerConnection(config)

    pc.onicecandidate = (e) => {
      if (e.candidate && this.onIceCandidate) {
        this.onIceCandidate(peerId, e.candidate)
      }
    }
    pc.oniceconnectionstatechange = () => {
      this.recalcConnectionState()
    }

    // Add local tracks
    if (this.displayStream) {
      for (const track of this.displayStream.getTracks()) {
        pc.addTrack(track, this.displayStream)
      }
    }
    if (this.audioStream) {
      for (const track of this.audioStream.getTracks()) {
        pc.addTrack(track, this.audioStream)
      }
    }

    // Create data channels for cursor control
    const cursorPosChannel = pc.createDataChannel('remoteMouseCursorPositions')
    const cursorPingChannel = pc.createDataChannel('remoteCursorPing')
    const clickChannel = pc.createDataChannel('remoteClick')
    this.setupDataChannel(pc, cursorPosChannel, peerId)
    this.setupDataChannel(pc, cursorPingChannel, peerId)
    this.setupClickChannel(pc, clickChannel)

    this.connections.set(peerId, pc)

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    this.updateState('connecting')
    return pc.localDescription!
  }

  async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    // Guard: if we already have a connection for this peer that's past the
    // offer/answer exchange, refuse to create a duplicate.
    const existing = this.connections.get(peerId)
    if (existing) {
      if (existing.signalingState === 'stable' || existing.signalingState === 'closed') {
        console.warn(`Connection for ${peerId} already stable/closed — rejecting duplicate offer`)
        throw new Error('Connection already established for this peer')
      }
      // If the PC is still setting up, close the old one
      existing.close()
    }

    const config = await this.getConfig()
    const pc = new RTCPeerConnection(config)

    pc.onicecandidate = (e) => {
      if (e.candidate && this.onIceCandidate) {
        this.onIceCandidate(peerId, e.candidate)
      }
    }
    pc.oniceconnectionstatechange = () => {
      this.recalcConnectionState()
    }
    pc.ontrack = (evt) => {
      if (this.remoteVideoElement) {
        this.remoteVideoElement.srcObject = evt.streams[0]
      }
    }
    pc.ondatachannel = (e) => {
      if (e.channel.label === 'remoteMouseCursorPositions') {
        this.setupDataChannel(pc, e.channel, peerId)
      } else if (e.channel.label === 'remoteCursorPing') {
        this.setupDataChannel(pc, e.channel, peerId)
      } else if (e.channel.label === 'remoteClick') {
        this.setupClickChannel(pc, e.channel)
      }
    }

    this.connections.set(peerId, pc)

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
    } catch (e) {
      console.error('Failed to set remote offer:', e)
      throw e
    }

    // Drain any pending ICE candidates now that remote description is set
    const pending = this.pendingIceCandidates.get(peerId)
    if (pending) {
      for (const c of pending) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch {}
      }
      this.pendingIceCandidates.delete(peerId)
    }

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    this.updateState('connected')
    return pc.localDescription!
  }

  setRemoteAnswer(peerId: string, answer: RTCSessionDescriptionInit): void {
    const pc = this.connections.get(peerId)
    if (!pc) {
      console.warn(`setRemoteAnswer: no PC for peer ${peerId}`)
      return
    }
    // Only accept answer if we're in have-local-offer state
    if (pc.signalingState !== 'have-local-offer') {
      console.warn(`setRemoteAnswer: wrong state ${pc.signalingState} for peer ${peerId}, ignoring`)
      return
    }
    try {
      pc.setRemoteDescription(new RTCSessionDescription(answer))
    } catch (e) {
      console.error('Failed to set remote answer:', e)
    }
  }

  addIceCandidate(peerId: string, candidate: RTCIceCandidateInit): void {
    const pc = this.connections.get(peerId)
    if (!pc) {
      // Queue the candidate for when the PC is created
      if (!this.pendingIceCandidates.has(peerId)) {
        this.pendingIceCandidates.set(peerId, [])
      }
      this.pendingIceCandidates.get(peerId)!.push(candidate)
      return
    }
    // Only add if remote description has been set (not in stable state for the
    // participant who hasn't received an offer yet)
    if (pc.signalingState === 'stable' && !pc.remoteDescription) {
      if (!this.pendingIceCandidates.has(peerId)) {
        this.pendingIceCandidates.set(peerId, [])
      }
      this.pendingIceCandidates.get(peerId)!.push(candidate)
      return
    }
    try {
      pc.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (e) {
      console.error('Failed to add ICE candidate:', e)
    }
  }

  setRemoteVideo(video: HTMLVideoElement): void {
    this.remoteVideoElement = video
  }

  private setupDataChannel(_pc: RTCPeerConnection, dc: RTCDataChannel, peerId: string): void {
    if (dc.label === 'remoteMouseCursorPositions') {
      this.cursorPositionChannels.set(peerId, dc)
      dc.onmessage = (e) => {
        if (!this.remoteCursorEnabled || !this.remoteVideoElement) return
        try {
          const data = JSON.parse(e.data)
          window.PcConnectApi.updateRemoteCursor(data)
        } catch {}
      }
    }
    if (dc.label === 'remoteCursorPing') {
      this.cursorPingChannels.set(peerId, dc)
      dc.onmessage = (e) => {
        if (!this.remoteCursorEnabled || !this.remoteVideoElement) return
        window.PcConnectApi.remoteCursorPing(e.data)
      }
    }
  }

  private setupClickChannel(_pc: RTCPeerConnection, dc: RTCDataChannel): void {
    if (dc.label === 'remoteClick') {
      this.remoteClickChannel = dc
      dc.onmessage = (e) => {
        if (this.onRemoteClick) {
          try {
            this.onRemoteClick(JSON.parse(e.data))
          } catch {}
        }
      }
    }
  }

  toggleRemoteCursors(enabled: boolean): void {
    this.remoteCursorEnabled = enabled
  }

  pingRemoteCursor(cursorId: string): void {
    for (const dc of this.cursorPingChannels.values()) {
      if (dc.readyState === 'open') dc.send(cursorId)
    }
  }

  updateRemoteCursor(data: { x: number; y: number; id: string; name: string; color: string }): void {
    for (const dc of this.cursorPositionChannels.values()) {
      if (dc.readyState === 'open') dc.send(JSON.stringify(data))
    }
  }

  sendRemoteClick(data: { type: string; x: number; y: number }): void {
    if (this.remoteClickChannel && this.remoteClickChannel.readyState === 'open') {
      this.remoteClickChannel.send(JSON.stringify(data))
    }
  }

  toggleDisplayStream(): void {
    if (this.displayStream) {
      for (const track of this.displayStream.getVideoTracks()) {
        track.enabled = !track.enabled
      }
    }
  }

  toggleMicrophone(): void {
    if (this.audioStream) {
      for (const track of this.audioStream.getAudioTracks()) {
        track.enabled = !track.enabled
      }
    }
  }

  isMicrophoneActive(): boolean {
    if (this.audioStream) {
      for (const track of this.audioStream.getAudioTracks()) {
        return track.enabled
      }
    }
    return false
  }

  removeConnection(peerId: string): void {
    const pc = this.connections.get(peerId)
    if (pc) {
      pc.close()
      this.connections.delete(peerId)
    }
    this.cursorPositionChannels.delete(peerId)
    this.cursorPingChannels.delete(peerId)
    this.pendingIceCandidates.delete(peerId)
    this.recalcConnectionState()
  }

  async disconnect(): Promise<void> {
    for (const [, pc] of this.connections) {
      pc.close()
    }
    this.connections.clear()
    this.cursorPositionChannels.clear()
    this.cursorPingChannels.clear()
    this.pendingIceCandidates.clear()
    this.remoteClickChannel = null

    if (this.displayStream) {
      for (const track of this.displayStream.getTracks()) {
        track.stop()
      }
      this.displayStream = null
    }
    if (this.audioStream) {
      for (const track of this.audioStream.getTracks()) {
        track.stop()
      }
      this.audioStream = null
    }
    this.updateState('disconnected')
  }

  isConnected(): boolean {
    return Array.from(this.connections.values()).some(
      (c) => c.iceConnectionState === 'connected'
    )
  }

  getPeerCount(): number {
    return this.connections.size
  }

  private recalcConnectionState(): void {
    const states = Array.from(this.connections.values()).map((c) => c.iceConnectionState)
    if (states.includes('connected')) {
      this.updateState('connected')
    } else if (states.some((s) => s === 'failed')) {
      this.updateState('failed')
    } else if (states.every((s) => s === 'closed')) {
      this.updateState('closed')
    }
  }

  private async getConfig(): Promise<RTCConfiguration> {
    try {
      const settings = await window.PcConnectApi.getSettings()
      if (settings.iceServers && settings.iceServers.length > 0) {
        return { iceServers: settings.iceServers }
      }
    } catch {}
    return DEFAULT_ICE_SERVERS
  }
}
