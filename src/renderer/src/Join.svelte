<script lang="ts">
  import { onMount } from 'svelte'
  import Swal from 'sweetalert2'
  import { L } from './translations'
  import {
    makeVideoDraggable,
    mayBeShortCode,
    getOfferFromServer,
    sendAnswerToServer,
    getUUIDv4
  } from './Utils'
  import { useNavigationEnabled, useIsWatching, useParticipantUrl } from './stores'
  import WebRTC from './WebRTC.svelte'
  import AudioVisualizer from './AudioVisualizer.svelte'

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
  let shortCode = ''
  let codeValid: boolean | null = null
  let codeError = ''
  let connecting = false
  let connectionString = useParticipantUrl()
  let visualizerIsActive: boolean = true

  const onShortCodeChange = (): void => {
    const clean = shortCode.trim().toUpperCase()
    if (clean === '') { codeValid = null; codeError = ''; return }
    if (mayBeShortCode(clean)) {
      codeValid = true
      codeError = ''
    } else {
      codeValid = false
      codeError = '请输入 4-8 位字母数字'
    }
  }

  const onConnectionStateChange = (): void => {
    switch (connectionState) {
      case 'connected':
        Swal.fire({
          position: 'top-end',
          icon: 'success',
          title: '连接建立成功',
          showConfirmButton: false,
          timer: 1500
        })
        connecting = false
        break
      case 'failed':
        Swal.fire({ position: 'top-end', icon: 'error', title: '连接失败', showConfirmButton: false, timer: 1500 })
        connecting = false
        break
      case 'closed':
        Swal.fire({
          position: 'center',
          icon: 'info',
          title: '共享已结束',
          text: '对方已结束共享',
          confirmButtonText: '返回',
          allowOutsideClick: false
        }).then(() => { reset() })
        break
    }
  }

  $: shortCode, onShortCodeChange()
  $: connectionState, onConnectionStateChange()

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

  const onConnectClick = async (): Promise<void> => {
    if (!codeValid) return
    connecting = true
    try {
      // Get host's offer from server
      const offerData = await getOfferFromServer(shortCode.trim().toUpperCase())
      await webRTCComponent.Setup(remoteScreen)
      const answer = await webRTCComponent.ConnectAndGetAnswer(offerData.sdp)
      // Send answer back to server
      const settings = await window.PcConnectApi.getSettings()
      await sendAnswerToServer(shortCode.trim().toUpperCase(), answer, settings.username)
      isConnected = true
      $isWatching = true
      $navigationEnabled = false
    } catch (e) {
      Swal.fire({
        position: 'center',
        icon: 'error',
        title: '连接失败',
        text: e.message || '请确认连接码正确且未过期',
        confirmButtonText: '确定'
      })
      connecting = false
    }
  }

  const reset = (): void => {
    shortCode = ''
    codeValid = null
    codeError = ''
    isStreaming = false
    microphoneActive = false
    isConnected = false
    connecting = false
    $navigationEnabled = true
    $isWatching = false
  }

  const onDisconnectClick = async (): Promise<void> => {
    await webRTCComponent.Disconnect()
    Swal.fire({
      position: 'center',
      icon: 'info',
      title: '共享已结束',
      text: '连接已断开',
      confirmButtonText: '确定',
      allowOutsideClick: false
    }).then(() => { reset() })
  }

  const onFullscreenClick = (): void => {
    remoteScreen.requestFullscreen()
  }
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
</script>

<WebRTC bind:connectionState bind:this={webRTCComponent} />

<div class="container p-5">
  <h1 class="title">
    {#if isStreaming}{L.joined_a_session()}
    {:else if isConnected || connecting}正在连接...
    {:else}{L.join_a_session()}
    {/if}
  </h1>

  <!-- Connected controls -->
  <div class={!isConnected && !connecting ? 'is-hidden' : ''}>
    <div class="mb-4">
      <button
        aria-label={microphoneActive ? L.microphone_active() : L.microphone_inactive()}
        title={microphoneActive ? L.microphone_active() : L.microphone_inactive()}
        class="button {microphoneActive ? 'is-success' : 'is-danger'} mr-2"
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
      <button class="button is-danger" aria-label={L.disconnect()} on:click={onDisconnectClick}>
        <span class="icon"><i class="fas fa-unlink"></i></span>
        <span>{L.disconnect()}</span>
      </button>
    </div>
  </div>

  <!-- Code input (before connection) -->
  <div class={isConnected || connecting ? 'is-hidden' : ''}>
    <div class="field">
      <label class="label is-medium">输入连接码</label>
      <div class="field has-addons">
        <div class="control is-expanded">
          <input
            bind:value={shortCode}
            placeholder="如 A3F7K9"
            class="input is-medium {codeValid === null ? '' : codeValid ? 'is-success' : 'is-danger'}"
            style="font-family: monospace; letter-spacing: 0.2em; text-transform: uppercase;"
            type="text"
            maxlength="8"
            on:keydown={(e) => { if (e.key === 'Enter' && codeValid) onConnectClick() }}
          />
        </div>
        <div class="control">
          <button class="button is-success is-medium {codeValid ? '' : 'is-static'}" on:click={onConnectClick} disabled={!codeValid}>
            {L.connect()}
          </button>
        </div>
      </div>
      {#if codeError}
        <p class="help is-danger">{codeError}</p>
      {:else}
        <p class="help">输入主持人分享的 6 位连接码</p>
      {/if}
    </div>
  </div>
</div>

<!-- Remote screen area -->
<div class={!isConnected && !connecting ? 'is-hidden' : ''}>
  <div class="field px-5">
    <label class="label">{L.remote_screen()}</label>
    <div class="control">
      <div class="video-overflow">
        {#if !isStreaming}
          <div class="video-placeholder has-text-centered p-6">
            <p class="is-size-5 has-text-grey">等待远程屏幕...</p>
          </div>
        {/if}
        <video bind:this={remoteScreen} id="remote_screen" class="video {!isStreaming ? 'is-hidden' : ''}" autoplay playsinline muted></video>
      </div>
    </div>
  </div>
  <div class="field px-5 {!isStreaming ? 'is-hidden' : ''}">
    <div class="control">
      <button class="button is-info mr-2" on:click={onZoomInClick}>
        <span class="icon"><i class="fas fa-search-plus"></i></span>
        <span>{L.zoom_in()}</span>
      </button>
      <button class="button is-info mr-2" on:click={onZoomOutClick}>
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

<style>
  .video { width: 100%; height: auto; transition: transform 0.5s linear; }
  .video-overflow { width: 100%; height: auto; overflow: hidden; min-height: 200px; border: 1px solid #ddd; border-radius: 10px; background: #1a1a1a; }
  .video-placeholder { display: flex; align-items: center; justify-content: center; height: 300px; color: #888; }
</style>
