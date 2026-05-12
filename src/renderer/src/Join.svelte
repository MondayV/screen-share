<script lang="ts">
  import { onMount } from 'svelte'
  import Swal from 'sweetalert2'
  import { L } from './translations'
  import {
    makeVideoDraggable,
    mayBeConnectionString,
    getDataFromPcConnectUrl,
    ConnectionType,
    getUUIDv4
  } from './Utils'
  import { useNavigationEnabled, useIsWatching, useParticipantUrl } from './stores'
  import WebRTC from './WebRTC.svelte'
  import AudioVisualizer from './AudioVisualizer.svelte'

  const navigationEnabled = useNavigationEnabled()
  const isWatching = useIsWatching()

  let connectionState = 'disconnected'
  let webRTCComponent: WebRTC
  let connectButton: HTMLButtonElement
  let copyButton: HTMLButtonElement
  let remoteScreen: HTMLVideoElement
  let UUID = getUUIDv4()
  let zoomFactor = 1
  let microphoneActive = false
  let isStreaming = false
  let isConnected = false
  let connectionStringIsValid: boolean | null = null
  let connectToUserName = ''
  let copyButtonIsLoading = false
  let connectionString = useParticipantUrl()
  let visualizerIsActive: boolean = true
  let connecting = false

  const onConnectionStringChange = async (): Promise<void> => {
    if ($connectionString === '') {
      connectionStringIsValid = null
      return
    }
    connectionStringIsValid = mayBeConnectionString(ConnectionType.HOST, $connectionString)
    if (connectionStringIsValid) {
      const data = await getDataFromPcConnectUrl($connectionString)
      connectToUserName = data.data.username
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
        Swal.fire({
          position: 'top-end',
          icon: 'error',
          title: '连接失败',
          showConfirmButton: false,
          timer: 1500
        })
        connecting = false
        break
      case 'closed':
        Swal.fire({
          position: 'top-end',
          icon: 'info',
          title: '连接已关闭',
          showConfirmButton: false,
          timer: 1500
        })
        connecting = false
        break
    }
  }

  $: $connectionString, onConnectionStringChange()
  $: connectionState, onConnectionStateChange()

  onMount(async () => {
    const settings = await window.PcConnectApi.getSettings()
    microphoneActive = settings.isMicrophoneEnabledOnConnect
    makeVideoDraggable(remoteScreen)
    connectButton.addEventListener('click', async () => {
      connecting = true
      await webRTCComponent.Setup(remoteScreen)
      const data = await getDataFromPcConnectUrl($connectionString)
      await webRTCComponent.Connect(data.rtcSessionDescription)
      isConnected = true
      $isWatching = true
      $navigationEnabled = false
    })
    copyButton.addEventListener('click', async () => {
      copyButtonIsLoading = true
      const remoteData = await getDataFromPcConnectUrl($connectionString)
      const data = await webRTCComponent.CreateParticipantUrl(remoteData.rtcSessionDescription, {
        username: settings.username
      })
      navigator.clipboard.writeText(data)
      setTimeout(() => {
        copyButtonIsLoading = false
      }, 400)
    })
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
  const reset = (): void => {
    $connectionString = ''
    connectionStringIsValid = null
    isStreaming = false
    microphoneActive = false
    isConnected = false
    connecting = false
    $navigationEnabled = true
    $isWatching = false
  }
  const onDisconnectClick = async (): Promise<void> => {
    await webRTCComponent.Disconnect()
    reset()
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
    {#if isStreaming}
      {L.joined_a_session()}
    {:else if isConnected || connecting}
      {L.joined_a_session()}...
    {:else}
      {L.join_a_session()}
    {/if}
  </h1>

  <!-- Connected/Streaming controls (visible after connect, even if video hasn't started) -->
  <div class={!isConnected && !connecting ? 'is-hidden' : ''}>
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
                <AudioVisualizer
                  className="icon {!visualizerIsActive ? 'is-hidden' : ''}"
                  bind:visualizerIsActive
                  stream={webRTCComponent.GetAudioStream()}
                />
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

  <div class="fixed-grid has-2-cols">
    <div class="grid">
      <!-- Input form (hidden when connected or connecting) -->
      <div class="cell">
        <div class="field has-addons {isConnected || connecting ? 'is-hidden' : ''}">
          <div class="control has-icons-left has-icons-right">
            <input
              bind:value={$connectionString}
              placeholder={L.host_connection_string()}
              class="input {connectionStringIsValid === null
                ? ''
                : connectionStringIsValid ? 'is-success' : 'is-danger'}"
              type="text"
            />
            <span class="icon is-small is-left"><i class="fas fa-user"></i></span>
            <span class="icon is-small is-right">
              <i class="fas {connectionStringIsValid === null
                ? 'fa-question'
                : connectionStringIsValid ? 'fa-check' : 'fa-times'}"></i>
            </span>
          </div>
          <div class="control">
            <button
              class="button {connectionStringIsValid === null
                ? 'is-link'
                : connectionStringIsValid ? 'is-success' : 'is-danger'}"
              bind:this={connectButton}
              disabled={!connectionStringIsValid}
            >
              <span class="icon"><i class="fas fa-link"></i></span>
              <span>{L.connect()} {connectionStringIsValid ? connectToUserName : ''}</span>
            </button>
          </div>
        </div>
        <!-- Copy participant URL button (visible after connected, before streaming) -->
        <div class="control {!isConnected || isStreaming ? 'is-hidden' : ''}">
          <button
            class="button is-link {copyButtonIsLoading ? 'is-loading' : ''}"
            bind:this={copyButton}
          >
            <span class="icon"><i class="fas fa-copy"></i></span>
            <span>{L.copy_my_connection_string()}</span>
          </button>
        </div>
      </div>
      <div class="cell">
        <button
          class="button is-danger {isStreaming || !isConnected ? 'is-hidden' : ''}"
          on:click={onDisconnectClick}
        >
          <span class="icon"><i class="fas fa-unlink"></i></span>
          <span>{L.cancel()}</span>
        </button>
      </div>
    </div>
  </div>
</div>

<!-- Remote screen area (visible when connected or connecting, even before video plays) -->
<div class={!isConnected && !connecting ? 'is-hidden' : ''}>
  <div class="field">
    <label class="label" for="remote_screen">{L.remote_screen()}</label>
    <div class="control">
      <div class="video-overflow">
        {#if !isStreaming}
          <div class="video-placeholder has-text-centered p-6">
            <p class="is-size-5 has-text-grey">
              等待远程屏幕...<br/>
              <span class="is-size-7">请确保对方已接受连接并共享屏幕</span>
            </p>
          </div>
        {/if}
        <video
          bind:this={remoteScreen}
          id="remote_screen"
          class="video {!isStreaming ? 'is-hidden' : ''}"
          autoplay playsinline muted
        ></video>
      </div>
    </div>
  </div>
  <div class="field {!isStreaming ? 'is-hidden' : ''}">
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
    min-height: 200px;
    border: 1px solid #ddd;
    border-radius: 10px;
    background: #1a1a1a;
  }
  .video-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    color: #888;
  }
</style>
