<script lang="ts">
  import { onMount } from 'svelte'
  import Navigation from './Navigation.svelte'
  import Join from './Join.svelte'
  import Host from './Host.svelte'
  import Settings from './Settings.svelte'
  import About from './About.svelte'
  import { useActiveView, useNavigationEnabled, useIsHosting, useIsWatching, useParticipantUrl, useHostUrl } from './stores'
  import { getDataFromPcConnectUrl } from './Utils'
  import { initSignaling, signalingState } from './signaling'
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
  useNavigationEnabled()
  useIsWatching()

  window.onmessage = async (evt: MessageEvent): Promise<void> => {
    const { data } = evt
    if (data.type !== 'openPcConnectURL') return
    const urlData = await getDataFromPcConnectUrl(data.url)
    switch (urlData.type) {
      case 'host':
        $activeView = 'join'
        $participantUrl = data.url
        break
      case 'participant':
        if ($activeView !== 'host' || !$isHosting) return
        $hostUrl = data.url
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
