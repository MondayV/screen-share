import os from 'os'

export function isTestMode(): boolean {
  return process.argv.some((arg) => arg.includes('test2'))
}

export function getLocalIP(): string {
  // Dual-instance test: both on same machine, always use localhost
  if (isTestMode()) return '127.0.0.1'

  const interfaces = os.networkInterfaces()
  const skipKeywords = [
    'virtual', 'vmware', 'hyper-v', 'vbox', 'loopback',
    'bluetooth', 'docker', 'vpn', 'tunnel', 'teredo',
    'wsl', 'pseudo', 'hamachi', 'zerotier'
  ]

  for (const name of Object.keys(interfaces)) {
    const lower = name.toLowerCase()
    if (skipKeywords.some((kw) => lower.includes(kw))) continue

    const addrs = interfaces[name]
    if (!addrs) continue
    for (const iface of addrs) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Skip link-local (169.254.x.x)
        if (iface.address.startsWith('169.254.')) continue
        return iface.address
      }
    }
  }

  return '127.0.0.1'
}
