<script lang="ts">
  let recording = false
  let mediaRecorder: MediaRecorder | null = null
  let chunks: Blob[] = []

  export let stream: MediaStream | null = null

  function toggleRecord() {
    if (recording) {
      stopRecord()
    } else {
      startRecord()
    }
  }

  function startRecord() {
    if (!stream) return
    try {
      chunks = []
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' })
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `PC-Connect-录制-${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.webm`
        a.click()
        URL.revokeObjectURL(url)
        chunks = []
      }
      mediaRecorder.start()
      recording = true
    } catch (e) {
      console.error('录制失败', e)
    }
  }

  function stopRecord() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    recording = false
  }
</script>

<button class="record-btn {recording ? 'recording' : ''}" title={recording ? '停止录制' : '开始录制'} on:click={toggleRecord}>
  {#if recording}
    <span class="rec-dot"></span> 录制中
  {:else}
    ⏺ 录制
  {/if}
</button>

<style>
  .record-btn { padding: 6px 14px; border: 1px solid #45475a; border-radius: 6px; background: transparent; color: #cdd6f4; font-size: 13px; cursor: pointer; }
  .record-btn.recording { border-color: #e74c3c; color: #e74c3c; }
  .rec-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #e74c3c; animation: blink 1s infinite; }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
</style>
