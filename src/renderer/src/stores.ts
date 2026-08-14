import type { Writable } from 'svelte/store'
import { useWritable } from './UseSharedStore'

export const useActiveView = (): Writable<string> => useWritable('activeView', 'meeting')

export const useNavigationEnabled = (): Writable<boolean> => useWritable('navigationEnabled', true)
