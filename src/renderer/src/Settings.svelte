<script lang="ts">
  import { onMount } from 'svelte'
  import ColorPicker from 'svelte-awesome-color-picker'
  import { L } from './translations'
  import { theme as themeStore, applyTheme, themeLabels } from './theme'

  let colorPreviewIcon: HTMLElement
  let usernameValue: string = 'PC用户'
  let colorValue: string = '#ffffff'
  let serverUrlValue = 'http://localhost:3456'
  let isServerUrlValid = true
  let iceServersValue: string = '{ "urls": "stun:stun.l.google.com:19302" }'
  let isUsernameValid = false
  let isColorValid = false
  let isIceServersValid = true
  let modalSuccessIsActive = false
  let modalFailureIsActive = false
  let isMicrophoneEnabledOnConnect = true

  $: colorValue, checkColor()
  $: usernameValue, checkUsername()
  $: iceServersValue, checkIceServers()
  $: serverUrlValue, checkServerUrl()
  $: isMicrophoneEnabledOnConnect

  const checkIceServers = (): void => {
    const serversObjects = iceServersValue.split('\n')
    isIceServersValid = serversObjects.every((serverObject) => {
      try {
        const srv = JSON.parse(serverObject)
        return srv.urls && srv.urls.length > 0
      } catch (e) {
        return false
      }
    })
  }
  const checkIsValidHexColor = (color: string): boolean => {
    return /^#[0-9A-F]{6}$/i.test(color)
  }
  function checkColor(): void {
    if (checkIsValidHexColor(colorValue)) {
      isColorValid = true
      colorPreviewIcon?.style.setProperty('--color', colorValue)
    } else {
      isColorValid = false
    }
  }
  const checkServerUrl = (): void => {
    try { new URL(serverUrlValue); isServerUrlValid = true }
    catch { isServerUrlValid = false }
  }
  function checkUsername(): void {
    if (usernameValue.length > 0 && usernameValue.length < 32) {
      isUsernameValid = true
    } else {
      isUsernameValid = false
    }
  }
  async function onSubmit(evt: Event): Promise<void> {
    evt.preventDefault()
    if (isUsernameValid && isColorValid && isServerUrlValid && isIceServersValid) {
      await window.PcConnectApi.updateSettings({
        username: usernameValue,
        color: colorValue,
        serverUrl: serverUrlValue,
        isMicrophoneEnabledOnConnect,
        iceServers: iceServersValue.split('\n').map((srv) => JSON.parse(srv))
      })
      modalSuccessIsActive = true
      setTimeout(() => {
        modalSuccessIsActive = false
      }, 2000)
    } else {
      modalFailureIsActive = true
      setTimeout(() => {
        modalFailureIsActive = false
      }, 2000)
    }
  }
  onMount(async () => {
    const settings = await window.PcConnectApi.getSettings()
    usernameValue = settings.username
    colorValue = settings.color
    serverUrlValue = settings.serverUrl || 'http://localhost:3456'
    isMicrophoneEnabledOnConnect = settings.isMicrophoneEnabledOnConnect
    iceServersValue = settings.iceServers.map((srv) => JSON.stringify(srv)).join('\n')
  })
</script>

<div class="modal {modalSuccessIsActive ? 'is-active' : ''}">
  <div class="modal-background"></div>
  <div class="modal-content">
    <div class="box">
      <h1 class="title has-text-success">保存成功</h1>
      <p>设置已成功保存。</p>
    </div>
  </div>
</div>

<div class="modal {modalFailureIsActive ? 'is-active' : ''}">
  <div class="modal-background"></div>
  <div class="modal-content">
    <div class="box">
      <h1 class="title has-text-danger">保存失败</h1>
      <p>无法保存设置，请检查输入。</p>
    </div>
  </div>
</div>

<div class="settings-container">
  <h1 class="title px-5 pt-5">{L.settings()}</h1>
  <div class="settings-scroll">
  <h2>{L.basic()}</h2>
  <form class="form" on:submit={onSubmit}>
    <div class="field">
      <label class="label" for="username">{L.username()}</label>
      <div class="control has-icons-left has-icons-right">
        <input
          bind:value={usernameValue}
          class="input {isUsernameValid ? 'is-success' : 'is-danger'}"
          type="text"
          id="username"
          placeholder="PC用户"
        />
        <span class="icon is-small is-left">
          <i class="fas fa-user"></i>
        </span>
      </div>
    </div>

    <div class="field">
      <label class="label" for="color">{L.color()}</label>
      <div class="control has-icons-left has-icons-right">
        <input
          bind:value={colorValue}
          class="input {isColorValid ? 'is-success' : 'is-danger'}"
          type="text"
          id="color"
          placeholder="#ffffff"
        />
        <span class="icon is-small is-left">
          <i bind:this={colorPreviewIcon} class="fas fa-palette"></i>
        </span>
        <ColorPicker bind:hex={colorValue} isTextInput={false} isAlpha={false} />
      </div>
    </div>
    <div class="field">
      <label class="label" for="serverUrl">信令服务器地址</label>
      <div class="control has-icons-left has-icons-right">
        <input
          bind:value={serverUrlValue}
          class="input {isServerUrlValid ? 'is-success' : 'is-danger'}"
          type="text"
          id="serverUrl"
          placeholder="http://localhost:3456"
        />
        <span class="icon is-small is-left"><i class="fas fa-server"></i></span>
      </div>
      <p class="help">屏幕共享信令服务器地址，默认 localhost:3456</p>
    </div>

    <div class="field">
      <label class="label">皮肤主题</label>
      <div class="control">
        <div class="select">
          <select value={$themeStore} on:change={(e) => applyTheme(e.target.value)}>
            {#each Object.entries(themeLabels) as [key, label]}
              <option value={key}>{label}</option>
            {/each}
          </select>
        </div>
      </div>
      <p class="help">切换后即时生效，自动保存</p>
    </div>

    <h2>{L.media()}</h2>

    <div class="field">
      <div class="control">
        <label class="checkbox" for="microphone_active_on_connect">
          <input
            bind:checked={isMicrophoneEnabledOnConnect}
            class="checkbox"
            type="checkbox"
            id="microphone_active_on_connect"
          />
          {L.is_microphone_active_on_connect()}
        </label>
      </div>
    </div>

    <h2>{L.advanced()}</h2>

    <div class="field">
      <label class="label" for="ice_servers">{L.stun_turn_server_objects()}</label>
      <div class="control has-icons-left has-icons-right">
        <textarea
          bind:value={iceServersValue}
          class="textarea {isIceServersValid ? 'is-success' : 'is-danger'}"
          id="ice_servers"
          placeholder="&#123; &quot;urls&quot;: &quot;stun:stun.l.google.com:19302&quot; &#125;"
        ></textarea>
      </div>
    </div>

    <div class="field">
      <div class="control">
        <button class="button is-link">{L.save()}</button>
      </div>
    </div>
  </form>
  </div>
</div>

<style>
  .settings-container { display: flex; flex-direction: column; height: 100vh; }
  .settings-scroll {
    flex: 1; overflow-y: auto; padding: 0 2rem 2rem 2rem;
    scrollbar-width: thin; scrollbar-color: #45475a #1e1e2e;
  }
  .settings-scroll::-webkit-scrollbar { width: 6px; }
  .settings-scroll::-webkit-scrollbar-track { background: #1e1e2e; }
  .settings-scroll::-webkit-scrollbar-thumb { background: #45475a; border-radius: 3px; }
  .settings-scroll::-webkit-scrollbar-thumb:hover { background: #585b70; }
  span.icon i.fa-palette:before {
    color: var(--color);
    text-shadow: '-1px 0 black, 0 1px black, 1px 0 black, 0 -1px black';
  }
</style>
