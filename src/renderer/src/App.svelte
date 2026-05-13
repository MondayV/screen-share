<script lang="ts">
  import Navigation from './Navigation.svelte'
  import Join from './Join.svelte'
  import Host from './Host.svelte'
  import Settings from './Settings.svelte'
  import About from './About.svelte'
  import { useActiveView, useNavigationEnabled, useIsHosting, useIsWatching, useParticipantUrl, useHostUrl } from './stores'
  import { getDataFromPcConnectUrl } from './Utils'
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
