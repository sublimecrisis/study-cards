import { retrievabilityAt, startOfDay, statusOf } from './srs'
import type { Card, ReviewLog } from './types'

export const BEDTIME_MAX = 45 // ~15 minutes of multiple choice
export const BEDTIME_HOUR = 20 // the Home button shows from 8 pm
export const BEDTIME_DONE_KEY = 'bedtime-done' // localStorage: start of the day a pass was finished
const SHAKY = 0.7

/**
 * Before-bed session: cards you missed or guessed today first (sleep consolidates what
 * you studied last), then your shakiest studied cards (recall below 70% right now).
 */
export function bedtimeCards(cards: Card[], logs: Pick<ReviewLog, 'cardId' | 'correct' | 'at'>[], now = Date.now()): Card[] {
  const today = startOfDay(now)
  // Missed today = the LATEST answer today was wrong (fixed tonight → not missed any more). Newest first.
  const latest = new Map<string, Pick<ReviewLog, 'correct' | 'at'>>()
  for (const l of logs) if (l.at >= today && (latest.get(l.cardId)?.at ?? -1) < l.at) latest.set(l.cardId, l)
  const missed = new Set([...latest].filter(([, l]) => !l.correct).sort((a, b) => b[1].at - a[1].at).map(([id]) => id))
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

/** Finished a Before bed pass tonight (this device)? */
export function bedtimeDoneToday(now = Date.now()) {
  try {
    const at = Number(localStorage.getItem(BEDTIME_DONE_KEY))
    // "Tonight" runs past midnight: a pass finished after 8 pm still counts until 3 am.
    const h = new Date(now).getHours()
    const night = h < 3 ? startOfDay(now) - 86_400_000 : startOfDay(now)
    return at >= night
  } catch {
    return false
  }
}
