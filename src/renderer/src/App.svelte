<script lang="ts">
  import './styles/themes/dark.css'
  import './styles/themes/cyberpunk.css'
  import './styles/theme-base.css'
  import Navigation from './Navigation.svelte'
  import Join from './Join.svelte'
  import Host from './Host.svelte'
  import Settings from './Settings.svelte'
  import About from './About.svelte'
  import {
    useActiveView,
    useNavigationEnabled,
    useIsHosting,
    useIsWatching,
    useParticipantUrl,
    useHostUrl
  } from './stores'
  import { theme } from './theme'
  import { getDataFromPcConnectUrl } from './Utils'
  const activeView = useActiveView()
  theme // keep reference so subscription runs
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

<Navigation />

{#if $activeView === 'join'}
  <Join />
{:else if $activeView === 'host'}
  <Host />
{:else if $activeView === 'settings'}
  <Settings />
{:else if $activeView === 'about'}
  <About />
{/if}
