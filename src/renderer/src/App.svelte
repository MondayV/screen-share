<script lang="ts">
  import './styles/themes/cyberpunk.css'
  import './styles/theme-base.css'
  import Navigation from './Navigation.svelte'
  import Meeting from './Meeting.svelte'
  import Settings from './Settings.svelte'
  import About from './About.svelte'
  import { useActiveView, useNavigationEnabled } from './stores'
  import { theme } from './theme'
  import Swal from 'sweetalert2'
  const activeView = useActiveView()
  theme // keep reference so subscription runs

  useNavigationEnabled()
  window.PcConnectApi.onConfirmExit(async () => {
    const r = await Swal.fire({ title: '退出确认', text: '窗口将关闭', icon: 'warning', showCancelButton: true, confirmButtonText: '确定退出', cancelButtonText: '取消' })
    if (r.isConfirmed) window.PcConnectApi.forceClose()
  })
</script>

<Navigation />

<input type="checkbox" id="panel-toggle" class="sr-only" />
<div class="rain-container"><label for="panel-toggle" class="panel-switch">◈ DIAG</label></div>
<div class="rain-layer-2"></div>

{#if $activeView === 'meeting'}
  <Meeting />
{:else if $activeView === 'settings'}
  <Settings />
{:else if $activeView === 'about'}
  <About />
{/if}
