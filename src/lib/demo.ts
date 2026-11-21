/**
 * Demo service — a throwaway sandbox with sample data.
 * Lives only in this browser tab (sessionStorage), never syncs, needs no account,
 * and is completely separate from any signed-in user's real data.
 */
import { createDemo } from './seed'
import type { AppData } from './types'

const FLAG = 'pocketledger:demo-active'
export const DEMO_STORAGE_KEY = 'pocketledger:demo'

const safe = <T,>(fn: () => T, fallback: T) => {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export const demoService = {
  isActive: () => safe(() => sessionStorage.getItem(FLAG) === '1', false),
  /** Start (or resume) the demo. Pass fresh=true to reload the sample data. */
  start(fresh = false) {
    safe(() => {
      sessionStorage.setItem(FLAG, '1')
      if (fresh) sessionStorage.removeItem(DEMO_STORAGE_KEY)
    }, undefined)
  },
  /** Leave the demo and discard every change made in it. */
  exit() {
    safe(() => {
      sessionStorage.removeItem(FLAG)
      sessionStorage.removeItem(DEMO_STORAGE_KEY)
    }, undefined)
  },
  initialData: (): AppData => createDemo(),
}
