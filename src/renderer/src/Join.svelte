<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import Swal from 'sweetalert2'
  import { L } from './translations'
  import { makeVideoDraggable, getUUIDv4 } from './Utils'
  import { useNavigationEnabled, useIsWatching } from './stores'
  import WebRTC from './WebRTC.svelte'
  import AudioVisualizer from './AudioVisualizer.svelte'
  import { connectToRoom, sendToAll, on, off, closeSignaling } from './lib/signaling'

  const navigationEnabled = useNavigationEnabled()
  const isWatching = useIsWatching()

  let connectionState = 'disconnected'
  let webRTCComponent: WebRTC
  let remoteScreen: HTMLVideoElement
  let UUID = getUUIDv4()
  let zoomFactor = 1
  let microphoneActive = false
  let isStreaming = false
  let isConnected = false
  let roomCode = ''
  let joinAttempting = false
  let visualizerIsActive = true
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

  const onJoinClick = async (): Promise<void> => {
    console.log('[Join] 加入按钮被点击, roomCode:', roomCode)
    if (!roomCode || roomCode.length !== 6 || joinAttempting || isConnected) return
    joinAttempting = true
    try {
      await webRTCComponent.Setup(remoteScreen)

      webRTCComponent.SetIceCandidateHandler((candidate) => {
        sendToAll({ type: 'ice-candidate', candidate })
      })

      const onIceMsg = (msg: any): void => {
        if (msg.candidate) webRTCComponent.AddIceCandidate(msg.candidate)
      }
      on('ice-candidate', onIceMsg)
      signalingCleanup.push({ event: 'ice-candidate', cb: onIceMsg })

      const onOffer = async (msg: any): Promise<void> => {
        try {
          const answer = await webRTCComponent.HandleHostOffer(msg.offer)
          sendToAll({ type: 'answer', answer })
          isConnected = true
          $isWatching = true
          $navigationEnabled = false
        } catch (e) {
          console.error('Failed to handle offer:', e)
        }
      }
      on('offer', onOffer)
      signalingCleanup.push({ event: 'offer', cb: onOffer })

      const onPeerLeft = (): void => { reset() }
      on('peer-left', onPeerLeft)
      signalingCleanup.push({ event: 'peer-left', cb: onPeerLeft })

      const onClose = (): void => { reset() }
      on('close', onClose)
      signalingCleanup.push({ event: 'close', cb: onClose })

      await connectToRoom(roomCode)
    } catch (e) {
      console.error('Join failed:', e)
      Swal.fire({ position: 'top-end', icon: 'error', title: '加入房间失败', showConfirmButton: false, timer: 2000 })
    } finally {
      joinAttempting = false
    }
  }

  onMount(async () => {
    const settings = await window.PcConnectApi.getSettings()
    microphoneActive = settings.isMicrophoneEnabledOnConnect
    makeVideoDraggable(remoteScreen)
    remoteScreen.addEventListener('dblclick', () => {
      webRTCComponent.PingRemoteCursor('cursor-' + UUID)
    })
    remoteScreen.addEventListener('mousemove', (e) => {
      const { offsetX, offsetY } = e
      webRTCComponent.UpdateRemoteCursor({
        x: offsetX / remoteScreen.clientWidth,
        y: offsetY / remoteScreen.clientHeight,
        name: settings.username,
        id: 'cursor-' + UUID,
        color: settings.color
      })
    })
    remoteScreen.addEventListener('play', () => {
      if (!webRTCComponent.IsConnected()) return
      isStreaming = true
    })
  })

  onDestroy(() => {
    signalingCleanup.forEach(({ event, cb }) => off(event, cb))
  })

  const reset = (): void => {
    roomCode = ''
    isStreaming = false
    microphoneActive = false
    isConnected = false
    $navigationEnabled = true
    $isWatching = false
    signalingCleanup.forEach(({ event, cb }) => off(event, cb))
    signalingCleanup.length = 0
  }

  const onDisconnectClick = async (): Promise<void> => {
    const result = await Swal.fire({
      title: '断开连接',
      text: '确定要断开当前连接吗？',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    if (!result.isConfirmed) return
    await webRTCComponent.Disconnect()
    closeSignaling()
    reset()
    Swal.fire({ position: 'top-end', icon: 'info', title: '连接已断开', showConfirmButton: false, timer: 1500 })
  }

  const onFullscreenClick = (): void => remoteScreen.requestFullscreen()
  const onZoomInClick = (): void => {
    zoomFactor += 0.1
    remoteScreen.style.scale = zoomFactor.toString()
  }
  const onZoomOutClick = (): void => {
    if (zoomFactor <= 1) return
    zoomFactor -= 0.1
    remoteScreen.style.scale = zoomFactor.toString()
  }
  const onMicrophoneToggle = async (): Promise<void> => {
    microphoneActive = !microphoneActive
    webRTCComponent.ToggleMicrophone()
  }

  const onRoomCodeInput = (e: Event): void => {
    const input = e.target as HTMLInputElement
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    roomCode = input.value
  }
</script>

<WebRTC bind:connectionState bind:this={webRTCComponent} />

<div class="container p-5">
  <h1 class="title">{!isStreaming ? L.join_a_session() : L.joined_a_session()}</h1>

  <div class={!isStreaming ? 'is-hidden' : ''}>
    <div class="fixed-grid">
      <div class="grid">
        <div class="cell">
          <button
            aria-label={microphoneActive ? L.microphone_active() : L.microphone_inactive()}
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
        </div>
        <div class="cell has-text-right">
          <button class="button is-danger" aria-label={L.disconnect()} on:click={onDisconnectClick}>
            <span class="icon"><i class="fas fa-unlink"></i></span>
            <span>{L.disconnect()}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
  <div class={isStreaming ? 'is-hidden' : ''}>
    <div class="has-text-centered">
      <div class="field">
        <div class="control has-icons-left">
          <input
            class="input is-large"
            type="text"
            maxlength="6"
            placeholder="输入6位房间码"
            style="font-family: monospace; font-size: 2rem; text-align: center; letter-spacing: 6px; text-transform: uppercase; max-width: 300px; margin: 0 auto;"
            on:input={onRoomCodeInput}
            value={roomCode}
          />
          <span class="icon is-left"><i class="fas fa-key"></i></span>
        </div>
      </div>
      <button
        class="button is-link is-large"
        on:click={onJoinClick}
        disabled={roomCode.length !== 6 || joinAttempting || isConnected}
      >
        <span class="icon"><i class="fas fa-link"></i></span>
        <span>{joinAttempting ? '正在加入...' : '加入房间'}</span>
      </button>
    </div>
</div>
</div>

<div class={!isStreaming ? 'is-hidden' : ''}>
  <div>
    <div class="field">
      <label class="label" for="remote_screen">{L.remote_screen()}</label>
      <div class="control">
        <div class="video-overflow">
          <video bind:this={remoteScreen} id="remote_screen" class="video" autoplay playsinline muted></video>
        </div>
      </div>
    </div>
    <div class="field">
      <div class="control">
        <button class="button is-info" on:click={onZoomInClick}>
          <span class="icon"><i class="fas fa-search-plus"></i></span>
          <span>{L.zoom_in()}</span>
        </button>
        <button class="button is-info" on:click={onZoomOutClick}>
          <span class="icon"><i class="fas fa-search-minus"></i></span>
          <span>{L.zoom_out()}</span>
        </button>
        <button class="button is-info" on:click={onFullscreenClick}>
          <span class="icon"><i class="fas fa-expand"></i></span>
          <span>{L.fullscreen()}</span>
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .video { width: 100%; height: auto; transition: transform 0.5s linear; }
  .video-overflow { width: 100%; height: auto; overflow: hidden; }
</style>
