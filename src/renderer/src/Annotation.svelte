<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { on, off, sendDraw, sendClear, getMyColor } from './lib/signaling'

  export let videoElement: HTMLVideoElement | null = null

  let canvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D | null = null
  let drawing = false
  let brushSize = 3

  onMount(() => {
    ctx = canvas.getContext('2d')
    on('draw', handleRemoteDraw)
    on('clear', handleClear)
    syncCanvasSize()
    window.addEventListener('resize', syncCanvasSize)
  })

  onDestroy(() => {
    off('draw', handleRemoteDraw)
    off('clear', handleClear)
    window.removeEventListener('resize', syncCanvasSize)
  })

  function syncCanvasSize(): void {
    if (!videoElement || !canvas) return
    const rect = videoElement.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height
  }

  function getPos(e: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
  }

  function onMouseDown(e: MouseEvent): void {
    drawing = true
    const p = getPos(e)
    drawLocal(p.x, p.y, true)
  }

  function onMouseMove(e: MouseEvent): void {
    if (!drawing) return
    const p = getPos(e)
    drawLocal(p.x, p.y, false)
  }

  function onMouseUp(): void {
    if (!drawing) return
    drawing = false
    ctx?.beginPath()
  }

  function drawLocal(x: number, y: number, isStart: boolean): void {
    if (!ctx) return
    const w = canvas.width, h = canvas.height
    const px = x * w, py = y * h
    ctx.strokeStyle = getMyColor()
    ctx.lineWidth = brushSize
    ctx.lineCap = 'round'
    if (isStart) ctx.beginPath()
    ctx.lineTo(px, py)
    ctx.stroke()
    sendDraw([{ x, y }], brushSize)
  }

  function handleRemoteDraw(msg: any): void {
    if (!ctx) return
    const w = canvas.width, h = canvas.height
    ctx.strokeStyle = msg.color
    ctx.lineWidth = msg.brushSize || 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const p of msg.points) {
      ctx.lineTo(p.x * w, p.y * h)
    }
    ctx.stroke()
  }

  function handleClear(): void {
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const doClear = (): void => {
    handleClear()
    sendClear()
  }
</script>

<div class="annotation-bar">
  <span class="brush-label">画笔</span>
  <input type="range" min="1" max="10" bind:value={brushSize} class="brush-slider" />
  <button class="btn-clear" on:click={doClear}>清除</button>
</div>
<canvas
  bind:this={canvas}
  class="annotation-canvas"
  on:mousedown={onMouseDown}
  on:mousemove={onMouseMove}
  on:mouseup={onMouseUp}
  on:mouseleave={onMouseUp}
></canvas>

<style>
.annotation-canvas {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  cursor: crosshair; z-index: 10;
}
.annotation-bar {
  display: flex; align-items: center; gap: 8px; padding: 4px 8px;
  background: var(--card-bg, var(--bg-secondary, #f5f5f5));
  border: 1px solid var(--border-color, #ccc);
  border-radius: var(--button-radius, 4px); margin-top: 8px;
  font-size: 13px;
}
.brush-slider { width: 80px; }
.btn-clear {
  padding: 4px 12px; border: 1px solid var(--border-color, #ccc);
  border-radius: 4px; background: var(--bg-secondary, #eee);
  color: var(--text-primary, #333); cursor: pointer; font-size: 12px;
}
</style>
