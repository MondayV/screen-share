<script lang="ts">
  import type { RTCSessionDescriptionOptions } from './Utils'
  import type { PcConnectRemoteCursorData, SettingsData } from './BananasTypes'
  import { getConnectionString, ConnectionType } from './Utils'
  import { getRTCPeerConnectionConfig } from './Config'

  export let connectionState: string = 'disconnected'

  const errorHander = (e: ErrorEvent): void => {
    console.error(e)
  }

  let remoteVideo: HTMLVideoElement | null = null
  let pc: RTCPeerConnection | null = null
  let remoteCursorPositionsEnabled = false
  let remoteMouseCursorPositionsChannel: RTCDataChannel | null = null
  let remoteCursorPingChannel: RTCDataChannel | null = null
  let annotationChannel: RTCDataChannel | null = null
  let chatChannel: RTCDataChannel | null = null
  let remoteControlChannel: RTCDataChannel | null = null
  let reactionChannel: RTCDataChannel | null = null
  let audioStream: MediaStream | null = null
  let stream: MediaStream | null = null
  let cameraStream: MediaStream | null = null
  let audioElement: HTMLAudioElement | null = null
  let userSettings: SettingsData | null = null

  // Callback handlers for received data channel messages
  let onAnnotation: ((data: any) => void) | null = null
  let onChatMessage: ((data: any) => void) | null = null
  let onRemoteControl: ((data: any) => void) | null = null
  let onReaction: ((data: any) => void) | null = null

  let annotationReady = (): boolean => annotationChannel?.readyState === 'open'
  let chatReady = (): boolean => chatChannel?.readyState === 'open'
  let remoteControlReady = (): boolean => remoteControlChannel?.readyState === 'open'
  let reactionReady = (): boolean => reactionChannel?.readyState === 'open'

  const remoteMouseCursorPositionsChannelIsReady = (): boolean => {
    if (!remoteMouseCursorPositionsChannel) return false
    if (remoteMouseCursorPositionsChannel.readyState === 'open') return true
    return false
  }

  const remoteCursorPingChannelIsReady = (): boolean => {
    if (!remoteCursorPingChannel) return false
    if (remoteCursorPingChannel.readyState === 'open') return true
    return false
  }

  const setupDataChannel = (dc: RTCDataChannel): void => {
    if (dc.label === 'remoteMouseCursorPositions') {
      remoteMouseCursorPositionsChannel = dc
      dc.onmessage = function (e: MessageEvent): void {
        if (!remoteCursorPositionsEnabled) return
        if (remoteVideo) return
        const data = JSON.parse(e.data)
        window.PcConnectApi.updateRemoteCursor(data)
      }
    }
    if (dc.label === 'remoteCursorPing') {
      remoteCursorPingChannel = dc
      dc.onmessage = function (e: MessageEvent): void {
        if (!remoteCursorPositionsEnabled) return
        if (remoteVideo) return
        window.PcConnectApi.remoteCursorPing(e.data)
      }
    }
    if (dc.label === 'annotation') {
      annotationChannel = dc
      dc.onmessage = (e) => { if (onAnnotation) onAnnotation(JSON.parse(e.data)) }
    }
    if (dc.label === 'chat') {
      chatChannel = dc
      dc.onmessage = (e) => { if (onChatMessage) onChatMessage(JSON.parse(e.data)) }
    }
    if (dc.label === 'remoteControl') {
      remoteControlChannel = dc
      dc.onmessage = (e) => { if (onRemoteControl) onRemoteControl(JSON.parse(e.data)) }
    }
    if (dc.label === 'reaction') {
      reactionChannel = dc
      dc.onmessage = (e) => { if (onReaction) onReaction(JSON.parse(e.data)) }
    }
  }
  export function PingRemoteCursor(cursorId: string): void {
    if (!remoteCursorPingChannelIsReady()) {
      console.error('远程光标Ping通道未就绪')
      return
    }
    remoteCursorPingChannel.send(cursorId)
  }
  export function UpdateRemoteCursor(cursorData: PcConnectRemoteCursorData): void {
    if (!remoteMouseCursorPositionsChannelIsReady()) {
      console.error('远程光标位置通道未就绪')
      return
    }
    remoteMouseCursorPositionsChannel.send(JSON.stringify(cursorData))
  }
  export function HasAudioInput(): boolean {
    return audioStream !== null
  }
  export function GetAudioStream(): MediaStream | null {
    return audioStream
  }
  export function ToggleRemoteCursors(enabled: boolean): boolean {
    if (!remoteMouseCursorPositionsChannel) return false
    if (remoteMouseCursorPositionsChannel.readyState !== 'open') return false
    remoteCursorPositionsEnabled = enabled
    return enabled
  }

  // Annotation channel
  export function SetOnAnnotation(cb: ((data: any) => void) | null) { onAnnotation = cb }
  export function SendAnnotation(data: any) { if (annotationReady()) annotationChannel!.send(JSON.stringify(data)) }

  // Chat channel
  export function SetOnChatMessage(cb: ((data: any) => void) | null) { onChatMessage = cb }
  export function SendChatMessage(data: any) { if (chatReady()) chatChannel!.send(JSON.stringify(data)) }

  // Remote control channel
  export function SetOnRemoteControl(cb: ((data: any) => void) | null) { onRemoteControl = cb }
  export function SendRemoteControl(data: any) { if (remoteControlReady()) remoteControlChannel!.send(JSON.stringify(data)) }

  // Reaction channel
  export function SetOnReaction(cb: ((data: any) => void) | null) { onReaction = cb }
  export function SendReaction(data: any) { if (reactionReady()) reactionChannel!.send(JSON.stringify(data)) }

  // Camera stream
  export function GetCameraStream(): MediaStream | null { return cameraStream }
  export function HasCamera(): boolean { return cameraStream !== null && cameraStream.getVideoTracks().length > 0 }
  export async function Setup(v: HTMLVideoElement = null, enableCamera: boolean = false): Promise<void> {
    userSettings = await window.PcConnectApi.getSettings()
    remoteVideo = v
    audioElement = document.createElement('audio')
    audioElement.controls = true
    audioElement.autoplay = true
    if (pc) {
      pc.close()
      pc = null
    }
    pc = new RTCPeerConnection(await getRTCPeerConnectionConfig())
    pc.ondatachannel = (e: RTCDataChannelEvent): void => {
      if (e.channel.label === 'remoteMouseCursorPositions') {
        setupDataChannel(e.channel)
      }
      if (e.channel.label === 'remoteCursorPing') {
        setupDataChannel(e.channel)
      }
    }
    pc.ontrack = (evt): void => {
      if (remoteVideo) {
        remoteVideo.srcObject = evt.streams[0]
      }
      if (audioStream) {
        audioElement.srcObject = evt.streams[0]
      }
    }
    pc.onicecandidate = function (e: RTCPeerConnectionIceEvent): void {
      const cand = e.candidate
      if (!cand) {
        console.log('ICE 候选人收集: 完成')
      } else {
        console.log('新的 ICE 候选人')
      }
    }
    pc.oniceconnectionstatechange = function (): void {
      connectionState = pc.iceConnectionState
    }
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true
      })
    } catch (e) {
      errorHander(e)
    }
    // Camera capture for PIP
    if (enableCamera) {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      } catch (e) { /* camera optional */ }
    }
    if (!remoteVideo) {
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        })
        for (const track of stream.getTracks()) {
          pc.addTrack(track, stream)
        }
        if (audioStream) {
          for (const track of audioStream.getTracks()) {
            track.enabled = userSettings.isMicrophoneEnabledOnConnect
            pc.addTrack(track, stream)
          }
        }
        if (cameraStream) {
          for (const track of cameraStream.getVideoTracks()) {
            pc.addTrack(track, stream)
          }
        }
      } catch (e) {
        errorHander(e)
      }
    } else {
      if (audioStream) {
        for (const track of audioStream.getTracks()) {
          track.enabled = userSettings.isMicrophoneEnabledOnConnect
          pc.addTrack(track, audioStream)
        }
      }
      if (cameraStream) {
        for (const track of cameraStream.getVideoTracks()) {
          pc.addTrack(track, audioStream)
        }
      }
    }
  }
  export async function CreateParticipantUrl(
    c: RTCSessionDescriptionOptions,
    data: { username: string }
  ): Promise<string> {
    try {
      const desc = new RTCSessionDescription(c)
      await pc.setRemoteDescription(desc)
      if (desc.type === 'offer') {
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
      }
    } catch (e) {
      errorHander(e)
    }
    return await getConnectionString(ConnectionType.PARTICIPANT, pc.localDescription, data)
  }
  export async function CreateHostOffer(): Promise<RTCSessionDescriptionOptions> {
    if (!remoteMouseCursorPositionsChannel) {
      remoteMouseCursorPositionsChannel = pc.createDataChannel('remoteMouseCursorPositions')
      remoteCursorPingChannel = pc.createDataChannel('remoteCursorPing')
      annotationChannel = pc.createDataChannel('annotation')
      chatChannel = pc.createDataChannel('chat')
      remoteControlChannel = pc.createDataChannel('remoteControl')
      reactionChannel = pc.createDataChannel('reaction')
      setupDataChannel(remoteMouseCursorPositionsChannel)
      setupDataChannel(remoteCursorPingChannel)
      setupDataChannel(annotationChannel)
      setupDataChannel(chatChannel)
      setupDataChannel(remoteControlChannel)
      setupDataChannel(reactionChannel)
    }
    const desc = await pc.createOffer()
    await pc.setLocalDescription(desc)
    return pc.localDescription.toJSON() as RTCSessionDescriptionOptions
  }
  export async function CreateHostUrl(data: { username: string }): Promise<string> {
    if (!remoteMouseCursorPositionsChannel) {
      remoteMouseCursorPositionsChannel = pc.createDataChannel('remoteMouseCursorPositions')
      remoteCursorPingChannel = pc.createDataChannel('remoteCursorPing')
      annotationChannel = pc.createDataChannel('annotation')
      chatChannel = pc.createDataChannel('chat')
      remoteControlChannel = pc.createDataChannel('remoteControl')
      reactionChannel = pc.createDataChannel('reaction')
      setupDataChannel(remoteMouseCursorPositionsChannel)
      setupDataChannel(remoteCursorPingChannel)
      setupDataChannel(annotationChannel)
      setupDataChannel(chatChannel)
      setupDataChannel(remoteControlChannel)
      setupDataChannel(reactionChannel)
    }
    const desc = await pc.createOffer()
    await pc.setLocalDescription(desc)
    return await getConnectionString(ConnectionType.HOST, pc.localDescription, data)
  }
  export function ToggleDisplayStream(): void {
    if (stream) {
      for (const track of stream.getVideoTracks()) {
        track.enabled = !track.enabled
      }
    }
  }
  export function ToggleMicrophone(): void {
    if (audioStream) {
      for (const track of audioStream.getAudioTracks()) {
        track.enabled = !track.enabled
      }
    }
  }
  export function IsMicrophoneActive(): boolean {
    if (audioStream) {
      for (const track of audioStream.getAudioTracks()) {
        return track.enabled
      }
    }
    return false
  }
  export function GetLocalDescription(): RTCSessionDescriptionOptions | null {
    return pc ? pc.localDescription?.toJSON() as RTCSessionDescriptionOptions : null
  }
  export async function ConnectAndGetAnswer(c: RTCSessionDescriptionOptions): Promise<RTCSessionDescriptionOptions> {
    try {
      const desc = new RTCSessionDescription(c)
      await pc.setRemoteDescription(desc)
      if (desc.type === 'offer') {
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
      }
      return pc.localDescription.toJSON() as RTCSessionDescriptionOptions
    } catch (e) {
      errorHander(e)
      throw e
    }
  }
  export async function Connect(c: RTCSessionDescriptionOptions): Promise<void> {
    try {
      const desc = new RTCSessionDescription(c)
      await pc.setRemoteDescription(desc)
      if (desc.type === 'offer') {
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
      }
    } catch (e) {
      errorHander(e)
    }
  }
  export function IsConnected(): boolean {
    return pc ? pc.connectionState === 'connected' : false
  }
  export async function Disconnect(): Promise<void> {
    try {
      pc.close()
      pc = null
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop()
        }
        stream = null
      }
      if (audioStream) {
        for (const track of audioStream.getTracks()) {
          track.stop()
        }
        audioStream = null
      }
    } catch (e) {
      errorHander(e)
    }
  }
</script>
