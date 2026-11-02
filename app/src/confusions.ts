import { db } from './db'
import type { Card } from './types'

/**
 * Confusion pairs: two cards you mixed up (asked about one, picked the other's answer).
 * A pair stays active until you get either card right 3 times in a row; until then the
 * partner is always one of the options, and the "Mixed up" drill practices both.
 * Stored as one synced meta record.
 */
export interface Pair {
  a: string // card ids, sorted so a pair is stored once
  b: string
  count: number // times mixed up
  streak: number // right answers in a row on either card since the last mix-up
  lastAt: number
  fixed: 0 | 1
}
export const FIXED_AFTER = 3
const KEY = 'confusions'

const key = (x: string, y: string) => (x < y ? [x, y] : [y, x])

/** Pure: update the pair list after an answer on `card`; `chosen` = card whose answer you picked when wrong. */
export function notePairs(list: Pair[], cardId: string, correct: boolean, chosenId?: string, now = Date.now()): Pair[] {
  let out = list.map((p) => {
    if (p.fixed || (p.a !== cardId && p.b !== cardId)) return p
    if (!correct) return { ...p, streak: 0 }
    const streak = p.streak + 1
    return { ...p, streak, fixed: (streak >= FIXED_AFTER ? 1 : 0) as 0 | 1 }
  })
  if (!correct && chosenId && chosenId !== cardId) {
    const [a, b] = key(cardId, chosenId)
    const i = out.findIndex((p) => p.a === a && p.b === b)
    const p = i >= 0 ? out[i] : null
    const next: Pair = { a, b, count: (p?.count ?? 0) + 1, streak: 0, lastAt: now, fixed: 0 }
    out = i >= 0 ? out.map((x, k) => (k === i ? next : x)) : [...out, next]
  }
  return out
}

export const activePairs = (list: Pair[]) => list.filter((p) => !p.fixed).sort((x, y) => y.count - x.count || y.lastAt - x.lastAt)

/** Map card id → partner ids from active pairs. */
export function partnerMap(list: Pair[]) {
  const m = new Map<string, string[]>()
  for (const p of activePairs(list)) {
    ;(m.get(p.a) ?? m.set(p.a, []).get(p.a)!).push(p.b)
    ;(m.get(p.b) ?? m.set(p.b, []).get(p.b)!).push(p.a)
  }
  return m
}

/** The card most often mixed up with `card`, if it's in the pool. */
export function partnerOf(card: Card, partners: Map<string, string[]>, pool: Card[]) {
  const ids = partners.get(card.id)
  return ids ? pool.find((c) => c.id === ids[0]) : undefined
}

export async function loadPairs(): Promise<Pair[]> {
  return ((await db.meta.get(KEY))?.value as Pair[] | undefined) ?? []
}

let queue = Promise.resolve() // serialize writes so quick answers don't overwrite each other
export function recordAnswer(cardId: string, correct: boolean, chosenId?: string) {
  queue = queue.then(async () => {
    const list = await loadPairs()
    const next = notePairs(list, cardId, correct, chosenId)
    const changed = next.length !== list.length || next.some((p, i) => p !== list[i])
    if (changed) await db.meta.put({ key: KEY, value: next, updatedAt: Date.now(), dirty: 1 })
  })
  return queue
}
