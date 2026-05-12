<script lang="ts">
  import { onMount } from 'svelte'
  import Swal from 'sweetalert2'
  import { L } from './translations'
  import { useNavigationEnabled, useIsHosting, useHostUrl } from './stores'
  import { mayBeConnectionString, getDataFromPcConnectUrl, ConnectionType } from './Utils'
  import AudioVisualizer from './AudioVisualizer.svelte'
  import WebRTC from './WebRTC.svelte'

  const navigationEnabled = useNavigationEnabled()
  const isHosting = useIsHosting()

  let webRTCComponent: WebRTC
  let connectButton: HTMLButtonElement
  let copyButton: HTMLButtonElement

  let connectionState = 'disconnected'
  let cursorsActive = false
  let displayStreamActive = false
  let microphoneActive = false
  let isStreaming = false
  let sessionStarted = false
  let connectionStringIsValid: boolean | null = null
  let connectToUserName = ''
  let copyButtonIsLoading = false
  let connectionString = useHostUrl()
  let hasAudioInput = false
  let visualizerIsActive: boolean = true

  const onConnectionStringChange = async (): Promise<void> => {
    if ($connectionString === '') {
      connectionStringIsValid = null
      return
    }
    connectionStringIsValid = mayBeConnectionString(ConnectionType.PARTICIPANT, $connectionString)
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
        break
      case 'failed':
        Swal.fire({
          position: 'top-end',
          icon: 'error',
          title: '连接失败',
          showConfirmButton: false,
          timer: 1500
        })
        break
      case 'closed':
        Swal.fire({
          position: 'top-end',
          icon: 'info',
          title: '连接已关闭',
          showConfirmButton: false,
          timer: 1500
        })
        break
    }
  }

  $: $connectionString, onConnectionStringChange()
  $: connectionState, onConnectionStateChange()

  const toggleRemoteCursors = (): void => {
    cursorsActive = !cursorsActive
    window.PcConnectApi.toggleRemoteCursors(cursorsActive)
    webRTCComponent.ToggleRemoteCursors(cursorsActive)
  }

  onMount(async () => {
    const settings = await window.PcConnectApi.getSettings()
    microphoneActive = settings.isMicrophoneEnabledOnConnect
    connectButton.addEventListener('click', async () => {
      const data = await getDataFromPcConnectUrl($connectionString)
      await webRTCComponent.Connect(data.rtcSessionDescription)
      isStreaming = true
      displayStreamActive = true
    })
    copyButton.addEventListener('click', async () => {
      copyButtonIsLoading = true
      const offer = await webRTCComponent.CreateHostUrl({
        username: settings.username
      })
      navigator.clipboard.writeText(offer)
      setTimeout(() => {
        copyButtonIsLoading = false
      }, 400)
    })
  })
  const onStartSessionButtonClick = async (): Promise<void> => {
    await webRTCComponent.Setup()
    sessionStarted = true
    $navigationEnabled = false
    $isHosting = true
    hasAudioInput = webRTCComponent.HasAudioInput()
  }
  const reset = (): void => {
    $connectionString = ''
    cursorsActive = false
    displayStreamActive = false
    microphoneActive = true
    isStreaming = false
    sessionStarted = false
    connectionStringIsValid = null
    copyButtonIsLoading = false
    $navigationEnabled = true
    $isHosting = false
  }
  const onDisconnectClick = async (): Promise<void> => {
    await webRTCComponent.Disconnect()
    reset()
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
  </div>

  <div class="fixed-grid has-2-cols">
    <div class="grid">
      <!-- Start session button (visible before session) -->
      <div class="cell {sessionStarted ? 'is-hidden' : ''}">
        <button class="button is-link" disabled={sessionStarted} on:click={onStartSessionButtonClick}>
          <span class="icon"><i class="fas fa-play"></i></span>
          <span>{L.start_a_new_session()}</span>
        </button>
      </div>

      <!-- After session started: show controls -->
      <div class="cell {!sessionStarted || isStreaming ? 'is-hidden' : ''}">
        <button class="button is-link {copyButtonIsLoading ? 'is-loading' : ''}" bind:this={copyButton}>
          <span class="icon"><i class="fas fa-copy"></i></span>
          <span>{L.copy_my_connection_string()}</span>
        </button>
      </div>

      <div class="cell {!sessionStarted || isStreaming ? 'is-hidden' : ''}">
        <button class="button is-danger" on:click={onDisconnectClick}>
          <span class="icon"><i class="fas fa-unlink"></i></span>
          <span>{L.cancel()}</span>
        </button>
      </div>
    </div>

    <!-- Participant connection input (after session started, before streaming) -->
    <div class="cell {!sessionStarted || isStreaming ? 'is-hidden' : ''}">
      <div class="field has-addons">
        <div class="control has-icons-left has-icons-right">
          <input
            bind:value={$connectionString}
            placeholder="输入参与者的连接码"
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
    </div>
  </div>

  <!-- Status message when session is ready but not yet streaming -->
  <div class={sessionStarted && !isStreaming ? '' : 'is-hidden'}>
    <div class="notification is-info">
      <p><strong>共享已准备就绪</strong> — 复制连接码发送给对方，等待对方连接。</p>
      <p class="is-size-7 mt-2">对方连接后，在此输入对方返回的连接码以完成连接。</p>
    </div>
  </div>
</div>
