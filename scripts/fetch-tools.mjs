#!/usr/bin/env node
/**
 * 按需下载 PC Connect 内置的第三方二进制（mediamtx / cloudflared），
 * 并用 SHA-256 校验，确保供应链可追溯。
 *
 * 用法：node scripts/fetch-tools.mjs
 * 在 npm install 后（postinstall）以及打包前（npm run tools）自动执行。
 * 已存在且校验通过的本地文件会跳过下载。
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const TOOLS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'tools')

const TARGETS = [
  {
    name: 'mediamtx.exe',
    version: 'v1.18.2',
    sha256: 'D1465085C3C9BD211FD40FB863ACFD8EEF988EA6EA9E36422472659F82ED4AA9',
    githubAsset: 'https://github.com/bluenviron/mediamtx/releases/download/v1.18.2/mediamtx_v1.18.2_windows_amd64.zip',
    // zip 包内解压出的文件名
    archiveEntry: 'mediamtx.exe',
    archive: true
  },
  {
    name: 'cloudflared.exe',
    version: '2026.5.0',
    sha256: 'F141CDED099C239171AD2CEA6FB5DA0FDAA2BD36104C3074D883F9546519EBA7',
    githubAsset: 'https://github.com/cloudflare/cloudflared/releases/download/2026.5.0/cloudflared-windows-amd64.exe',
    archive: false
  }
]

// 中国大陆网络环境下 GitHub 直连可能较慢/不可用，
// 依次尝试 GitHub 官方地址与第三方加速代理（下载后统一做 SHA-256 校验，可保证内容完整性）
const PROXIES = ['', 'https://ghfast.top/', 'https://gh-proxy.com/', 'https://ghproxy.net/']
// 单个源最多等待 60 秒，超时即切换下一个源
const ATTEMPT_TIMEOUT_MS = 60_000

function sha256Of(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(file)
    stream.on('data', (d) => hash.update(d))
    stream.on('end', () => resolve(hash.digest('hex').toUpperCase()))
    stream.on('error', reject)
  })
}

async function download(url, dest) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(dest, buf)
}

async function ensureTarget(target) {
  const finalPath = join(TOOLS_DIR, target.name)
  if (existsSync(finalPath)) {
    try {
      const actual = await sha256Of(finalPath)
      if (actual === target.sha256) {
        console.log(`[tools] ${target.name} 已存在且校验通过，跳过下载`)
        return
      }
      console.warn(`[tools] ${target.name} 哈希不匹配（期望 ${target.sha256}，实际 ${actual}），重新下载`)
    } catch (e) {
      console.warn(`[tools] ${target.name} 校验失败: ${e.message}，重新下载`)
    }
  }

  let lastErr = null
  for (const proxy of PROXIES) {
    const url = proxy + target.githubAsset
    const tmp = finalPath + '.tmp'
    try {
      console.log(`[tools] 下载 ${target.name} (${target.version}) <- ${url}`)
      rmSync(tmp, { force: true })
      await download(url, tmp)
      if (target.archive) {
        // 解压 zip（Windows 自带 bsdtar 支持 zip）
        const extractDir = finalPath + '.d'
        rmSync(extractDir, { recursive: true, force: true })
        mkdirSync(extractDir, { recursive: true })
        const r = spawnSync('tar', ['-xf', tmp, '-C', extractDir], { stdio: 'ignore' })
        if (r.status !== 0) throw new Error('解压失败 (tar exit ' + r.status + ')')
        const entry = join(extractDir, target.archiveEntry)
        if (!existsSync(entry)) throw new Error(`解压后未找到 ${target.archiveEntry}`)
        renameSync(entry, finalPath)
        rmSync(extractDir, { recursive: true, force: true })
        rmSync(tmp, { force: true })
      } else {
        renameSync(tmp, finalPath)
      }
      const actual = await sha256Of(finalPath)
      if (actual !== target.sha256) {
        rmSync(finalPath, { force: true })
        throw new Error(`校验失败：期望 ${target.sha256}，实际 ${actual}`)
      }
      console.log(`[tools] ${target.name} 下载完成并通过 SHA-256 校验`)
      return
    } catch (e) {
      lastErr = e
      rmSync(tmp, { force: true })
      console.warn(`[tools] 从 ${url} 下载失败: ${e.message}`)
    }
  }
  throw new Error(`[tools] 无法获取 ${target.name}（${target.version}）: ${lastErr?.message || '未知错误'}`)
}

mkdirSync(TOOLS_DIR, { recursive: true })
for (const t of TARGETS) {
  await ensureTarget(t)
}
console.log('[tools] 全部工具就绪')
