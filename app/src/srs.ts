import { createEmptyCard, fsrs, Rating, type Card as FsrsCard, type Grade } from 'ts-fsrs'
import { db, newId } from './db'
import type { Card, Srs, StudyMode } from './types'

const scheduler = fsrs()
const DAY = 86_400_000

export { Rating }

const toFsrs = (s: Srs | null | undefined, now: Date): FsrsCard =>
  s
    ? ({ ...s, due: new Date(s.due), last_review: s.last_review ? new Date(s.last_review) : undefined } as FsrsCard)
    : createEmptyCard(now)

const fromFsrs = (c: FsrsCard): Srs => ({
  due: c.due.getTime(),
  stability: c.stability,
  difficulty: c.difficulty,
  scheduled_days: c.scheduled_days,
  reps: c.reps,
  lapses: c.lapses,
  learning_steps: c.learning_steps,
  state: c.state as Srs['state'],
  last_review: c.last_review?.getTime(),
})

export type Status = 'new' | 'learning' | 'familiar' | 'mastered'
export const STATUSES: Status[] = ['mastered', 'familiar', 'learning', 'new']
export const STATUS_LABEL: Record<Status, string> = { new: 'Not studied', learning: 'Learning', familiar: 'Familiar', mastered: 'Mastered' }

/** Mastered = in review with ≥21 days of memory stability (FSRS's "mature" threshold). */
export function statusOf(c: Pick<Card, 'srs'>): Status {
  const s = c.srs
  if (!s || s.state === 0) return 'new'
  if (s.state === 1 || s.state === 3) return 'learning'
  return s.stability >= 21 ? 'mastered' : 'familiar'
}

export const endOfToday = (now = Date.now()) => {
  const d = new Date(now)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}
export const startOfDay = (t: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Due today = studied before and scheduled for any time up to midnight. */
export const isDue = (c: Pick<Card, 'srs'>, now = Date.now()) => !!c.srs && c.srs.state !== 0 && c.srs.due <= endOfToday(now)

/** What the four buttons would schedule, for labels like "Good · 3d". */
export function preview(c: Card, now = new Date()) {
  const r = scheduler.repeat(toFsrs(c.srs, now), now)
  const fmt = (due: Date) => {
    const ms = due.getTime() - now.getTime()
    if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}m`
    if (ms < DAY) return `${Math.round(ms / 3_600_000)}h`
    if (ms < 30 * DAY) return `${Math.round(ms / DAY)}d`
    if (ms < 365 * DAY) return `${Math.round(ms / (30 * DAY))}mo`
    return `${(ms / (365 * DAY)).toFixed(1)}y`
  }
  return {
    [Rating.Again]: fmt(r[Rating.Again].card.due),
    [Rating.Hard]: fmt(r[Rating.Hard].card.due),
    [Rating.Good]: fmt(r[Rating.Good].card.due),
    [Rating.Easy]: fmt(r[Rating.Easy].card.due),
  } as Record<Grade, string>
}

/** Pure: next memory state after a rating. */
export function nextSrs(srs: Srs | null | undefined, rating: Grade, now = new Date()): Srs {
  return fromFsrs(scheduler.next(toFsrs(srs, now), now, rating).card)
}

async function log(card: Card, mode: StudyMode, rating: 0 | Grade, correct: boolean, ms: number) {
  await db.reviews.add({
    id: newId(),
    cardId: card.id,
    setId: card.setId,
    mode,
    rating,
    correct: correct ? 1 : 0,
    wasNew: statusOf(card) === 'new' ? 1 : 0,
    at: Date.now(),
    ms: Math.min(ms, 120_000), // cap idle time
    dirty: 1,
  })
}

/** Explicit rating (Review mode). */
export async function rate(card: Card, rating: Grade, ms: number) {
  const srs = nextSrs(card.srs, rating)
  await db.cards.update(card.id, { srs, updatedAt: Date.now(), dirty: 1 })
  await log(card, 'review', rating, rating !== Rating.Again, ms)
  return srs
}

/**
 * Learn / quiz answers feed the schedule without over-rewarding:
 * a miss is always "Again" (card comes back soon); a correct answer only counts
 * as "Good" when the card is new or due — otherwise the schedule is left alone.
 */
export async function recordOutcome(card: Card, correct: boolean, mode: 'learn' | 'quiz', ms: number) {
  const fresh = (await db.cards.get(card.id)) ?? card
  let rating: 0 | Grade = 0
  if (!correct) rating = Rating.Again
  else if (statusOf(fresh) === 'new' || isDue(fresh)) rating = Rating.Good
  if (rating) await db.cards.update(card.id, { srs: nextSrs(fresh.srs, rating), updatedAt: Date.now(), dirty: 1 })
  await log(fresh, mode, rating, correct, ms)
}

/** Flashcards mode: counts toward streak/goal, never changes the schedule. */
export const recordFlip = (card: Card, knew: boolean, ms: number) => log(card, 'flashcards', 0, knew, ms)
