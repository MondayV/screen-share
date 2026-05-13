<script lang="ts">
  import { onMount } from 'svelte'
  import Navigation from './Navigation.svelte'
  import Join from './Join.svelte'
  import Host from './Host.svelte'
  import Settings from './Settings.svelte'
  import About from './About.svelte'
  import { useActiveView, useNavigationEnabled, useIsHosting, useIsWatching, useParticipantUrl, useHostUrl } from './stores'
  import { getDataFromPcConnectUrl } from './Utils'
  import { initSignaling, destroySignaling, signalingState, setSignalingUrl } from './signaling'

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

  onMount(async () => {
    // Auto-connect signaling with server URL from settings
    try {
      const settings = await window.PcConnectApi.getSettings()
      const url = settings.serverUrl || 'http://localhost:3456'
      const wsUrl = url.replace(/^http/, 'ws')
      initSignaling(wsUrl)
    } catch {
      initSignaling('ws://localhost:3456')
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
  :global(body) { background: #11111b; color: #cdd6f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .app-shell { display: flex; flex-direction: column; height: 100vh; }
  .app-body { flex: 1; overflow: hidden; }
</style>
