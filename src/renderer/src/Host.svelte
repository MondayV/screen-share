<script lang="ts">
  import { onMount } from 'svelte'
  import Swal from 'sweetalert2'
  import { L } from './translations'
  import { useNavigationEnabled, useIsHosting, useHostUrl } from './stores'
  import {
    mayBeShortCode, hostToServer, pollAnswerFromServer, debounce
  } from './Utils'
  import AudioVisualizer from './AudioVisualizer.svelte'
  import WebRTC from './WebRTC.svelte'

  const navigationEnabled = useNavigationEnabled()
  const isHosting = useIsHosting()

  let webRTCComponent: WebRTC
  let connectionString = useHostUrl()

  let connectionState = 'disconnected'
  let cursorsActive = false
  let displayStreamActive = false
  let microphoneActive = false
  let isStreaming = false
  let sessionStarted = false
  let shortCode = ''
  let connectingParticipant = false
  let hasAudioInput = false
  let visualizerIsActive = true
  let pollingTimer: ReturnType<typeof setInterval> | null = null

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
        connectingParticipant = false
        isStreaming = true
        if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null }
        break
      case 'failed':
        Swal.fire({ position: 'top-end', icon: 'error', title: '连接失败', showConfirmButton: false, timer: 1500 })
        connectingParticipant = false
        if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null }
        break
      case 'closed':
        Swal.fire({
          position: 'center',
          icon: 'info',
          title: '共享已结束',
          text: '对方已断开连接',
          confirmButtonText: '返回',
          allowOutsideClick: false
        }).then(() => { reset() })
        break
    }
  }

  $: connectionState, onConnectionStateChange()

  const toggleRemoteCursors = (): void => {
    cursorsActive = !cursorsActive
    window.PcConnectApi.toggleRemoteCursors(cursorsActive)
    webRTCComponent.ToggleRemoteCursors(cursorsActive)
  }

  onMount(async () => {
    const settings = await window.PcConnectApi.getSettings()
    microphoneActive = settings.isMicrophoneEnabledOnConnect
  })

  const onStartSessionButtonClick = async (): Promise<void> => {
    await webRTCComponent.Setup()
    sessionStarted = true
    $navigationEnabled = false
    $isHosting = true
    hasAudioInput = webRTCComponent.HasAudioInput()

    // Register with signaling server to get short code
    try {
      const desc = await webRTCComponent.CreateHostOffer()
      if (desc) {
        const code = await hostToServer(desc, (await window.PcConnectApi.getSettings()).username)
        shortCode = code
        $connectionString = code

        // Poll for participant's answer
        pollingTimer = setInterval(async () => {
          try {
            const result = await pollAnswerFromServer(code)
            if (result.ready && result.sdp) {
              if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null }
              connectingParticipant = true
              await webRTCComponent.Connect(result.sdp)
            }
          } catch { /* keep polling */ }
        }, 2000)
      }
    } catch (e) {
      Swal.fire({ icon: 'error', title: '无法连接信令服务器', text: '请确认服务器已启动' })
      console.error(e)
    }
  }

  const reset = (): void => {
    if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null }
    $connectionString = ''
    shortCode = ''
    cursorsActive = false
    displayStreamActive = false
    microphoneActive = true
    isStreaming = false
    sessionStarted = false
    connectingParticipant = false
    $navigationEnabled = true
    $isHosting = false
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

  <!-- Streaming controls -->
  <div class={!isStreaming ? 'is-hidden' : ''}>
    <div class="mb-4">
      <button
        title={displayStreamActive ? L.streaming_your_display() : L.not_streaming_your_display()}
        class="button {displayStreamActive ? 'is-success' : 'is-danger'} mr-2"
        on:click={onDisplayStreamToggle}
      >
        <span class="icon"><i class="fa-solid fa-display"></i></span>
      </button>
      {#if hasAudioInput}
        <button
          title={microphoneActive ? L.microphone_active() : L.microphone_inactive()}
          class="button {microphoneActive ? 'is-success' : 'is-danger'} mr-2"
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
      {/if}
      <button
        title={cursorsActive ? L.remote_cursors_enabled() : L.remote_cursors_disabled()}
        class="button {cursorsActive ? 'is-success' : 'is-danger'} mr-2 {!displayStreamActive ? 'is-hidden' : ''}"
        on:click={toggleRemoteCursors}
      >
        <span class="icon"><i class="fas fa-mouse-pointer"></i></span>
      </button>
      <button class="button is-danger" on:click={onDisconnectClick}>
        <span class="icon"><i class="fas fa-unlink"></i></span>
        <span>{L.disconnect()}</span>
      </button>
    </div>
  </div>

  <!-- Pre-session: Start button -->
  <div class={sessionStarted ? 'is-hidden' : ''}>
    <button class="button is-link is-medium" on:click={onStartSessionButtonClick}>
      <span class="icon"><i class="fas fa-play"></i></span>
      <span>{L.start_a_new_session()}</span>
    </button>
  </div>

  <!-- Session ready: show short code -->
  <div class={!sessionStarted || isStreaming ? 'is-hidden' : ''}>
    {#if shortCode}
      <div class="notification is-info">
        <p class="is-size-5 has-text-weight-bold mb-2">连接码</p>
        <p class="is-size-2 has-text-weight-bold has-text-centered my-3" style="letter-spacing: 0.3em; font-family: monospace;">
          {shortCode}
        </p>
        <p class="is-size-7">将此 6 位码发送给对方，等待对方加入。</p>
      </div>
      {#if connectingParticipant}
        <div class="notification is-success is-light">
          <p>对方正在连接中...</p>
        </div>
      {/if}
    {:else}
      <div class="notification is-warning is-light">
        <p>正在生成连接码...</p>
      </div>
    {/if}

    <button class="button is-danger is-small mt-2" on:click={onDisconnectClick}>
      <span class="icon"><i class="fas fa-unlink"></i></span>
      <span>{L.cancel()}</span>
    </button>
  </div>
</div>
