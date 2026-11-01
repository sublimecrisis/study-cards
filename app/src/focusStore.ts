import { useEffect, useState, useSyncExternalStore } from 'react'
import { db } from './db'
import type { BlockSummary, FocusState } from './focus'

/**
 * The running block lives on this device only (like a remembered tab); finished-block
 * summaries go to the synced meta table so Stats shows them everywhere.
 */
interface Store {
  block: FocusState | null
  summary: BlockSummary | null // last finished block, shown on the Focus page
  fatigueSnooze: number // answer count at which the fatigue prompt was dismissed
}
const KEY = 'focus-block'
const empty: Store = { block: null, summary: null, fatigueSnooze: 0 }

function load(): Store {
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(KEY) ?? 'null') }
  } catch {
    return empty
  }
}
let current = load()
const listeners = new Set<() => void>()

export function setFocus(patch: Partial<Store>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* storage blocked: the timer still works until the app closes */
  }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useFocus = () => useSyncExternalStore(subscribe, () => current)

/** Re-render every `ms` while `on`. */
export function useNow(on: boolean, ms = 1000) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => setTick((n) => n + 1), ms)
    return () => clearInterval(t)
  }, [on, ms])
  return Date.now() // read at render, so a pause/skip shows right away instead of on the next tick
}

export async function saveSummary(s: BlockSummary) {
  const m = await db.meta.get('focus-history')
  const list = ((m?.value as BlockSummary[] | undefined) ?? []).filter((x) => x.id !== s.id)
  await db.meta.put({ key: 'focus-history', value: [...list, s].slice(-60), updatedAt: Date.now(), dirty: 1 })
}

// ---- chime (Web Audio; needs one tap first, so Start primes it) ----
let ctx: AudioContext | null = null
export function primeSound() {
  try {
    ctx ??= new AudioContext()
    void ctx.resume()
  } catch {
    /* no audio */
  }
}
export function chime(kind: 'focus' | 'break') {
  if (!ctx || document.visibilityState !== 'visible') return
  const notes = kind === 'break' ? [784, 659, 523] : [523, 659, 784] // down = rest, up = go
  notes.forEach((f, i) => {
    const o = ctx!.createOscillator()
    const g = ctx!.createGain()
    const t = ctx!.currentTime + i * 0.22
    o.frequency.value = f
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    o.connect(g).connect(ctx!.destination)
    o.start(t)
    o.stop(t + 0.4)
  })
}
