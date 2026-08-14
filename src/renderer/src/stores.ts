import type { Writable } from 'svelte/store'
import { useWritable } from './UseSharedStore'

export const useActiveView = (): Writable<string> => useWritable('activeView', 'join')

export const useNavigationEnabled = (): Writable<boolean> => useWritable('navigationEnabled', true)

export const useIsHosting = (): Writable<boolean> => useWritable('isHosting', false)

export const useIsWatching = (): Writable<boolean> => useWritable('useIsWatching', false)
