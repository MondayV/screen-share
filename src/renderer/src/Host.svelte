<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import Swal from 'sweetalert2'
  import { L } from './translations'
  import { useNavigationEnabled, useIsHosting, useHostUrl } from './stores'
  import { signalingState, sendSignal, onSignalMessage, offSignalMessage } from './signaling'
  import AudioVisualizer from './AudioVisualizer.svelte'
  import WebRTC from './WebRTC.svelte'
  import Chat from './Chat.svelte'
  import QuickReactions from './QuickReactions.svelte'
  import RemoteControl from './RemoteControl.svelte'
  import RecordButton from './RecordButton.svelte'
  import PictureInPicture from './PictureInPicture.svelte'

  import type { ChatMessage } from './Chat.svelte'

  const navigationEnabled = useNavigationEnabled()
  const isHosting = useIsHosting()

  let webRTCComponent: WebRTC
  let remoteControl: RemoteControl
  let chatComponent: Chat
  let quickReactions: QuickReactions
  let connectionString = useHostUrl()

  let connectionState = 'disconnected'
  let cursorsActive = false
  let displayStreamActive = false
  let microphoneActive = false
  let isStreaming = false
  let isSharing = false
  let shortCode = ''
  let codeCopied = false

  const copyCode = () => {
    if (!shortCode) return
    navigator.clipboard.writeText(shortCode)
    codeCopied = true
    setTimeout(() => codeCopied = false, 2000)
  }
  let hasAudioInput = false
  let visualizerIsActive = true
  let showChat = false
  let showAnnotation = false
  let remoteControlActive = false
  let cameraStream: MediaStream | null = null
  let reconnectState = ''

  const onConnectionStateChange = (): void => {
    switch (connectionState) {
      case 'connected':
        Swal.fire({ position: 'top-end', icon: 'success', title: '连接建立成功', showConfirmButton: false, timer: 1500 })
        isStreaming = true
        break
      case 'failed':
        Swal.fire({ position: 'top-end', icon: 'error', title: '连接失败', showConfirmButton: false, timer: 1500 })
        break
      case 'closed':
        Swal.fire({ position: 'center', icon: 'info', title: '共享已结束', text: '对方已断开连接', confirmButtonText: '返回', allowOutsideClick: false }).then(() => { reset() })
        break
    }
  }

  $: connectionState, onConnectionStateChange()

  const onStartSessionButtonClick = async (): Promise<void> => {
    try {
      await webRTCComponent.Setup(null, true)
      isSharing = true
      $navigationEnabled = false
      $isHosting = true
      hasAudioInput = webRTCComponent.HasAudioInput()
      cameraStream = webRTCComponent.GetCameraStream()
      try { await window.PcConnectApi.toggleFloatingWindow(true) } catch {}

      const desc = await webRTCComponent.CreateHostOffer()
      if (desc) {
        const settings = await window.PcConnectApi.getSettings()
        sendSignal({ type: 'host-offer', sdp: desc, username: settings.username })
      }
    } catch (e) {
      Swal.fire({ icon: 'error', title: '共享启动失败', text: '请重试' })
      reset()
    }
  }

  // Handle WebSocket signaling messages
  onMount(() => {
    onSignalMessage('code', (data) => {
      shortCode = data.code
      $connectionString = data.code
    })

    onSignalMessage('participant-answer', async (data) => {
      await webRTCComponent.Connect(data.sdp)
    })
  })

  onDestroy(() => {
    offSignalMessage('code')
    offSignalMessage('participant-answer')
  })

  // Wire up data channels
  $: if (webRTCComponent && isSharing) {
    webRTCComponent.onReconnectNeeded = async () => {
      try {
        const desc = await webRTCComponent.CreateHostOffer()
        if (desc) sendSignal({ type: 'host-offer', sdp: desc, username: (await window.PcConnectApi.getSettings()).username })
      } catch { /* reconnect failed, will retry */ }
    }

    webRTCComponent.SetOnChatMessage((data: any) => { chatComponent?.receiveMessage(data) })
    webRTCComponent.SetOnReaction((data: any) => { quickReactions?.showReceivedReaction(data.emoji) })
    webRTCComponent.SetOnRemoteControl((data: any) => {
      if (data.type === 'request') remoteControl.showRequestDialog(data.from)
      if (data.type === 'end') { remoteControlActive = false; remoteControl.notifyControlEnded() }
    })
  }

  const reset = (): void => {
    window.PcConnectApi.toggleFloatingWindow(false).catch(() => {})
    $connectionString = ''; shortCode = ''; cursorsActive = false
    displayStreamActive = false; microphoneActive = true
    isStreaming = false; isSharing = false
    remoteControlActive = false; showChat = false; showAnnotation = false
    $navigationEnabled = true; $isHosting = false
  }

  const onDisconnectClick = async (): Promise<void> => {
    await webRTCComponent.Disconnect()
    Swal.fire({ position: 'center', icon: 'info', title: '共享已结束', text: '连接已断开', confirmButtonText: '确定', allowOutsideClick: false }).then(() => { reset() })
  }

  const onMicrophoneToggle = () => { microphoneActive = !microphoneActive; webRTCComponent.ToggleMicrophone() }
  const onDisplayStreamToggle = () => { displayStreamActive = !displayStreamActive; webRTCComponent.ToggleDisplayStream() }
  const toggleRemoteCursors = () => { cursorsActive = !cursorsActive; window.PcConnectApi.toggleRemoteCursors(cursorsActive); webRTCComponent.ToggleRemoteCursors(cursorsActive) }

  const onRequestControl = () => sendSignal({ type: 'remote-control', action: 'request' })
  const onGrantControl = () => { remoteControlActive = true; sendSignal({ type: 'remote-control', action: 'grant' }) }
  const onDenyControl = () => sendSignal({ type: 'remote-control', action: 'deny' })
  const onEndControl = () => { remoteControlActive = false; sendSignal({ type: 'remote-control', action: 'end' }) }

  const onSendChat = (msg: ChatMessage) => webRTCComponent.SendChatMessage(msg)
  const onSendReaction = (emoji: string) => webRTCComponent.SendReaction({ emoji, from: '我' })
</script>

<WebRTC bind:connectionState bind:reconnectState bind:this={webRTCComponent} />
<RemoteControl bind:this={remoteControl} isHost={true} {onRequestControl} {onGrantControl} {onDenyControl} {onEndControl} />

<div class="app-layout">
  <div class="main-area">
    {#if !isSharing}
      <div class="welcome-screen">
        <h1 class="title has-text-centered">{L.host_a_session()}</h1>
        <div class="has-text-centered mt-6">
          {#if $signalingState === 'connecting'}
            <button class="button is-link is-large" disabled>
              <span class="icon"><i class="fas fa-spinner fa-pulse"></i></span>
              <span>正在连接信令服务...</span>
            </button>
          {:else if $signalingState === 'error'}
            <div class="notification is-danger is-light" style="max-width: 400px; margin: 0 auto;">
              <p>信令服务连接失败</p>
              <p class="is-size-7 mt-2">请检查网络后重启应用</p>
            </div>
          {:else}
            <button class="button is-link is-large" on:click={onStartSessionButtonClick}>
              <span class="icon"><i class="fas fa-play"></i></span>
              <span>{L.start_a_new_session()}</span>
            </button>
          {/if}
        </div>
      </div>
    {:else if isSharing && !isStreaming}
      <div class="share-ready">
        <div class="notification is-info is-light">
          <p class="is-size-4 has-text-weight-bold mb-2">连接码</p>
          <p class="is-size-1 has-text-weight-bold has-text-centered my-4" style="letter-spacing: 0.3em; font-family: monospace;">{shortCode || '...'}</p>
          <button class="button is-info is-small" on:click={copyCode} disabled={!shortCode}>
            <span class="icon"><i class="fas {codeCopied ? 'fa-check' : 'fa-copy'}"></i></span>
            <span>{codeCopied ? '已复制' : '复制连接码'}</span>
          </button>
          <p class="is-size-7 mt-2">将 6 位码发送给对方，等待连接</p>
        </div>
        <button class="button is-danger is-small mt-2" on:click={onDisconnectClick}>取消</button>
      </div>
    {:else}
      <div class="green-border"></div>
      {#if cameraStream}
        <PictureInPicture stream={cameraStream} visible={true} />
      {/if}
      {#if reconnectState === 'reconnecting'}
        <div class="reconnect-toast">网络不稳定，正在重连...</div>
      {:else if reconnectState === 'failed'}
        <div class="reconnect-toast reconnect-failed">
          连接丢失，请检查网络
          <button class="button is-small is-warning ml-2" on:click={() => { if (webRTCComponent.onReconnectNeeded) webRTCComponent.onReconnectNeeded() }}>手动重试</button>
        </div>
      {/if}
    {/if}
  </div>

  {#if isStreaming}
    <div class="sidebar" class:open={showChat}>
      <Chat bind:this={chatComponent} {onSendChat} visible={true} />
    </div>
  {/if}
</div>

{#if isSharing}
  <div class="bottom-bar">
    <div class="bottom-controls">
      <button class="ctrl-btn" title="麦克风" on:click={onMicrophoneToggle}>
        <i class="fas {microphoneActive ? 'fa-microphone' : 'fa-microphone-slash'}" style="color: {microphoneActive ? '#2ecc71' : '#e74c3c'}"></i>
      </button>
      <button class="ctrl-btn" title="屏幕" on:click={onDisplayStreamToggle}>
        <i class="fa-solid fa-display" style="color: {displayStreamActive ? '#2ecc71' : '#e74c3c'}"></i>
      </button>
      <button class="ctrl-btn" title="远程光标" on:click={toggleRemoteCursors}>
        <i class="fas fa-mouse-pointer" style="color: {cursorsActive ? '#2ecc71' : '#aaa'}"></i>
      </button>
      {#if isStreaming}
        <RecordButton stream={null} />
        <button class="ctrl-btn" title="聊天" on:click={() => showChat = !showChat}>
          <i class="fas fa-comment" style="color: {showChat ? '#89b4fa' : '#aaa'}"></i>
        </button>
      {/if}
      <button class="ctrl-btn ctrl-end" title="结束共享" on:click={onDisconnectClick}>
        <i class="fas fa-phone-slash"></i>
      </button>
    </div>
    {#if isStreaming}
      <QuickReactions bind:this={quickReactions} {onSendReaction} visible={true} />
    {/if}
  </div>
{/if}

<style>
  :global(.green-border) { position: fixed; top: 0; left: 0; right: 0; bottom: 0; border: 3px solid #4CAF50; pointer-events: none; z-index: 9998; }
  .app-layout { display: flex; height: calc(100vh - 120px); }
  .main-area { flex: 1; display: flex; align-items: center; justify-content: center; }
  .welcome-screen, .share-ready { text-align: center; }
  .sidebar { width: 0; overflow: hidden; transition: width 0.3s; }
  .sidebar.open { width: 300px; min-width: 300px; }
  .bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; background: var(--bg2); border-top: 1px solid var(--border); padding: 8px 0; z-index: 100; }
  .bottom-controls { display: flex; gap: 12px; justify-content: center; align-items: center; }
  .ctrl-btn { width: 48px; height: 48px; border: none; border-radius: 50%; background: rgba(255,255,255,0.05); cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; color: var(--text); }
  .ctrl-btn:hover { background: rgba(255,255,255,0.1); }
  .ctrl-end { background: #e74c3c !important; color: #fff; }
</style>
