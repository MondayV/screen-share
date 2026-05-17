<script lang="ts">
  import Swal from 'sweetalert2'
  import { L } from './translations'
  import { useNavigationEnabled, useIsHosting } from './stores'
  import WebRTC from './WebRTC.svelte'
  import AudioVisualizer from './AudioVisualizer.svelte'
  import SourcePicker from './SourcePicker.svelte'
  import { connectToRoom, sendTo, on, closeSignaling, generateRoomCode } from './lib/signaling'

  const navigationEnabled = useNavigationEnabled()
  const isHosting = useIsHosting()

  let webRTCComponent: WebRTC
  let connectionState = 'disconnected'
  let roomCode = ''
  let sessionStarted = false
  let isStreaming = false
  let displayStreamActive = false
  let microphoneActive = false
  let cursorsActive = false
  let hasAudioInput = false
  let visualizerIsActive = true
  let connectedPeers: string[] = []
  let showSourcePicker = false
  let sources: { id: string; name: string; thumbnail: string }[] = []

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
    }
  }

  $: connectionState, onConnectionStateChange()

  const setupRemoteClickHandler = (): void => {
    webRTCComponent.setRemoteClickCallback((data) => {
      window.PcConnectApi.simulateInput(data)
    })
  }

  const setupSignaling = (): void => {
    webRTCComponent.setIceCandidateCallback((peerId, candidate) => {
      sendTo(peerId, { type: 'ice-candidate', candidate } as any)
    })

    on('participant-joined', async (msg) => {
      try {
        const offer = await webRTCComponent.createConnectionForParticipant(msg.peerId)
        sendTo(msg.peerId, { type: 'offer', offer } as any)
        connectedPeers = [...connectedPeers, msg.peerId]
      } catch (e) {
        console.error('Failed to create offer:', e)
      }
    })

    on('answer', (msg) => {
      webRTCComponent.setRemoteAnswer(msg.from, msg.answer)
    })

    on('ice-candidate', (msg) => {
      webRTCComponent.addIceCandidate(msg.from, msg.candidate)
    })

    on('peer-left', (msg) => {
      webRTCComponent.removeConnection(msg.peerId)
      connectedPeers = connectedPeers.filter(p => p !== msg.peerId)
    })
  }

  const startSharingSession = async (sourceId?: string): Promise<void> => {
    try {
      await webRTCComponent.init()
      await webRTCComponent.setupLocalMedia(sourceId)
      roomCode = generateRoomCode()
      await connectToRoom(roomCode)
      setupSignaling()
      setupRemoteClickHandler()

      sessionStarted = true
      isStreaming = true
      displayStreamActive = true
      hasAudioInput = webRTCComponent.hasAudioInput()
      $navigationEnabled = false
      $isHosting = true
    } catch (e) {
      console.error('Start sharing failed:', e)
      Swal.fire({ position: 'top-end', icon: 'error', title: '启动共享失败', showConfirmButton: false, timer: 1500 })
    }
  }

  const onStartSharing = async (): Promise<void> => {
    try {
      sources = await window.PcConnectApi.getSources()
      showSourcePicker = true
    } catch {
      // Fallback: use browser's getDisplayMedia directly
      await startSharingSession()
    }
  }

  const onSourceSelect = async (sourceId: string): Promise<void> => {
    showSourcePicker = false
    await startSharingSession(sourceId)
  }

  const onSourceCancel = (): void => {
    showSourcePicker = false
  }

  const copyRoomCode = (): void => {
    navigator.clipboard.writeText(roomCode)
    Swal.fire({ position: 'top-end', icon: 'success', title: '已复制房间码', showConfirmButton: false, timer: 1000 })
  }

  const toggleRemoteCursors = (): void => {
    cursorsActive = !cursorsActive
    window.PcConnectApi.toggleRemoteCursors(cursorsActive)
    webRTCComponent.toggleRemoteCursors(cursorsActive)
  }

  const onMicrophoneToggle = (): void => {
    microphoneActive = !microphoneActive
    webRTCComponent.toggleMicrophone()
  }

  const onDisplayStreamToggle = (): void => {
    displayStreamActive = !displayStreamActive
    webRTCComponent.toggleDisplayStream()
    if (!displayStreamActive) {
      cursorsActive = false
      window.PcConnectApi.toggleRemoteCursors(false)
      webRTCComponent.toggleRemoteCursors(false)
    }
  }

  const onDisconnectClick = async (): Promise<void> => {
    await webRTCComponent.disconnect()
    closeSignaling()
    reset()
  }

  const reset = (): void => {
    roomCode = ''
    cursorsActive = false
    displayStreamActive = false
    microphoneActive = true
    isStreaming = false
    sessionStarted = false
    connectedPeers = []
    $navigationEnabled = true
    $isHosting = false
  }
</script>

<WebRTC bind:connectionState bind:this={webRTCComponent} />

{#if showSourcePicker}
  <SourcePicker sources={sources} onSelect={onSourceSelect} onCancel={onSourceCancel} />
{/if}

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
      {#if connectedPeers.length > 0}
        <p class="mt-3">已连接: {connectedPeers.length} 个观看者</p>
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
                  <AudioVisualizer className="icon {!visualizerIsActive ? 'is-hidden' : ''}" bind:visualizerIsActive stream={webRTCComponent.getAudioStream()} />
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
      <button class="button is-link is-large" on:click={onStartSharing} disabled={sessionStarted}>
        <span class="icon"><i class="fas fa-play"></i></span>
        <span>{!sessionStarted ? '开始共享' : '正在启动...'}</span>
      </button>
    </div>
  {/if}
</div>
