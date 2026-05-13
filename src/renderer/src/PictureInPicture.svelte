<script lang="ts">
  export let stream: MediaStream | null = null
  export let visible: boolean = true

  let videoEl: HTMLVideoElement
  let dragging = false
  let offsetX = 0, offsetY = 0
  let pipSupported = false

  import { onMount } from 'svelte'

  $: if (videoEl && stream) videoEl.srcObject = stream

  function startDrag(e: MouseEvent) {
    dragging = true
    const rect = videoEl.getBoundingClientRect()
    offsetX = e.clientX - rect.left
    offsetY = e.clientY - rect.top
    window.addEventListener('mousemove', onDrag)
    window.addEventListener('mouseup', stopDrag)
  }

  function onDrag(e: MouseEvent) {
    if (!dragging) return
    videoEl.style.left = (e.clientX - offsetX) + 'px'
    videoEl.style.top = (e.clientY - offsetY) + 'px'
    videoEl.style.right = 'auto'
    videoEl.style.bottom = 'auto'
  }

  function stopDrag() { dragging = false }

  function enterPip() {
    if (videoEl && 'requestPictureInPicture' in HTMLVideoElement.prototype) {
      videoEl.requestPictureInPicture().catch(() => {})
    }
  }
</script>

{#if visible && stream}
  <div class="pip-container">
    <video
      bind:this={videoEl}
      autoplay
      muted
      playsinline
      class="pip-video"
      on:mousedown={startDrag}
      on:mousemove={onDrag}
      on:mouseup={stopDrag}
    ></video>
    <div class="pip-controls">
      <button class="pip-btn" title="画中画" on:click={enterPip}>⧉</button>
    </div>
  </div>
{/if}

<style>
  .pip-container { position: fixed; bottom: 80px; right: 20px; z-index: 1000; }
  .pip-video { width: 180px; height: 135px; border-radius: 8px; border: 2px solid rgba(255,255,255,0.3); background: #000; cursor: grab; object-fit: cover; }
  .pip-video:active { cursor: grabbing; }
  .pip-controls { position: absolute; top: 4px; right: 4px; }
  .pip-btn { width: 24px; height: 24px; border: none; border-radius: 4px; background: rgba(0,0,0,0.6); color: #fff; font-size: 12px; cursor: pointer; }
</style>
