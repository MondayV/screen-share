<script lang="ts">
  import { L } from './translations'
  import { externalLinkClickHandler } from './Utils'
  import shoulders from './About.shoulders-of-giants.json'

  const randomizedShoulders = shoulders.sort(() => Math.random() - 0.5)
  const GITHUB_REPO = 'https://github.com/MondayV/screen-share'

  let version: string
  ;(async function (): Promise<void> {
    version = await window.PcConnectApi.getAppVersion()
  })()

  function openExternalURL(e: MouseEvent & { currentTarget: HTMLButtonElement }): void {
    const url = e.currentTarget.dataset.url
    if (!url) return
    externalLinkClickHandler(e.currentTarget, url)
  }
</script>

<div class="container p-5 content">
  <h1 class="title">{L.about()}</h1>
  <p>您正在使用 PC Connect 屏幕共享 <code>{version}</code> 版本</p>
  <hr />

  <button class="button is-secondary mr-2" data-url={GITHUB_REPO} on:click={openExternalURL}>
    <span class="icon"><i class="fa-solid fa-globe"></i></span>
    <strong>{L.website()}</strong>
  </button>
  <button class="button is-secondary mr-2" data-url="{GITHUB_REPO}/issues/new" on:click={openExternalURL}>
    <span class="icon"><i class="fa-solid fa-bug"></i></span>
    <strong>{L.report_a_bug()}</strong>
  </button>
  <button class="button is-secondary" data-url={GITHUB_REPO} on:click={openExternalURL}>
    <span class="icon"><i class="fa-solid fa-code"></i></span>
    <strong>{L.see_the_code()}</strong>
  </button>

  <hr />
  <h2 class="title is-4">{L.shoulders_of_giants()}</h2>
  <p>{L.shoulders_of_giants_description()}</p>
  <ul>
    {#each randomizedShoulders as shoulder}
      <li>
        <p>
          <a href={shoulder.url} target="_blank" rel="noopener">
            <strong>{shoulder.title}</strong>
            {shoulder.license ? '- ' + shoulder.license : ''}
          </a>
        </p>
        <p>{shoulder.description}</p>
        <p>{shoulder.usage}</p>
        <hr />
      </li>
    {/each}
  </ul>
</div>
