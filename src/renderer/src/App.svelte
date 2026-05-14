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
  import { theme as themeStore, applyTheme } from './theme'

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
  :global(body) { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  :global([data-theme="dark"]) { --bg: #11111b; --bg2: #1e1e2e; --border: #313244; --text: #cdd6f4; --text2: #a6adc8; --accent: #89b4fa; }
  :global([data-theme="light"]) { --bg: #f5f5f5; --bg2: #ffffff; --border: #ddd; --text: #333; --text2: #666; --accent: #0066cc; }
  :global(body) { background: var(--bg); color: var(--text); }
  :global(.nav-bar) { background: var(--bg2); border-color: var(--border); }
  :global(.bottom-bar) { background: var(--bg2); border-color: var(--border); }
  :global(.chat-panel) { background: var(--bg2); }
  :global(.chat-header) { border-color: var(--border); }
  :global(.chat-emoji-bar), :global(.chat-input-row) { border-color: var(--border); }
  .app-shell { display: flex; flex-direction: column; height: 100vh; }
  .app-body { flex: 1; overflow: hidden; }
</style>
