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
  let errorShown = false

  onDestroy(() => {
    if (hls) { hls.destroy(); hls = null }
  })

  function startPlayback(url: string): void {
    console.log('[Join] Starting playback for:', url)
    if (Hls.isSupported()) {
      hls = new Hls()
      hls.loadSource(url)
      hls.attachMedia(remoteScreen)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        remoteScreen.play()
        isStreaming = true
        joinAttempting = false
        $isWatching = true
        $navigationEnabled = false
        Swal.close()
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          if (data.response?.code === 404) {
            hls?.destroy(); hls = null
            Swal.fire({ icon: 'info', title: '主持人已结束推流', confirmButtonText: '关闭' }).then(() => resetView())
            return
          }
          if (data.response?.code === 500) return // HLS not ready, silent retry
          if (!errorShown) {
            errorShown = true
            Swal.fire({
              icon: 'warning', title: '无法加载流',
              text: '主持人可能尚未开始推流，可稍后重试',
              showConfirmButton: true, confirmButtonText: '手动重试',
              showCancelButton: true, cancelButtonText: '关闭'
            }).then((r) => {
              if (r.isConfirmed) { errorShown = false; hls?.destroy(); hls = null; startPlayback(playUrl) }
              else resetView()
            })
          }
        }
      })
    } else if (remoteScreen.canPlayType('application/vnd.apple.mpegurl')) {
      remoteScreen.src = url
      remoteScreen.play()
      isStreaming = true
      joinAttempting = false
      $isWatching = true
      $navigationEnabled = false
      Swal.close()
    }
  }

  const onJoinClick = async (): Promise<void> => {
    if (!playUrl || joinAttempting) return
    joinAttempting = true
    errorShown = false
    Swal.fire({ title: '正在连接...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
    startPlayback(playUrl)
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

  const resetView = (): void => {
    if (hls) { hls.destroy(); hls = null }
    remoteScreen.src = ''
    remoteScreen.load()
    playUrl = ''
    isStreaming = false
    joinAttempting = false
    errorShown = false
    $navigationEnabled = true
    $isWatching = false
    Swal.close()
  }

  let isPaused = false
  let volume = 1
  let currentTime = 0
  let duration = 0
  let seekHover = false
  let seekHoverPos = 0
  let seekHoverTime = ''

  function onTimeUpdate(): void {
    currentTime = remoteScreen?.currentTime || 0
    duration = remoteScreen?.duration || 0
  }

  function onPauseClick(): void {
    if (remoteScreen.paused) {
      remoteScreen.play()
      isPaused = false
    } else {
      remoteScreen.pause()
      isPaused = true
    }
  }

  function onVolumeChange(e: Event): void {
    const v = parseFloat((e.target as HTMLInputElement).value)
    volume = v
    remoteScreen.volume = v
  }

  function onSeekChange(e: Event): void {
    const t = parseFloat((e.target as HTMLInputElement).value)
    remoteScreen.currentTime = t
  }

  function onSeekHover(e: MouseEvent): void {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    seekHoverPos = ((e.clientX - rect.left) / rect.width) * 100
    const t = (seekHoverPos / 100) * duration
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    seekHoverTime = `${m}:${s.toString().padStart(2, '0')}`
  }

  function formatTime(t: number): string {
    if (!t || !isFinite(t)) return '0:00'
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
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
        <div class="cell">
          <button class="button is-light" on:click={resetView}>
            <span class="icon"><i class="fas fa-arrow-left"></i></span>
            <span>返回</span>
          </button>
        </div>
        <div class="cell has-text-right">
          <button class="button is-danger" on:click={onDisconnectClick}>
            <span class="icon"><i class="fas fa-unlink"></i></span>
            <span>{L.disconnect()}</span>
          </button>
        </div>
      </div>
    </div>
  {:else if joinAttempting}
    <div class="has-text-centered">
      <p class="is-size-5 mb-3">正在连接...</p>
      <progress class="progress is-small is-primary" max="100" style="width: 200px; margin: 0 auto;"></progress>
      <p class="mt-4">
        <button class="button is-light" on:click={resetView}>
          <span class="icon"><i class="fas fa-arrow-left"></i></span>
          <span>返回</span>
        </button>
      </p>
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
    <video bind:this={remoteScreen} class="video" autoplay playsinline muted on:timeupdate={onTimeUpdate}></video>
  </div>
  <div class="controls-bar mt-3">
    <!-- 进度条 -->
    <div class="progress-row">
      <span class="time-label">{formatTime(currentTime)}</span>
      <div class="seek-container" role="slider" aria-label="播放进度" aria-valuenow={currentTime} aria-valuemin={0} aria-valuemax={duration || 0} tabindex="-1" on:mousemove={onSeekHover} on:mouseenter={() => seekHover = true} on:mouseleave={() => seekHover = false}>
        {#if seekHover}
          <div class="seek-hover" style="left: {seekHoverPos}%;">{seekHoverTime}</div>
        {/if}
        <input type="range" min="0" max={duration || 0} value={currentTime} step="0.1"
          class="seek-bar" on:input={onSeekChange} aria-label="进度" />
      </div>
      <span class="time-label">{formatTime(duration)}</span>
    </div>
    <div class="control-row">
      <button class="button is-info is-small" on:click={onPauseClick} title={isPaused ? '播放' : '暂停'}>
        <span class="icon"><i class="fas fa-{isPaused ? 'play' : 'pause'}"></i></span>
      </button>
      <div class="volume-control">
        <span class="icon is-small"><i class="fas fa-volume-{volume === 0 ? 'mute' : volume < 0.5 ? 'down' : 'up'}"></i></span>
        <input type="range" min="0" max="1" value={volume} step="0.05" on:input={onVolumeChange} class="volume-bar" aria-label="音量" />
      </div>
      <button class="button is-info is-small" on:click={onZoomInClick} title="放大">
        <span class="icon"><i class="fas fa-search-plus"></i></span>
      </button>
      <button class="button is-info is-small" on:click={onZoomOutClick} title="缩小">
        <span class="icon"><i class="fas fa-search-minus"></i></span>
      </button>
      <button class="button is-info is-small" on:click={onFullscreenClick} title="全屏">
        <span class="icon"><i class="fas fa-expand"></i></span>
      </button>
    </div>
  </div>
</div>

<style>
  .video { width: 100%; height: auto; transition: transform 0.5s linear; }
  .video-overflow { width: 100%; height: auto; overflow: hidden; }
  .controls-bar { padding: 0 4px; }
  .progress-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .time-label { font-size: 12px; font-family: monospace; min-width: 36px; color: var(--text-secondary); }
  .seek-container { flex: 1; position: relative; height: 20px; display: flex; align-items: center; }
  .seek-bar { width: 100%; height: 4px; cursor: pointer; accent-color: var(--accent-primary); }
  .seek-hover { position: absolute; bottom: 100%; background: var(--bg-card); color: var(--text-primary); padding: 1px 6px; border-radius: 3px; font-size: 11px; font-family: monospace; white-space: nowrap; pointer-events: none; transform: translateX(-50%); }
  .control-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .volume-control { display: flex; align-items: center; gap: 4px; }
  .volume-bar { width: 80px; height: 4px; accent-color: var(--accent-primary); cursor: pointer; }
</style>
