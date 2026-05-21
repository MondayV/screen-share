import { writable } from 'svelte/store'

const KEY = 'pc-connect-theme'
const saved = localStorage.getItem(KEY) || 'dark'

export const theme = writable(saved)

theme.subscribe((value) => {
  localStorage.setItem(KEY, value)
  document.documentElement.setAttribute('data-theme', value)
})
