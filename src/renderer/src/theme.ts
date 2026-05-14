import { writable } from 'svelte/store'

export type ThemeName = 'default' | 'dark' | 'cyberpunk' | 'doodle' | 'pixel'

export const themeLabels: Record<ThemeName, string> = {
  default: '默认浅色',
  dark: '深色模式',
  cyberpunk: '赛博朋克',
  doodle: '手账涂鸦',
  pixel: '像素比特'
}

const THEME_KEY = 'pc-connect-theme'

function loadTheme(): ThemeName {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved && themeLabels[saved as ThemeName]) return saved as ThemeName
  } catch {}
  return 'dark'
}

export const theme = writable<ThemeName>(loadTheme())

export function applyTheme(name: ThemeName) {
  document.documentElement.setAttribute('data-theme', name)
  theme.set(name)
  try { localStorage.setItem(THEME_KEY, name) } catch {}
}
