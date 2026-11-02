import { retrievabilityAt, startOfDay, statusOf } from './srs'
import type { Card, ReviewLog } from './types'

export const BEDTIME_MAX = 45 // ~15 minutes of multiple choice
export const BEDTIME_HOUR = 20 // the Home button shows from 8 pm
const SHAKY = 0.7

/**
 * Before-bed session: cards you missed or guessed today first (sleep consolidates what
 * you studied last), then your shakiest studied cards (recall below 70% right now).
 */
export function bedtimeCards(cards: Card[], logs: Pick<ReviewLog, 'cardId' | 'correct' | 'at'>[], now = Date.now()): Card[] {
  const today = startOfDay(now)
  const missed = new Set(logs.filter((l) => l.at >= today && !l.correct).sort((a, b) => b.at - a.at).map((l) => l.cardId))
  const byId = new Map(cards.map((c) => [c.id, c]))
  const first = [...missed].map((id) => byId.get(id)).filter((c): c is Card => !!c && !c.occlusion)
  const shaky = cards
    .filter((c) => !missed.has(c.id) && statusOf(c) !== 'new' && !c.occlusion)
    .map((c) => ({ c, r: retrievabilityAt(c, now) }))
    .filter((x) => x.r < SHAKY)
    .sort((a, b) => a.r - b.r)
    .map((x) => x.c)
  return [...first, ...shaky].slice(0, BEDTIME_MAX)
}

export const isBedtime = (now = Date.now()) => {
  const h = new Date(now).getHours()
  return h >= BEDTIME_HOUR || h < 3
}
