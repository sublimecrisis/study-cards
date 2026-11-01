import { isDue, retrievabilityAt, startOfDay, statusOf } from './srs'
import type { Card, ReviewLog } from './types'

const DAY = 86_400_000

/** Whole days from today until the exam (0 = exam is today, negative = past). */
export const daysUntil = (exam: number, now = Date.now()) => Math.round((startOfDay(exam) - startOfDay(now)) / DAY)

/** Average chance of recalling each card on exam morning; never-studied cards count as 0. */
export function readiness(cards: Card[], exam: number) {
  if (!cards.length) return 0
  const when = startOfDay(exam) + 8 * 3_600_000 // exam morning
  return cards.reduce((n, c) => n + retrievabilityAt(c, when), 0) / cards.length
}

/**
 * Exam boost: studied cards whose next scheduled review lands AFTER the exam, but
 * that you'd probably have forgotten by exam day (recall below `target`). Review
 * pulls these forward so nothing slips through the gap.
 *
 * Cards already scheduled before the exam are left alone (they'll come back on
 * their own), and so is anything reviewed today: otherwise a card you just rated
 * "3 days" would be pulled straight back into the session.
 */
export function examBoost(cards: Card[], exam: number, target = 0.85, now = Date.now()) {
  if (daysUntil(exam, now) < 0) return []
  const when = startOfDay(exam) + 8 * 3_600_000
  const today = startOfDay(now)
  return cards
    .filter((c) => statusOf(c) !== 'new' && !isDue(c, now) && c.srs!.due > when && (c.srs!.last_review ?? 0) < today)
    .map((c) => ({ c, r: retrievabilityAt(c, when) }))
    .filter((x) => x.r < target)
    .sort((a, b) => a.r - b.r)
    .map((x) => x.c)
}

/** New cards per day needed to have seen every unseen card at least once by the day before the exam. */
export function newPerDayNeeded(cards: Card[], exam: number, now = Date.now()) {
  const unseen = cards.filter((c) => statusOf(c) === 'new').length
  const days = Math.max(1, daysUntil(exam, now))
  return Math.ceil(unseen / days)
}

/**
 * Weakness score per card: recent misses count most, lapses (forgot after learning)
 * and high FSRS difficulty add to it, recent correct answers pull it down.
 * Only cards with at least one miss or lapse are "weak".
 */
export function weakness(cards: Card[], logs: Pick<ReviewLog, 'cardId' | 'correct' | 'at'>[], now = Date.now()) {
  const since = now - 60 * DAY
  const misses = new Map<string, number>()
  const hits = new Map<string, number>()
  for (const l of logs) {
    if (l.at < since) continue
    const m = l.correct ? hits : misses
    m.set(l.cardId, (m.get(l.cardId) ?? 0) + 1)
  }
  const scores = new Map<string, number>()
  for (const c of cards) {
    const miss = misses.get(c.id) ?? 0
    const lapses = c.srs?.lapses ?? 0
    if (!miss && !lapses) continue
    const score = miss * 2 + lapses * 1.5 + (c.srs && c.srs.difficulty > 7 ? 1 : 0) - (hits.get(c.id) ?? 0) * 0.5
    if (score > 0) scores.set(c.id, score)
  }
  return scores
}

export function weakest(cards: Card[], logs: Pick<ReviewLog, 'cardId' | 'correct' | 'at'>[], limit = 30) {
  const s = weakness(cards, logs)
  return cards.filter((c) => s.has(c.id)).sort((a, b) => s.get(b.id)! - s.get(a.id)!).slice(0, limit)
}
