<script lang="ts">
  import { useActiveView, useNavigationEnabled, useIsWatching, useIsHosting } from './stores'
  import { L } from './translations'
  const activeView = useActiveView()
  const isHosting = useIsHosting()
  const isWatching = useIsWatching()
  const navigationEnabled = useNavigationEnabled()

  const handleTopButtonsClick = (evt: MouseEvent): void => {
    evt.preventDefault()
    const target = evt.target as HTMLButtonElement
    const root = target.closest('button')
    $activeView = root.dataset.action
  }
</script>

<div class="nav-bar">
  <div class="nav-brand">
    <span class="nav-logo">PC Connect</span>
    {#if $isHosting || $isWatching}
      <span class="tag is-success is-light ml-2" style="font-size: 11px;">会议中</span>
    {/if}
  </div>
  <div class="nav-tabs">
    <button class="nav-tab" class:active={$activeView === 'join'} data-action="join" on:click={handleTopButtonsClick} disabled={!$navigationEnabled && !$isWatching}>
      <i class="fa-solid fa-right-to-bracket"></i> {!$isWatching ? L.join_a_session() : L.joined_a_session()}
    </button>
    <button class="nav-tab" class:active={$activeView === 'host'} data-action="host" on:click={handleTopButtonsClick} disabled={!$navigationEnabled && !$isHosting}>
      <i class="fa-solid fa-earth-africa"></i> {!$isHosting ? L.host_a_session() : L.hosting_a_session()}
    </button>
  </div>
  <div class="nav-actions">
    <button class="nav-tab is-small" class:active={$activeView === 'settings'} data-action="settings" on:click={handleTopButtonsClick}>
      <i class="fa-solid fa-gear"></i>
    </button>
    <button class="nav-tab is-small" class:active={$activeView === 'about'} data-action="about" on:click={handleTopButtonsClick}>
      <i class="fa-solid fa-question"></i>
    </button>
  </div>
</div>

<style>
  .nav-bar { display: flex; align-items: center; justify-content: space-between; padding: 0 20px; height: 52px; background: #1e1e2e; border-bottom: 1px solid #313244; }
  .nav-brand { display: flex; align-items: center; }
  .nav-logo { font-weight: 700; font-size: 16px; color: #cdd6f4; }
  .nav-tabs { display: flex; gap: 4px; }
  .nav-actions { display: flex; gap: 4px; }
  .nav-tab { padding: 8px 14px; border: none; border-radius: 6px; background: transparent; color: #a6adc8; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; }
  .nav-tab:hover { background: rgba(255,255,255,0.06); color: #cdd6f4; }
  .nav-tab.active { background: rgba(137,180,250,0.15); color: #89b4fa; }
  .nav-tab:disabled { opacity: 0.4; cursor: not-allowed; }
  .nav-tab.is-small { padding: 6px 10px; font-size: 14px; }
</style>
