<script lang="ts">
  import { onMount } from 'svelte'
  import Swal from 'sweetalert2'
  import { L } from './translations'
  import { makeVideoDraggable, getUUIDv4 } from './Utils'
  import { useNavigationEnabled, useIsWatching } from './stores'
  import WebRTC from './WebRTC.svelte'
  import AudioVisualizer from './AudioVisualizer.svelte'
  import { connectToRoom, sendTo, on, closeSignaling } from './lib/signaling'

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

  const onConnectionStateChange = (): void => {
    switch (connectionState) {
      case 'connected':
        isStreaming = true
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

  const onJoinClick = async (): Promise<void> => {
    if (!roomCode || roomCode.length !== 6) return
    joinAttempting = true
    try {
      await webRTCComponent.init()
      webRTCComponent.setRemoteVideo(remoteScreen)

      webRTCComponent.setIceCandidateCallback((peerId, candidate) => {
        sendTo(peerId, { type: 'ice-candidate', candidate } as any)
      })

      on('offer', async (msg) => {
        try {
          const answer = await webRTCComponent.handleOffer(msg.from, msg.offer)
          sendTo(msg.from, { type: 'answer', answer } as any)
          isConnected = true
          $isWatching = true
          $navigationEnabled = false
        } catch (e) {
          console.error('Failed to handle offer:', e)
        }
      })

      on('ice-candidate', (msg) => {
        webRTCComponent.addIceCandidate(msg.from, msg.candidate)
      })

      on('peer-left', () => {
        reset()
      })

      on('close', () => {
        reset()
      })

      await connectToRoom(roomCode)
    } catch (e) {
      console.error('Join failed:', e)
      Swal.fire({ position: 'top-end', icon: 'error', title: '加入房间失败', showConfirmButton: false, timer: 1500 })
    } finally {
      joinAttempting = false
    }
  }

  onMount(async () => {
    const settings = await window.PcConnectApi.getSettings()
    microphoneActive = settings.isMicrophoneEnabledOnConnect
    makeVideoDraggable(remoteScreen)

    remoteScreen.addEventListener('dblclick', () => {
      webRTCComponent.pingRemoteCursor('cursor-' + UUID)
    })

    let mouseDown = false
    remoteScreen.addEventListener('mousedown', (e) => {
      mouseDown = true
      const { offsetX, offsetY } = e
      webRTCComponent.sendRemoteClick({
        type: 'mousedown',
        x: offsetX / remoteScreen.clientWidth,
        y: offsetY / remoteScreen.clientHeight
      })
    })
    remoteScreen.addEventListener('mouseup', (e) => {
      mouseDown = false
      const { offsetX, offsetY } = e
      webRTCComponent.sendRemoteClick({
        type: 'mouseup',
        x: offsetX / remoteScreen.clientWidth,
        y: offsetY / remoteScreen.clientHeight
      })
    })
    remoteScreen.addEventListener('click', (e) => {
      const { offsetX, offsetY } = e
      webRTCComponent.sendRemoteClick({
        type: 'click',
        x: offsetX / remoteScreen.clientWidth,
        y: offsetY / remoteScreen.clientHeight
      })
    })
    remoteScreen.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      const { offsetX, offsetY } = e
      webRTCComponent.sendRemoteClick({
        type: 'contextmenu',
        x: offsetX / remoteScreen.clientWidth,
        y: offsetY / remoteScreen.clientHeight
      })
    })
    remoteScreen.addEventListener('mousemove', (e) => {
      const { offsetX, offsetY } = e
      webRTCComponent.updateRemoteCursor({
        x: offsetX / remoteScreen.clientWidth,
        y: offsetY / remoteScreen.clientHeight,
        name: settings.username,
        id: 'cursor-' + UUID,
        color: settings.color
      })
    })
  })

  const reset = (): void => {
    roomCode = ''
    isStreaming = false
    microphoneActive = false
    isConnected = false
    $navigationEnabled = true
    $isWatching = false
  }

  const onDisconnectClick = async (): Promise<void> => {
    await webRTCComponent.disconnect()
    closeSignaling()
    reset()
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
  const onMicrophoneToggle = (): void => {
    microphoneActive = !microphoneActive
    webRTCComponent.toggleMicrophone()
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

  {#if isStreaming}
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
                <AudioVisualizer className="icon {!visualizerIsActive ? 'is-hidden' : ''}" bind:visualizerIsActive stream={webRTCComponent.getAudioStream()} />
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
  {:else}
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
  {/if}
</div>

{#if isStreaming}
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
{/if}

<style>
  .video {
    width: 100%;
    height: auto;
    transition: transform 0.5s linear;
  }
  .video-overflow {
    width: 100%;
    height: auto;
    overflow: hidden;
  }
</style>
