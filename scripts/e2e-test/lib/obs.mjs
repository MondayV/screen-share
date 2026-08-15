// OBS WebSocket 连接库 —— 用于码率采样、截图验证
// 注意: obs-websocket-js 5.0.8 仅支持有限请求集（见 README 已知问题清单）
// 导入用绝对路径绕过 package.json exports 对子路径的限制（包名导入会报错）
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const obsJsonPath = fileURLToPath(new URL('../../../node_modules/obs-websocket-js/dist/json.js', import.meta.url))
const OBSModule = require(obsJsonPath)

export const OBS = OBSModule.default || OBSModule

export async function connectOBS(password, timeoutMs = 8000) {
  const obs = new OBS()
  await obs.connect('ws://127.0.0.1:4455', password, { timeout: timeoutMs })
  return obs
}

// 通过 adv_stream 输出字节增量采样实际码率（GetStats 无 bytesSent，已知问题）
export function createBitrateSampler(obs, intervalMs = 5000) {
  let prevBytes = null
  const samples = []
  const timer = setInterval(async () => {
    try {
      const s = await obs.call('GetOutputStatus', { outputName: 'adv_stream' })
      if (prevBytes != null && s.outputBytes > prevBytes) {
        samples.push({ kbps: Math.round(((s.outputBytes - prevBytes) * 8) / 1000 / (intervalMs / 1000)) })
      }
      prevBytes = s.outputBytes
    } catch {}
  }, intervalMs)
  return {
    samples,
    stop() { clearInterval(timer) },
    avg() {
      if (!samples.length) return null
      return Math.round(samples.reduce((a, b) => a + b.kbps, 0) / samples.length)
    },
  }
}

// 截图源并返回文件大小（验证采集画面非黑屏）
export async function screenshotSize(obs, sourceName, imageFormat = 'png', width = 640, height = 360) {
  const shot = await obs.call('GetSourceScreenshot', {
    sourceName,
    imageFormat,
    imageWidth: width,
    imageHeight: height,
  })
  const b64 = shot.imageData.split(',')[1]
  return Math.floor((b64.length * 3) / 4)
}
