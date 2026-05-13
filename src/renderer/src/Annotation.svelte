<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { writable } from 'svelte/store'

  export let width: number = 800
  export let height: number = 600
  export let enabled: boolean = false
  export let onAnnotationSend: ((data: AnnotationData) => void) | null = null

  export type AnnotationData = {
    tool: 'pen' | 'eraser' | 'text' | 'clear'
    x: number
    y: number
    color: string
    size: number
    text?: string
    action: 'start' | 'move' | 'end'
  }

  let canvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D
  let isDrawing = false
  let currentTool: 'pen' | 'eraser' = 'pen'
  let currentColor = '#ff0000'
  let currentSize = 3

  // Local drawing cache for rendering
  const drawnPaths: AnnotationData[][] = []
  let currentPath: AnnotationData[] = []

  function getPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height
    }
  }

  function startDraw(e: MouseEvent | TouchEvent) {
    if (!enabled) return
    isDrawing = true
    const { x, y } = getPos(e)
    const data: AnnotationData = { tool: currentTool, x, y, color: currentColor, size: currentSize, action: 'start' }
    currentPath = [data]
    if (currentTool === 'eraser') {
      drawLocal(data)
    }
  }

  function moveDraw(e: MouseEvent | TouchEvent) {
    if (!isDrawing || !enabled) return
    const { x, y } = getPos(e)
    const data: AnnotationData = { tool: currentTool, x, y, color: currentColor, size: currentSize, action: 'move' }
    currentPath.push(data)
    drawLocal(data)
  }

  function endDraw() {
    if (!isDrawing) return
    isDrawing = false
    if (currentPath.length > 0) {
      const last = currentPath[currentPath.length - 1]
      last.action = 'end'
      drawnPaths.push([...currentPath])
      if (onAnnotationSend) {
        currentPath.forEach(d => onAnnotationSend(d))
      }
    }
    currentPath = []
  }

  function drawLocal(data: AnnotationData) {
    if (!ctx) return
    const px = data.x * width
    const py = data.y * height
    if (data.tool === 'eraser') {
      ctx.clearRect(px - data.size * 5, py - data.size * 5, data.size * 10, data.size * 10)
    } else if (data.tool === 'pen') {
      ctx.strokeStyle = data.color
      ctx.lineWidth = data.size
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      if (data.action === 'start') {
        ctx.beginPath()
        ctx.moveTo(px, py)
      } else {
        ctx.lineTo(px, py)
        ctx.stroke()
      }
    }
  }

  export function receiveAnnotation(data: AnnotationData) {
    drawLocal(data)
  }

  export function clearAll() {
    if (ctx) ctx.clearRect(0, 0, width, height)
    drawnPaths.length = 0
  }

  function handleResize() {
    if (canvas && canvas.parentElement) {
      width = canvas.parentElement.clientWidth
      height = canvas.parentElement.clientHeight
    }
  }

  onMount(() => {
    ctx = canvas.getContext('2d')!
    handleResize()
    window.addEventListener('resize', handleResize)
  })

  onDestroy(() => {
    window.removeEventListener('resize', handleResize)
  })
</script>

<div class="annotation-toolbar" class:active={enabled}>
  <button class="tool-btn" class:active={currentTool === 'pen' && enabled} on:click={() => currentTool = 'pen'} title="画笔">
    <i class="fas fa-pen"></i>
  </button>
  <button class="tool-btn" class:active={currentTool === 'eraser' && enabled} on:click={() => currentTool = 'eraser'} title="橡皮擦">
    <i class="fas fa-eraser"></i>
  </button>
  <input type="color" bind:value={currentColor} class="color-picker" title="颜色" />
  <input type="range" min="1" max="10" bind:value={currentSize} class="size-slider" title="粗细" />
  <button class="tool-btn" on:click={clearAll} title="清除全部">
    <i class="fas fa-trash"></i>
  </button>
</div>

<canvas
  bind:this={canvas}
  width={width}
  height={height}
  class="annotation-canvas {enabled ? 'active' : ''}"
  on:mousedown={startDraw}
  on:mousemove={moveDraw}
  on:mouseup={endDraw}
  on:mouseleave={endDraw}
  on:touchstart|preventDefault={startDraw}
  on:touchmove|preventDefault={moveDraw}
  on:touchend={endDraw}
></canvas>

<style>
  .annotation-toolbar {
    display: none;
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
    background: rgba(0,0,0,0.8);
    border-radius: 8px;
    padding: 6px 12px;
    gap: 8px;
    align-items: center;
  }
  .annotation-toolbar.active { display: flex; }
  .tool-btn {
    width: 32px; height: 32px;
    border: 2px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tool-btn.active { border-color: #4A90D9; background: rgba(74,144,217,0.2); }
  .tool-btn:hover { background: rgba(255,255,255,0.15); }
  .color-picker { width: 28px; height: 28px; border: none; cursor: pointer; background: none; }
  .size-slider { width: 60px; accent-color: #4A90D9; }
  .annotation-canvas {
    position: absolute;
    top: 0; left: 0;
    cursor: crosshair;
    display: none;
  }
  .annotation-canvas.active { display: block; }
</style>
