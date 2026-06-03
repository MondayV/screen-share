<script lang="ts">
  import { onDestroy } from 'svelte'
  import Swal from 'sweetalert2'
  import { L } from './translations'
  import { useNavigationEnabled, useIsHosting, useActiveView } from './stores'
  import { connectToOBS, startStream, stopStream, disconnectOBS, getObsFps } from './lib/obs-controller'

  const navigationEnabled = useNavigationEnabled()
  const isHosting = useIsHosting()
  const activeView = useActiveView()

  let sessionActive = false
  let publicUrl = ''
  let streamKey = ''
  let hlsUrl = ''
  let obsManualMode = false
  let obsConnected = false; let obsConnReason = ''
  let pathActive = false; let pathReason = ''
  let pathFailCount = 0
  let statusTimer: ReturnType<typeof setInterval> | null = null
  let diagRunning = false
  let diagResults: { name: string; status: string; message: string; suggestion: string }[] = []
  let showLogs = false
  let logs: string[] = []
  let removeLogListener: (() => void) | null = null
  let currentFps = 0
  let fpsTimer: ReturnType<typeof setInterval> | null = null

  onDestroy(() => { if (removeLogListener) removeLogListener() })

  async function refreshStatus(): Promise<void> {
    const conn = await window.PcConnectApi.checkObsConnection()
    obsConnected = conn.connected; obsConnReason = conn.reason
    const path = await window.PcConnectApi.checkPathActive(streamKey)
    if (path.active) { pathActive = true; pathReason = ''; pathFailCount = 0 }
    else { pathFailCount++; if (pathFailCount >= 2) { pathActive = false; pathReason = path.reason } }
  }

  onDestroy(() => { disconnectOBS(); if (statusTimer) clearInterval(statusTimer); if (fpsTimer) clearInterval(fpsTimer) })

  async function runDiag(): Promise<void> {
    diagRunning = true
    diagResults = await window.PcConnectApi.runDiagnostics()
    diagRunning = false
  }

  const onStartClick = async (): Promise<void> => {
    try {
      Swal.fire({ title: '正在启动...', text: '启动串流服务', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
      const result = await window.PcConnectApi.startStreaming()
      publicUrl = result.publicUrl
      streamKey = result.streamKey
      hlsUrl = `${publicUrl}/${streamKey}/index.m3u8`
      try { await connectToOBS(); await startStream(); obsManualMode = false } catch { obsManualMode = true }
      Swal.close()
      refreshStatus(); statusTimer = setInterval(refreshStatus, 5000)
      removeLogListener = window.PcConnectApi.onLogMessage((msg) => { logs = [...logs.slice(-49), msg] })
      sessionActive = true
      $navigationEnabled = false; $isHosting = true
      currentFps = 0
      fpsTimer = setInterval(async () => { currentFps = await getObsFps() }, 1000)
    } catch (e) {
      console.error('Start failed:', e); Swal.close()
      Swal.fire({ position: 'top-end', icon: 'error', title: '启动失败，请重试', showConfirmButton: false, timer: 3000 })
    }
  }

  const onStopClick = async (): Promise<void> => {
    const result = await Swal.fire({ title: '结束推流', text: '确定要结束当前推流吗？', icon: 'warning', showCancelButton: true, confirmButtonText: '确定', cancelButtonText: '取消' })
    if (!result.isConfirmed) return
    try { await stopStream() } catch {}; disconnectOBS()
    try { await window.PcConnectApi.stopStreaming() } catch {}
    if (statusTimer) { clearInterval(statusTimer); statusTimer = null }
    if (fpsTimer) { clearInterval(fpsTimer); fpsTimer = null }
    pathFailCount = 0; pathActive = false
    streamKey = ''; hlsUrl = ''; currentFps = 0
    sessionActive = false; $navigationEnabled = true; $isHosting = false
    Swal.fire({ position: 'top-end', icon: 'info', title: '推流已结束', showConfirmButton: false, timer: 1500 })
  }

  const copyHlsUrl = (): void => {
    navigator.clipboard.writeText(hlsUrl)
    Swal.fire({ position: 'top-end', icon: 'success', title: '已复制播放链接', showConfirmButton: false, timer: 1000 })
  }
  const copyObsInfo = (): void => {
    navigator.clipboard.writeText(`rtmp://localhost:1935\n${streamKey}`)
    Swal.fire({ position: 'top-end', icon: 'success', title: '已复制 OBS 配置', showConfirmButton: false, timer: 1000 })
  }
</script>

<div class="container p-5">
  <h1 class="title">{!sessionActive ? L.host_a_session() : '正在推流中'}</h1>

  {#if sessionActive}
    <div class="box" style="display:flex;gap:20px;justify-content:center;font-size:13px;">
      <div><span>{obsConnected ? '🟢' : '⚪'}</span> OBS 连接{#if !obsConnected}<br><small>{obsConnReason}</small>{/if}</div>
      <div><span>{pathActive ? '🟢' : '⚪'}</span> 流到达{#if !pathActive}<br><small>{pathReason}</small>{/if}</div>
      <div><span class="fps-indicator">{currentFps > 0 ? '🟢' : '⚪'}</span> FPS<br><small class="fps-value">{currentFps > 0 ? `${currentFps}` : '—'}</small></div>
    </div>
    <div class="box has-text-centered mb-5">
      <p class="heading">播放链接（发给朋友）</p>
      <p class="is-family-monospace is-size-7" style="word-break: break-all;">{hlsUrl}</p>
      <button class="button is-primary mt-3" on:click={copyHlsUrl}><span class="icon"><i class="fas fa-copy"></i></span><span>复制播放链接</span></button>
    </div>
    <div class="box">
      <p class="heading">OBS 推流信息</p>
      {#if obsManualMode}<p class="mb-2 has-text-warning">⚠️ OBS 未连接，请在 OBS 中手动开始推流</p>{:else}<p class="mb-2 has-text-success">✅ OBS 已连接，正在推流</p>{/if}
      <div class="field"><label class="label">服务器</label><div class="control"><input class="input is-family-monospace" value="rtmp://localhost:1935" readonly /></div></div>
      <div class="field"><label class="label">串流密钥</label><div class="control"><input class="input is-family-monospace" value={streamKey} readonly /></div></div>
      <button class="button is-info mt-3" on:click={copyObsInfo}><span class="icon"><i class="fas fa-copy"></i></span><span>复制服务器+密钥</span></button>
    </div>
    <div class="has-text-centered mt-5">
      <button class="button is-danger is-large" on:click={onStopClick}><span class="icon"><i class="fas fa-stop"></i></span><span>结束推流</span></button>
      <button class="button is-small is-light ml-3" on:click={() => showLogs = !showLogs}>{showLogs ? '隐藏日志' : '显示日志'}</button>
    </div>
    {#if showLogs && logs.length > 0}
      <div style="background:#0a0a1a;color:#00ff41;font-family:var(--font-mono);font-size:11px;padding:8px;border-radius:4px;max-height:200px;overflow-y:auto;margin-top:8px;white-space:pre-wrap;word-break:break-all;">
        {#each logs as log}<div>{log}</div>{/each}
      </div>
    {/if}
  {:else}
    <div class="has-text-centered">
      <button class="button is-link is-large" on:click={onStartClick}>
        <span class="icon"><i class="fas fa-play"></i></span><span>开始共享</span>
      </button>
    </div>

    <div class="box mt-5">
      <p class="heading">环境检测
        <button class="button is-small is-link ml-3" on:click={runDiag} disabled={diagRunning}>
          {diagRunning ? '检测中...' : '运行检测'}
        </button>
      </p>
      {#if diagResults.length > 0}
        {#each diagResults as item}
          <div style="padding:3px 0;font-size:12px;">
            <span>{item.status === 'pass' ? '✅' : '❌'} {item.name}</span>
            {#if item.message !== '正常'}<span style="color:var(--text-secondary);margin-left:6px;">({item.message})</span>{/if}
            {#if item.status === 'fail'}<p style="color:var(--accent-secondary);font-size:11px;margin:1px 0 0 18px;">{item.suggestion}</p>{/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
