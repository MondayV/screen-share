<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import Swal from 'sweetalert2'
  import { L } from './translations'
  import { useNavigationEnabled, useIsHosting } from './stores'
  import AudioVisualizer from './AudioVisualizer.svelte'
  import WebRTC from './WebRTC.svelte'
  import { connectToRoom, sendToAll, sendTo, on, off, closeSignaling, generateRoomCode } from './lib/signaling'

  const navigationEnabled = useNavigationEnabled()
  const isHosting = useIsHosting()

  let webRTCComponent: WebRTC

  let connectionState = 'disconnected'
  let cursorsActive = false
  let displayStreamActive = false
  let microphoneActive = false
  let isStreaming = false
  let sessionStarted = false
  let hasAudioInput = false
  let visualizerIsActive = true
  let roomCode = ''
  let connectedPeers = 0
  const signalingCleanup: Array<{ event: string; cb: (msg: any) => void }> = []

  const onConnectionStateChange = (): void => {
    switch (connectionState) {
      case 'connected':
        Swal.fire({ position: 'top-end', icon: 'success', title: '连接建立成功', showConfirmButton: false, timer: 1500 })
        break
      case 'failed':
        Swal.fire({ position: 'top-end', icon: 'error', title: '连接失败', showConfirmButton: false, timer: 1500 })
        break
      case 'closed':
        Swal.fire({ position: 'top-end', icon: 'info', title: '连接已关闭', showConfirmButton: false, timer: 1500 })
        break
      default:
        break
    }
  }

  $: connectionState, onConnectionStateChange()

  const setupSignaling = (): void => {
    webRTCComponent.SetIceCandidateHandler((candidate) => {
      sendToAll({ type: 'ice-candidate', candidate })
    })

    const onParticipantJoined = async (msg: any): Promise<void> => {
      try {
        const offer = await webRTCComponent.CreateHostOffer()
        sendTo(msg.peerId, { type: 'offer', offer })
        connectedPeers++
      } catch (e) {
        console.error('Failed to send offer:', e)
      }
    }
    on('participant-joined', onParticipantJoined)
    signalingCleanup.push({ event: 'participant-joined', cb: onParticipantJoined })

    const onAnswer = (msg: any): void => {
      webRTCComponent.SetRemoteAnswer(msg.answer)
    }
    on('answer', onAnswer)
    signalingCleanup.push({ event: 'answer', cb: onAnswer })

    const onIceMsg = (msg: any): void => {
      if (msg.candidate) webRTCComponent.AddIceCandidate(msg.candidate)
    }
    on('ice-candidate', onIceMsg)
    signalingCleanup.push({ event: 'ice-candidate', cb: onIceMsg })

    const onPeerLeft = (): void => {
      connectedPeers = Math.max(0, connectedPeers - 1)
    }
    on('peer-left', onPeerLeft)
    signalingCleanup.push({ event: 'peer-left', cb: onPeerLeft })
  }

  const toggleRemoteCursors = (): void => {
    cursorsActive = !cursorsActive
    window.PcConnectApi.toggleRemoteCursors(cursorsActive)
    webRTCComponent.ToggleRemoteCursors(cursorsActive)
  }

  onMount(async () => {
    const settings = await window.PcConnectApi.getSettings()
    microphoneActive = settings.isMicrophoneEnabledOnConnect
  })

  onDestroy(() => {
    signalingCleanup.forEach(({ event, cb }) => off(event, cb))
  })

  const onStartSessionButtonClick = async (): Promise<void> => {
    await webRTCComponent.Setup()
    roomCode = generateRoomCode()
    try {
      await connectToRoom(roomCode)
    } catch {
      Swal.fire({ position: 'top-end', icon: 'error', title: '信令连接失败，请重试', showConfirmButton: false, timer: 2000 })
      return
    }
    setupSignaling()
    sessionStarted = true
    isStreaming = true
    displayStreamActive = true
    hasAudioInput = webRTCComponent.HasAudioInput()
    $navigationEnabled = false
    $isHosting = true
  }

  const copyRoomCode = (): void => {
    navigator.clipboard.writeText(roomCode)
    Swal.fire({ position: 'top-end', icon: 'success', title: '已复制房间码', showConfirmButton: false, timer: 1000 })
  }

  const reset = (): void => {
    roomCode = ''
    connectedPeers = 0
    cursorsActive = false
    displayStreamActive = false
    microphoneActive = true
    isStreaming = false
    sessionStarted = false
    $navigationEnabled = true
    $isHosting = false
    signalingCleanup.forEach(({ event, cb }) => off(event, cb))
    signalingCleanup.length = 0
  }

  const onDisconnectClick = async (): Promise<void> => {
    const result = await Swal.fire({
      title: '结束共享',
      text: '确定要结束当前屏幕共享吗？',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    if (!result.isConfirmed) return
    await webRTCComponent.Disconnect()
    closeSignaling()
    reset()
    Swal.fire({ position: 'top-end', icon: 'info', title: '共享已结束', showConfirmButton: false, timer: 1500 })
  }

  const onMicrophoneToggle = async (): Promise<void> => {
    microphoneActive = !microphoneActive
    webRTCComponent.ToggleMicrophone()
  }

  const onDisplayStreamToggle = async (): Promise<void> => {
    displayStreamActive = !displayStreamActive
    webRTCComponent.ToggleDisplayStream()
    if (!displayStreamActive) {
      cursorsActive = false
      window.PcConnectApi.toggleRemoteCursors(cursorsActive)
      webRTCComponent.ToggleRemoteCursors(cursorsActive)
    }
  }
</script>

<WebRTC bind:connectionState bind:this={webRTCComponent} />

<div class="container p-5">
  <h1 class="title">{!isStreaming ? L.host_a_session() : L.hosting_a_session()}</h1>

  {#if isStreaming}
    <div class="box has-text-centered mb-5">
      <p class="heading">房间码</p>
      <p class="title is-1" style="font-family: monospace; letter-spacing: 8px;">{roomCode}</p>
      <button class="button is-primary" on:click={copyRoomCode}>
        <span class="icon"><i class="fas fa-copy"></i></span>
        <span>复制房间码</span>
      </button>
      {#if connectedPeers > 0}
        <p class="mt-3">已连接: {connectedPeers} 个观看者</p>
      {/if}
    </div>

    <div class="fixed-grid">
      <div class="grid">
        <div class="cell">
          <button
            title={displayStreamActive ? L.streaming_your_display() : L.not_streaming_your_display()}
            class="button {displayStreamActive ? 'is-success' : 'is-danger'}"
            on:click={onDisplayStreamToggle}
          >
            <span class="icon"><i class="fa-solid fa-display"></i></span>
          </button>
          {#if hasAudioInput}
            <button
              title={microphoneActive ? L.microphone_active() : L.microphone_inactive()}
              class="button {microphoneActive ? 'is-success' : 'is-danger'}"
              on:click={onMicrophoneToggle}
            >
              <span class="icon">
                {#if microphoneActive}
                  <AudioVisualizer className="icon {!visualizerIsActive ? 'is-hidden' : ''}" bind:visualizerIsActive stream={webRTCComponent.GetAudioStream()} />
                  <i class="fas fa-microphone {visualizerIsActive ? 'is-hidden' : ''}"></i>
                {:else}
                  <i class="fas fa-microphone-slash"></i>
                {/if}
              </span>
            </button>
          {/if}
          <button
            title={cursorsActive ? L.remote_cursors_enabled() : L.remote_cursors_disabled()}
            class="button {cursorsActive ? 'is-success' : 'is-danger'} {!displayStreamActive ? 'is-hidden' : ''}"
            on:click={toggleRemoteCursors}
          >
            <span class="icon"><i class="fas fa-mouse-pointer"></i></span>
          </button>
        </div>
        <div class="cell has-text-right">
          <button class="button is-danger" on:click={onDisconnectClick}>
            <span class="icon"><i class="fas fa-unlink"></i></span>
            <span>{L.disconnect()}</span>
          </button>
        </div>
      </div>
    </div>
  {:else}
    <div class="has-text-centered">
      <button class="button is-link is-large" on:click={onStartSessionButtonClick} disabled={sessionStarted}>
        <span class="icon"><i class="fas fa-play"></i></span>
        <span>{!sessionStarted ? L.start_a_new_session() : L.session_started()}</span>
      </button>
    </div>
  {/if}
</div>
