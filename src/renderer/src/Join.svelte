<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import Swal from 'sweetalert2'
  import { L } from './translations'
  import { makeVideoDraggable, mayBeShortCode, getUUIDv4 } from './Utils'
  import { useNavigationEnabled, useIsWatching, useParticipantUrl } from './stores'
  import { signalingState, sendSignal, onSignalMessage, offSignalMessage } from './signaling'
  import WebRTC from './WebRTC.svelte'
  import AudioVisualizer from './AudioVisualizer.svelte'
  import Annotation from './Annotation.svelte'
  import Chat from './Chat.svelte'
  import QuickReactions from './QuickReactions.svelte'
  import RemoteControl from './RemoteControl.svelte'
  import RecordButton from './RecordButton.svelte'

  import type { ChatMessage } from './Chat.svelte'
  import type { AnnotationData } from './Annotation.svelte'

  const navigationEnabled = useNavigationEnabled()
  const isWatching = useIsWatching()

  let connectionState = 'disconnected'
  let webRTCComponent: WebRTC
  let remoteScreen: HTMLVideoElement
  let annotationComponent: Annotation
  let remoteControl: RemoteControl
  let chatComponent: Chat
  let quickReactions: QuickReactions
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
  let showAnnotation = false
  let showChat = false
  let remoteControlActive = false
  let reconnectState = ''

  const onShortCodeChange = (): void => {
    const clean = shortCode.trim().toUpperCase()
    if (clean === '') { codeValid = null; codeError = ''; return }
    codeValid = mayBeShortCode(clean)
    codeError = codeValid ? '' : '请输入 4-8 位字母数字'
  }

  const onConnectionStateChange = (): void => {
    switch (connectionState) {
      case 'connected':
        Swal.fire({ position: 'top-end', icon: 'success', title: '连接建立成功', showConfirmButton: false, timer: 1500 })
        connecting = false
        break
      case 'failed':
        Swal.fire({ position: 'top-end', icon: 'error', title: '连接失败', showConfirmButton: false, timer: 1500 })
        connecting = false
        break
      case 'closed':
        Swal.fire({ position: 'center', icon: 'info', title: '共享已结束', text: '对方已结束共享', confirmButtonText: '返回', allowOutsideClick: false }).then(() => { reset() })
        break
    }
  }

  $: shortCode, onShortCodeChange()
  $: connectionState, onConnectionStateChange()

  onMount(async () => {
    const settings = await window.PcConnectApi.getSettings()
    microphoneActive = settings.isMicrophoneEnabledOnConnect
    makeVideoDraggable(remoteScreen)
    if (remoteScreen) {
      remoteScreen.addEventListener('dblclick', () => webRTCComponent.PingRemoteCursor('cursor-' + UUID))
      remoteScreen.addEventListener('mousemove', (e) => {
        const { offsetX, offsetY } = e
        webRTCComponent.UpdateRemoteCursor({ x: offsetX / remoteScreen.clientWidth, y: offsetY / remoteScreen.clientHeight, name: settings.username, id: 'cursor-' + UUID, color: settings.color })
      })
      remoteScreen.addEventListener('play', () => { if (!webRTCComponent.IsConnected()) return; isStreaming = true })
    }

    // Handle WebSocket signaling
    onSignalMessage('offer', async (data) => {
      try {
        await webRTCComponent.Setup(remoteScreen, false)
        const answer = await webRTCComponent.ConnectAndGetAnswer(data.sdp)
        const s = await window.PcConnectApi.getSettings()
        sendSignal({ type: 'participant-answer', code: shortCode.trim().toUpperCase(), sdp: answer, username: s.username })
        isConnected = true
        $isWatching = true
        $navigationEnabled = false
      } catch (e) {
        Swal.fire({ position: 'center', icon: 'error', title: '连接失败', text: '建立连接时出错', confirmButtonText: '确定' })
        connecting = false
      }
    })

    onSignalMessage('error', (data) => {
      Swal.fire({ position: 'center', icon: 'error', title: '连接失败', text: data.message || '请确认连接码正确', confirmButtonText: '确定' })
      connecting = false
    })

    webRTCComponent.onReconnectNeeded = () => {
      if (shortCode) sendSignal({ type: 'join', code: shortCode.trim().toUpperCase() })
    }
  })

  onDestroy(() => {
    offSignalMessage('offer')
    offSignalMessage('error')
  })

  const onConnectClick = async (): Promise<void> => {
    if (!codeValid) return
    connecting = true
    sendSignal({ type: 'join', code: shortCode.trim().toUpperCase() })
  }

  const reset = (): void => {
    shortCode = ''; codeValid = null; codeError = ''; isStreaming = false
    microphoneActive = false; isConnected = false; connecting = false
    remoteControlActive = false; showChat = false; showAnnotation = false
    $navigationEnabled = true; $isWatching = false
  }

  const onDisconnectClick = async (): Promise<void> => {
    await webRTCComponent.Disconnect()
    Swal.fire({ position: 'center', icon: 'info', title: '共享已结束', text: '连接已断开', confirmButtonText: '确定', allowOutsideClick: false }).then(() => { reset() })
  }

  const onFullscreenClick = () => remoteScreen.requestFullscreen()
  const onZoomInClick = () => { zoomFactor += 0.1; remoteScreen.style.scale = zoomFactor.toString() }
  const onZoomOutClick = () => { if (zoomFactor <= 1) return; zoomFactor -= 0.1; remoteScreen.style.scale = zoomFactor.toString() }
  const onMicrophoneToggle = () => { microphoneActive = !microphoneActive; webRTCComponent.ToggleMicrophone() }

  const onAnnotationSend = (data: AnnotationData) => webRTCComponent.SendAnnotation(data)

  const onRequestControl = () => sendSignal({ type: 'remote-control', action: 'request' })
  const onEndControl = () => { remoteControlActive = false; sendSignal({ type: 'remote-control', action: 'end' }) }

  const onSendChat = (msg: ChatMessage) => webRTCComponent.SendChatMessage(msg)
  const onSendReaction = (emoji: string) => webRTCComponent.SendReaction({ emoji, from: '我' })
</script>

<WebRTC bind:connectionState bind:reconnectState bind:this={webRTCComponent} />
<RemoteControl bind:this={remoteControl} isHost={false} {onRequestControl} {onEndControl} />

<div class="app-layout">
  <div class="main-area">
    {#if !isConnected && !connecting}
      <div class="join-screen">
        <h1 class="title has-text-centered">{L.join_a_session()}</h1>
        {#if $signalingState !== 'connected'}
          <div class="has-text-centered">
            {#if $signalingState === 'connecting'}
              <p class="has-text-grey"><i class="fas fa-spinner fa-pulse"></i> 正在连接信令服务...</p>
            {:else}
              <p class="has-text-danger">信令服务连接失败，请重启应用</p>
            {/if}
          </div>
        {:else}
          <div class="field has-addons is-centered" style="max-width: 400px; margin: 40px auto;">
            <div class="control is-expanded">
              <input bind:value={shortCode} placeholder="输入连接码 如 A3F7K9" class="input is-medium {codeValid === null ? '' : codeValid ? 'is-success' : 'is-danger'}" style="font-family: monospace; letter-spacing: 0.2em; text-transform: uppercase;" type="text" maxlength="8" on:keydown={(e) => { if (e.key === 'Enter' && codeValid) onConnectClick() }} />
            </div>
            <div class="control">
              <button class="button is-success is-medium" on:click={onConnectClick} disabled={!codeValid}>{L.connect()}</button>
            </div>
          </div>
          {#if codeError}<p class="help is-danger has-text-centered">{codeError}</p>{/if}
        {/if}
      </div>
    {:else if isStreaming}
      {#if reconnectState === 'reconnecting'}
        <div class="reconnect-toast">网络不稳定，正在重连...</div>
      {:else if reconnectState === 'failed'}
        <div class="reconnect-toast reconnect-failed">
          连接丢失，请检查网络
          <button class="button is-small is-warning ml-2" on:click={() => { if (webRTCComponent.onReconnectNeeded) webRTCComponent.onReconnectNeeded() }}>手动重试</button>
        </div>
      {/if}
      <div class="remote-container">
        <div class="video-overflow">
          <video bind:this={remoteScreen} id="remote_screen" class="video" autoplay playsinline muted></video>
        </div>
        <Annotation bind:this={annotationComponent} width={1920} height={1080} enabled={showAnnotation} {onAnnotationSend} />
      </div>
    {:else}
      <div class="connecting-screen has-text-centered">
        <p class="is-size-4">等待远程屏幕...</p>
        <progress class="progress is-small is-link mt-4" max="100" style="width: 300px; margin: 20px auto;"></progress>
      </div>
    {/if}
  </div>

  {#if isConnected}
    <div class="sidebar" class:open={showChat}>
      <Chat bind:this={chatComponent} {onSendChat} visible={true} />
    </div>
  {/if}
</div>

{#if isConnected}
  <div class="bottom-bar">
    <div class="bottom-controls">
      <button class="ctrl-btn" title="麦克风" on:click={onMicrophoneToggle}>
        <i class="fas {microphoneActive ? 'fa-microphone' : 'fa-microphone-slash'}" style="color: {microphoneActive ? '#2ecc71' : '#e74c3c'}"></i>
      </button>
      {#if isStreaming}
        <button class="ctrl-btn" title="批注" on:click={() => showAnnotation = !showAnnotation}>
          <i class="fas fa-pen" style="color: {showAnnotation ? '#89b4fa' : '#aaa'}"></i>
        </button>
        <button class="ctrl-btn" title="放大" on:click={onZoomInClick}><i class="fas fa-search-plus"></i></button>
        <button class="ctrl-btn" title="缩小" on:click={onZoomOutClick}><i class="fas fa-search-minus"></i></button>
        <button class="ctrl-btn" title="全屏" on:click={onFullscreenClick}><i class="fas fa-expand"></i></button>
        <button class="ctrl-btn" title="请求远程控制" on:click={() => remoteControl.requestControl()}>
          <i class="fas fa-mouse" style="color: {remoteControlActive ? '#2ecc71' : '#aaa'}"></i>
        </button>
        <RecordButton stream={remoteScreen?.srcObject || null} />
        <button class="ctrl-btn" title="聊天" on:click={() => showChat = !showChat}>
          <i class="fas fa-comment" style="color: {showChat ? '#89b4fa' : '#aaa'}"></i>
        </button>
      {/if}
      <button class="ctrl-btn ctrl-end" title="断开" on:click={onDisconnectClick}>
        <i class="fas fa-phone-slash"></i>
      </button>
    </div>
    {#if isConnected}
      <QuickReactions bind:this={quickReactions} {onSendReaction} visible={true} />
    {/if}
  </div>
{/if}

<style>
  .app-layout { display: flex; height: calc(100vh - 100px); }
  .main-area { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .join-screen, .connecting-screen { width: 100%; max-width: 500px; }
  .remote-container { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
  .video { width: 100%; height: auto; max-height: 100%; transition: transform 0.3s; }
  .video-overflow { overflow: hidden; width: 100%; height: 100%; }
  .sidebar { width: 0; overflow: hidden; transition: width 0.3s; }
  .sidebar.open { width: 300px; min-width: 300px; }
  .bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; background: var(--bg2); border-top: 1px solid var(--border); padding: 8px 0; z-index: 100; }
  .bottom-controls { display: flex; gap: 12px; justify-content: center; align-items: center; flex-wrap: wrap; }
  .ctrl-btn { width: 44px; height: 44px; border: none; border-radius: 50%; background: rgba(255,255,255,0.05); cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; color: var(--text); }
  .ctrl-btn:hover { background: rgba(255,255,255,0.1); }
  .ctrl-end { background: #e74c3c !important; color: #fff; }
</style>
