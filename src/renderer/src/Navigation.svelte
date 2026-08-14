<script lang="ts">
  import { useActiveView, useNavigationEnabled } from './stores'
  const activeView = useActiveView()
  const navigationEnabled = useNavigationEnabled()

  const tabs = [
    { action: 'meeting', label: '会议', icon: 'fa-users' },
    { action: 'settings', label: '设置', icon: 'fa-gear' },
    { action: 'about', label: '关于', icon: 'fa-question' }
  ]

  const handleTopButtonsClick = (evt: MouseEvent): void => {
    evt.preventDefault()
    const target = evt.target as HTMLButtonElement
    const root = target.closest('button')
    $activeView = root.dataset.action
  }
</script>

<div class="container">
  <nav class="navbar" aria-label="主导航">
    <div class="navbar-brand p-2">
      <div class="navbar-start">
        <div class="navbar-item">
          <div class="buttons">
            {#each tabs as tab}
              <button
                class="button {$activeView === tab.action ? 'is-active is-primary' : 'is-secondary'}"
                data-action={tab.action}
                on:click={handleTopButtonsClick}
                disabled={!$navigationEnabled}
              >
                <span class="icon">
                  <i class="fa-solid {tab.icon}"></i>
                </span>
                <strong>{tab.label}</strong>
              </button>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </nav>
</div>
