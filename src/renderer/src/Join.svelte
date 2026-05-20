<script lang="ts">
  import { onDestroy } from 'svelte'
  import Swal from 'sweetalert2'
  import Hls from 'hls.js'
  import { L } from './translations'
  import { useNavigationEnabled, useIsWatching } from './stores'

  const navigationEnabled = useNavigationEnabled()
  const isWatching = useIsWatching()

  let remoteScreen: HTMLVideoElement
  let playUrl = ''
  let isStreaming = false
  let joinAttempting = false
  let hls: Hls | null = null
  let zoomFactor = 1

  onDestroy(() => {
    if (hls) { hls.destroy(); hls = null }
  })

  const onJoinClick = async (): Promise<void> => {
    if (!playUrl || joinAttempting) return
    joinAttempting = true
    try {
      Swal.fire({ title: '正在连接...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
      if (Hls.isSupported()) {
        hls = new Hls()
        hls.loadSource(playUrl)
        hls.attachMedia(remoteScreen)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          remoteScreen.play()
          isStreaming = true
          $isWatching = true
          $navigationEnabled = false
          Swal.close()
        })
        hls.on(Hls.Events.ERROR, () => {
          Swal.fire({ position: 'top-end', icon: 'error', title: '无法加载流，请检查链接', showConfirmButton: false, timer: 2000 })
        })
      } else if (remoteScreen.canPlayType('application/vnd.apple.mpegurl')) {
        remoteScreen.src = playUrl
        remoteScreen.play()
        isStreaming = true
        $isWatching = true
        $navigationEnabled = false
        Swal.close()
      } else {
        throw new Error('HLS not supported')
      }
    } catch (e) {
      console.error('Join failed:', e)
      Swal.fire({ position: 'top-end', icon: 'error', title: '连接失败', showConfirmButton: false, timer: 2000 })
    } finally {
      joinAttempting = false
    }
  }

  const onDisconnectClick = async (): Promise<void> => {
    const result = await Swal.fire({
      title: '断开连接',
      showCancelButton: true,
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    if (!result.isConfirmed) return
    if (hls) { hls.destroy(); hls = null }
    remoteScreen.src = ''
    isStreaming = false
    $navigationEnabled = true
    $isWatching = false
    Swal.fire({ position: 'top-end', icon: 'info', title: '连接已断开', showConfirmButton: false, timer: 1500 })
  }

  const onFullscreenClick = (): void => remoteScreen.requestFullscreen()
  const onZoomInClick = (): void => { zoomFactor += 0.1; remoteScreen.style.scale = zoomFactor.toString() }
  const onZoomOutClick = (): void => {
    if (zoomFactor <= 1) return
    zoomFactor -= 0.1
    remoteScreen.style.scale = zoomFactor.toString()
  }
</script>

<div class="container p-5">
  <h1 class="title">{!isStreaming ? '加入观看' : '正在观看'}</h1>

  {#if isStreaming}
    <div class="fixed-grid">
      <div class="grid">
        <div class="cell"></div>
        <div class="cell has-text-right">
          <button class="button is-danger" on:click={onDisconnectClick}>
            <span class="icon"><i class="fas fa-unlink"></i></span>
            <span>{L.disconnect()}</span>
          </button>
        </div>
      </div>
    </div>
  {:else}
    <div class="has-text-centered">
      <div class="field">
        <div class="control">
          <input
            class="input"
            type="text"
            placeholder="粘贴播放链接 (https://xxx.trycloudflare.com/ABC123/index.m3u8)"
            bind:value={playUrl}
          />
        </div>
      </div>
      <button class="button is-link is-large" on:click={onJoinClick} disabled={!playUrl || joinAttempting}>
        <span class="icon"><i class="fas fa-link"></i></span>
        <span>{joinAttempting ? '正在连接...' : '观看'}</span>
      </button>
    </div>
  {/if}
</div>

<div class={!isStreaming ? 'is-hidden' : ''}>
  <div class="video-overflow">
    <video bind:this={remoteScreen} class="video" autoplay playsinline muted></video>
  </div>
  <div class="field mt-3">
    <div class="control">
      <button class="button is-info" on:click={onZoomInClick}>
        <span class="icon"><i class="fas fa-search-plus"></i></span>
        <span>{L.zoom_in()}</span>
      </button>
      <button class="button is-info" on:click={onZoomOutClick}>
        <span class="icon"><i class="fas fa-search-minus"></i></span>
        <span>{L.zoom_out()}</span>
      </button>
      <button class="button is-info" on:click={onFullscreenClick}>
        <span class="icon"><i class="fas fa-expand"></i></span>
        <span>{L.fullscreen()}</span>
      </button>
    </div>
  </div>
</div>

<style>
  .video { width: 100%; height: auto; transition: transform 0.5s linear; }
  .video-overflow { width: 100%; height: auto; overflow: hidden; }
</style>
