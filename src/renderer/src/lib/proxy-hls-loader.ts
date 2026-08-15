// hls.js 自定义 Loader：所有 HLS 请求（m3u8 + 媒体分片）改走主进程 DoH 代理，
// 绕过大陆系统 DNS 污染（K9：C 端 ERR_NAME_NOT_RESOLVED 导致 HLS 兜底失效）
import type Hls from 'hls.js'

type LoaderContext = { url: string; responseType: string; type: string; rangeStart?: number; rangeEnd?: number; progressData?: boolean }
type LoaderCallbacks = {
  onSuccess: (response: { url: string; data?: string | ArrayBuffer | object; code?: number; text?: string }, stats: object, context: LoaderContext, networkDetails: unknown) => void
  onError: (error: { code: number; text: string }, context: LoaderContext, networkDetails: unknown, stats: object) => void
  onTimeout: (stats: object, context: LoaderContext, networkDetails: unknown) => void
  onAbort?: (stats: object, context: LoaderContext, networkDetails: unknown) => void
}

export class ProxyHlsLoader {
  private _context: LoaderContext | null = null
  private _aborted = false
  context: LoaderContext | null = null
  stats: Record<string, number | boolean> = { aborted: false, loaded: 0, retry: 0, total: 0, chunkCount: 0, bwEstimate: 0, loading: { start: 0, first: 0, end: 0 }, parsing: { start: 0, end: 0 }, buffering: { start: 0, end: 0 } }

  destroy(): void {
    this._aborted = true
  }

  abort(): void {
    this._aborted = true
  }

  load(context: LoaderContext, _config: unknown, callbacks: LoaderCallbacks): void {
    this._context = context
    this._aborted = false
    this.stats.loading.start = performance.now()
    const isBinary = context.type === 'media-fragment' || context.type === 'key' || context.responseType === 'arraybuffer'
    const headers: Record<string, string> = {}
    if (context.rangeStart !== undefined && context.rangeEnd !== undefined) {
      headers['Range'] = `bytes=${context.rangeStart}-${context.rangeEnd}`
    }

    window.PcConnectApi.proxyFetch('GET', context.url, undefined, headers, isBinary)
      .then((r) => {
        if (this._aborted) return
        this.stats.loading.end = performance.now()
        this.stats.loaded = r.body.length
        if (r.status >= 200 && r.status < 300) {
          let data: string | ArrayBuffer = r.body
          if (isBinary) {
            // base64 → ArrayBuffer
            const bin = atob(r.body)
            const bytes = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
            data = bytes.buffer
          }
          callbacks.onSuccess({ url: context.url, data }, this.stats, context, null)
        } else {
          callbacks.onError({ code: r.status || -1, text: `HTTP ${r.status}` }, context, null, this.stats)
        }
      })
      .catch((e) => {
        if (this._aborted) return
        this.stats.loading.end = performance.now()
        callbacks.onError({ code: -1, text: String((e as Error)?.message || e) }, context, null, this.stats)
      })
  }

  getCacheAge(): number | null {
    return null
  }

  getResponseHeader(name: string): string | null {
    return null
  }
}

// 供 Meeting.svelte 使用：注入 hls.js 配置
export const proxyHlsConfig = (HlsClass: typeof Hls): object => ({
  lowLatencyMode: true,
  liveSyncDurationCount: 1,
  loader: ProxyHlsLoader as unknown as typeof Hls.DefaultConfig.loader,
})
