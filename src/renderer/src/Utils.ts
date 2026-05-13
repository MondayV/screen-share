export const enum ConnectionType {
  HOST = 'h',
  PARTICIPANT = 'p'
}

export type RTCSessionDescriptionOptions = RTCSessionDescriptionInit

// Configurable signaling server URL (change for production)
let SIGNAL_SERVER = 'http://localhost:3456'
export const setSignalServer = (url: string) => { SIGNAL_SERVER = url }
export const getSignalServer = () => SIGNAL_SERVER

export const externalLinkClickHandler = (root: HTMLButtonElement, url: string): void => {
  root.classList.add('is-loading')
  setTimeout(() => { root.classList.remove('is-loading') }, 3000)
  window.open(url)
}

export const getUUIDv4 = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const base64urlEncode = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

const base64urlDecode = (str: string): ArrayBuffer => {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) {
    base64 += '='
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

export const compressJson = async (data: unknown): Promise<string> => {
  const stream = new Blob([JSON.stringify(data)], { type: 'application/json' }).stream()
  const compressedStream = stream.pipeThrough(new CompressionStream('gzip'))
  const compressedResponse = new Response(compressedStream)
  const blob = await compressedResponse.blob()
  const buffer = await blob.arrayBuffer()
  return base64urlEncode(buffer)
}

export const decompressJson = async <T = unknown>(data: string): Promise<T> => {
  const buffer = base64urlDecode(data)
  const stream = new Blob([buffer], { type: 'application/json' }).stream()
  const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'))
  const res = new Response(decompressedStream)
  const blob = await res.blob()
  return JSON.parse(await blob.text())
}

export const mayBeConnectionString = (ct: ConnectionType, str: string): boolean => {
  try {
    const url = new URL(str)
    if (url.protocol !== 'pc:') return false
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] !== ct) return false
    const token = parts[1]
    if (!token || token.length < 20) return false
    decompressJson(token)
    return true
  } catch {
    return false
  }
}

export const getConnectionString = async (
  ct: ConnectionType,
  desc: RTCSessionDescriptionInit,
  data: { username: string }
): Promise<string> => {
  const token = await compressJson({ d: desc, u: data.username })
  return `pc://${ct}/${token}`
}

export const getDataFromPcConnectUrl = async (
  url: string
): Promise<{
  type: ConnectionType
  data: { username: string }
  rtcSessionDescription: RTCSessionDescriptionInit
}> => {
  const u = new URL(url)
  const parts = u.pathname.split('/').filter(Boolean)
  const type = parts[0] as ConnectionType
  const token = parts[1]
  const raw = await decompressJson<{ d: RTCSessionDescriptionInit; u: string }>(token)
  return {
    type,
    data: { username: raw.u },
    rtcSessionDescription: raw.d
  }
}

// Server-based short code exchange (6-char codes, under 20 chars total)
export const hostToServer = async (desc: RTCSessionDescriptionInit, username: string): Promise<string> => {
  const res = await fetch(`${SIGNAL_SERVER}/host`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sdp: desc, username })
  })
  if (!res.ok) throw new Error('信令服务器连接失败')
  const { code } = await res.json()
  return code
}

export const getOfferFromServer = async (code: string): Promise<{ sdp: RTCSessionDescriptionInit; username: string }> => {
  const res = await fetch(`${SIGNAL_SERVER}/offer/${code.toUpperCase()}`)
  if (!res.ok) throw new Error('连接码无效或已过期')
  return res.json()
}

export const sendAnswerToServer = async (code: string, desc: RTCSessionDescriptionInit, username: string): Promise<void> => {
  await fetch(`${SIGNAL_SERVER}/answer/${code.toUpperCase()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sdp: desc, username })
  })
}

export const pollAnswerFromServer = async (code: string): Promise<{ ready: boolean; sdp?: RTCSessionDescriptionInit; username?: string }> => {
  const res = await fetch(`${SIGNAL_SERVER}/answer/${code.toUpperCase()}`)
  if (!res.ok) throw new Error('连接码无效或已过期')
  return res.json()
}

export const mayBeShortCode = (str: string): boolean => /^[A-Za-z0-9]{4,8}$/.test(str.trim())

export const getShortLink = (code: string): string => `pc://${code.toUpperCase()}`

export const makeVideoDraggable = (video: HTMLVideoElement | null): void => {
  if (!video) return
  let startX: number, startY: number, initialX: number, initialY: number, isDragging = false

  video.addEventListener('mousedown', (e) => {
    isDragging = true
    startX = e.clientX
    startY = e.clientY
    const transform = getComputedStyle(video).transform
    if (transform !== 'none') {
      const values = transform.split('(')[1].split(')')[0].split(',')
      initialX = parseFloat(values[4])
      initialY = parseFloat(values[5])
    } else {
      initialX = 0
      initialY = 0
    }
    video.style.cursor = 'grabbing'
  })

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return
    video.style.transform = `translate(${initialX + e.clientX - startX}px, ${initialY + e.clientY - startY}px)`
  })

  document.addEventListener('mouseup', () => {
    if (!isDragging) return
    isDragging = false
    video.style.cursor = 'default'
  })
}

export const debounce = <T extends (...args: unknown[]) => void>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>): void => {
    clearTimeout(timeout)
    timeout = setTimeout(() => { func(...args) }, wait)
  }
}

export const throttle = <T extends (...args: unknown[]) => void>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let lastCalled = 0
  return (...args: Parameters<T>): void => {
    const now = Date.now()
    if (now - lastCalled < wait) return
    lastCalled = now
    func(...args)
  }
}
