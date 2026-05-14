import { writable } from 'svelte/store'

export type Theme = 'dark' | 'light'
export const theme = writable<Theme>('dark')

export function toggleTheme() {
  theme.update(t => t === 'dark' ? 'light' : 'dark')
}

export function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t)
  theme.set(t)
}
