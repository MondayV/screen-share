<script lang="ts">
  import { onMount } from 'svelte'
  import Navigation from './Navigation.svelte'
  import Join from './Join.svelte'
  import Host from './Host.svelte'
  import Settings from './Settings.svelte'
  import About from './About.svelte'
  import { useActiveView, useNavigationEnabled, useIsHosting, useIsWatching, useParticipantUrl, useHostUrl, usePendingJoinCode } from './stores'
  import { getDataFromPcConnectUrl, parseShortLink } from './Utils'
  import { initSignaling, destroySignaling, signalingState } from './signaling'
  import { applyTheme } from './theme'
  import './styles/themes/default.css'
  import './styles/themes/dark.css'
  import './styles/themes/cyberpunk.css'
  import './styles/themes/doodle.css'
  import './styles/themes/pixel.css'

  const activeView = useActiveView()
  const participantUrl = useParticipantUrl()
  const hostUrl = useHostUrl()
  const isHosting = useIsHosting()
  const pendingJoinCode = usePendingJoinCode()
  useNavigationEnabled()
  useIsWatching()

  window.onmessage = async (evt: MessageEvent): Promise<void> => {
    const { data } = evt
    if (data.type !== 'openPcConnectURL') return
    const url = data.url as string

    // Try short-code format first: pc://CODE@HOST:PORT
    const parsed = parseShortLink(url)
    if (parsed && parsed.serverHost) {
      const wsUrl = `ws://${parsed.serverHost}:${parsed.serverPort || 3456}`
      console.log('[App] 连接到远程信令服务器:', wsUrl)
      destroySignaling()
      initSignaling(wsUrl)
      // Wait for signaling to connect, then set join code
      const checkAndJoin = () => {
        const unsub = signalingState.subscribe((state) => {
          if (state === 'connected') {
            unsub()
            $pendingJoinCode = parsed.code
            $activeView = 'join'
          }
        })
        // Fallback after 3 seconds
        setTimeout(() => { unsub(); $pendingJoinCode = parsed.code; $activeView = 'join' }, 3000)
      }
      setTimeout(checkAndJoin, 500)
      return
    }

    if (parsed && !parsed.serverHost) {
      // Short code only (same machine): auto-fill join
      $pendingJoinCode = parsed.code
      $activeView = 'join'
      return
    }

    // Legacy long pc://h/<token> or pc://p/<token> format
    const urlData = await getDataFromPcConnectUrl(url)
    switch (urlData.type) {
      case 'host':
        $activeView = 'join'
        $participantUrl = url
        break
      case 'participant':
        if ($activeView !== 'host' || !$isHosting) return
        $hostUrl = url
        break
    }
  }

  // Wait for main process IPC: signaling server is ready before connecting
  window.addEventListener('message', (evt) => {
    if (evt.data?.type === 'signalServerReady') {
      const port = evt.data.port || 3456
      initSignaling(`ws://localhost:${port}`)
    }
  })

  onMount(async () => {
    // Apply saved theme
    const savedTheme = (typeof localStorage !== 'undefined' && localStorage.getItem('pc-connect-theme')) || 'dark'
    applyTheme(savedTheme as any)

    // Also try direct connection as fallback (server may already be ready)
    try {
      const settings = await window.PcConnectApi.getSettings()
      const wsUrl = (settings.serverUrl || 'http://localhost:3456').replace(/^http/, 'ws')
      setTimeout(() => {
        if ($signalingState === 'connecting') {
          initSignaling(wsUrl)
        }
      }, 1500)
    } catch {
      setTimeout(() => {
        if ($signalingState === 'connecting') {
          initSignaling('ws://localhost:3456')
        }
      }, 1500)
    }
  })
</script>

<div class="app-shell">
  <Navigation />
  <div class="app-body">
    {#if $activeView === 'join'}
      <Join />
    {:else if $activeView === 'host'}
      <Host />
    {:else if $activeView === 'settings'}
      <Settings />
    {:else if $activeView === 'about'}
      <About />
    {/if}
  </div>
</div>

<style>
  :global(*) { margin: 0; padding: 0; box-sizing: border-box; }
  :global(body) { background: var(--bg); color: var(--text); font-family: var(--font); }
  :global(.nav-bar) { background: var(--bg2); border-color: var(--border); }
  :global(.bottom-bar) { background: var(--bg2); border-color: var(--border); }
  :global(.chat-panel) { background: var(--bg2); }
  :global(.reconnect-toast) { position: fixed; top: 60px; left: 50%; transform: translateX(-50%); background: rgba(245,158,11,0.9); color: #fff; padding: 8px 20px; border-radius: 8px; z-index: 9999; font-size: 14px; }
  :global(.reconnect-failed) { background: rgba(220,38,38,0.9); }
  .app-shell { display: flex; flex-direction: column; height: 100vh; }
  .app-body { flex: 1; overflow: hidden; }
</style>
