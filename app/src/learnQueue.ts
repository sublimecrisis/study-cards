import type { Card } from './types'

/**
 * Learn mode's in-session spacing. A card is "learned" once it's answered correctly
 * twice with other cards in between: first as multiple choice, then (after a gap)
 * typed. A miss brings it back almost immediately and resets it; a correct answer
 * pushes it further back. Only a handful of cards are in play at once, so gaps stay
 * short enough to work but long enough to make you actually recall.
 */
export interface Item {
  card: Card
  stage: 0 | 1 // 0 = first recall (multiple choice), 1 = spaced recall (typed, or MC if mcOnly)
  misses: number
}

export const ACTIVE = 6 // cards in play at once
export const GAP_WRONG = 2 // a missed card returns after this many others
export const GAP_RIGHT = 4 // a first correct answer returns after this many others

export interface LearnState {
  queue: Item[] // [0] is the current question
  pool: Item[] // not started yet, in order
  learned: Item[]
}

export function start(items: Item[]): LearnState {
  return refill({ queue: [], pool: items, learned: [] })
}

function refill(s: LearnState): LearnState {
  const queue = [...s.queue]
  const pool = [...s.pool]
  while (queue.length < ACTIVE && pool.length) queue.push(pool.shift()!)
  return { ...s, queue, pool }
}

const insertAt = (q: Item[], it: Item, gap: number) => {
  const out = [...q]
  out.splice(Math.min(gap, out.length), 0, it)
  return out
}

/** Apply an answer to the current card. Returns the new state and the card if it just became learned. */
export function answer(s: LearnState, correct: boolean): { state: LearnState; learned?: Item } {
  const [cur, ...rest] = s.queue
  if (!cur) return { state: s }
  if (!correct) return { state: refill({ ...s, queue: insertAt(rest, { ...cur, stage: 0, misses: cur.misses + 1 }, GAP_WRONG) }) }
  if (cur.stage === 0) return { state: refill({ ...s, queue: insertAt(rest, { ...cur, stage: 1 }, GAP_RIGHT) }) }
  return { state: refill({ ...s, queue: rest, learned: [...s.learned, cur] }), learned: cur }
}
