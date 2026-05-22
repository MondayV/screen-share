<script lang="ts">
  import { onDestroy } from 'svelte'
  import Swal from 'sweetalert2'
  import { L } from './translations'
  import { useNavigationEnabled, useIsHosting, useActiveView } from './stores'
  import { connectToOBS, startStream, stopStream, disconnectOBS } from './lib/obs-controller'

  const navigationEnabled = useNavigationEnabled()
  const isHosting = useIsHosting()
  const activeView = useActiveView()

  let sessionActive = false
  let publicUrl = ''
  let streamKey = ''
  let hlsUrl = ''
  let obsManualMode = false

  onDestroy(() => { disconnectOBS() })

  const onStartClick = async (): Promise<void> => {
    try {
      Swal.fire({ title: '正在启动...', text: '启动串流服务', allowOutsideClick: false, didOpen: () => Swal.showLoading() })

      const result = await window.PcConnectApi.startStreaming()
      publicUrl = result.publicUrl
      streamKey = result.streamKey
      hlsUrl = `${publicUrl}/${streamKey}/index.m3u8`

      try {
        await connectToOBS()
        await startStream()
        obsManualMode = false
      } catch {
        obsManualMode = true
      }

      Swal.close()
      sessionActive = true
      $navigationEnabled = false
      $isHosting = true
    } catch (e) {
      console.error('Start failed:', e)
      Swal.close()
      Swal.fire({ position: 'top-end', icon: 'error', title: '启动失败，请重试', showConfirmButton: false, timer: 3000 })
    }
  }

  const onStopClick = async (): Promise<void> => {
    const result = await Swal.fire({
      title: '结束推流',
      text: '确定要结束当前推流吗？',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    if (!result.isConfirmed) return
    try { await stopStream() } catch {}
    disconnectOBS()
    try { await window.PcConnectApi.stopStreaming() } catch {}
    publicUrl = ''
    streamKey = ''
    hlsUrl = ''
    sessionActive = false
    $navigationEnabled = true
    $isHosting = false
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
    <div class="box has-text-centered mb-5">
      <p class="heading">播放链接（发给朋友）</p>
      <p class="is-family-monospace is-size-7" style="word-break: break-all;">{hlsUrl}</p>
      <button class="button is-primary mt-3" on:click={copyHlsUrl}>
        <span class="icon"><i class="fas fa-copy"></i></span>
        <span>复制播放链接</span>
      </button>
    </div>

    <div class="box">
      <p class="heading">OBS 推流信息</p>
      {#if obsManualMode}
        <p class="mb-2 has-text-warning">⚠️ OBS 未连接，请在 OBS 中手动开始推流</p>
      {:else}
        <p class="mb-2 has-text-success">✅ OBS 已连接，正在推流</p>
      {/if}
      <p class="mb-2">首次使用请在 OBS 设置 → 流中配置：</p>
      <div class="field">
        <label class="label">服务器</label>
        <div class="control">
          <input class="input is-family-monospace" value="rtmp://localhost:1935" readonly />
        </div>
      </div>
      <div class="field">
        <label class="label">串流密钥</label>
        <div class="control">
          <input class="input is-family-monospace" value={streamKey} readonly />
        </div>
      </div>
      <button class="button is-info mt-3" on:click={copyObsInfo}>
        <span class="icon"><i class="fas fa-copy"></i></span>
        <span>复制服务器+密钥</span>
      </button>
    </div>

    <div class="has-text-centered mt-5">
      <button class="button is-danger is-large" on:click={onStopClick}>
        <span class="icon"><i class="fas fa-stop"></i></span>
        <span>结束推流</span>
      </button>
    </div>
  {:else}
    <div class="has-text-centered">
      <button class="button is-link is-large" on:click={onStartClick}>
        <span class="icon"><i class="fas fa-play"></i></span>
        <span>开始共享</span>
      </button>
      <p class="has-text-grey mt-3">需要 OBS Studio（WebSocket 端口 4455）+ MediaMTX + cloudflared</p>
    </div>
  {/if}
</div>
