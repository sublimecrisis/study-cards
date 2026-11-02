import { Rating, type Grade } from 'ts-fsrs'
import type { Card, ReviewLog } from './types'

// ---- Automatic grading for multiple-choice Review ----
// The app picks the FSRS rating, so the schedule follows what you actually know
// instead of which button you press.

export const SLOW_FACTOR = 1.8 // slower than this × your expected time = "Hard"
export const WALK_AWAY_MS = 90_000 // longer than this: you probably stepped away, ignore speed
const BASE_MS = 2_500
export const DEFAULT_PACE = 60 // ms per character until there's enough history
const MIN_SAMPLES = 20
export const STRONG_DAYS = 7 // cards held this long get the harder question

export type GradeReason = 'wrong' | 'guessed' | 'slow' | 'normal' | 'away'
export const REASON_LABEL: Record<GradeReason, string> = {
  wrong: 'wrong answer',
  guessed: 'you guessed',
  slow: 'right, but slower than your usual pace',
  normal: 'right, normal pace',
  away: 'right (timer ignored: long pause)',
}

/**
 * Wrong = Again, guessed or slow = Hard, otherwise Good. Never Easy: choosing from
 * options is easier than recalling, so MC shouldn't push intervals out as far.
 */
export function autoGrade(a: { correct: boolean; guessed?: boolean; ms: number; expectedMs?: number }): { rating: Grade; reason: GradeReason } {
  if (!a.correct) return { rating: Rating.Again, reason: 'wrong' }
  if (a.guessed) return { rating: Rating.Hard, reason: 'guessed' }
  if (a.ms > WALK_AWAY_MS) return { rating: Rating.Good, reason: 'away' }
  if (a.expectedMs && a.ms > a.expectedMs * SLOW_FACTOR) return { rating: Rating.Hard, reason: 'slow' }
  return { rating: Rating.Good, reason: 'normal' }
}

export const expectedMs = (chars: number, pace: number) => BASE_MS + pace * chars

/** Your reading pace: median ms per character over your last 100 right MC answers. */
export function paceFrom(logs: Pick<ReviewLog, 'at' | 'ms' | 'correct' | 'qtype' | 'chars'>[]) {
  const xs = logs
    .filter((l) => l.correct && l.qtype === 'mc' && l.chars && l.ms > 0 && l.ms <= WALK_AWAY_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, 100)
    .map((l) => Math.max(0, l.ms - BASE_MS) / l.chars!)
    .sort((a, b) => a - b)
  if (xs.length < MIN_SAMPLES) return DEFAULT_PACE
  const mid = xs.length >> 1
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2
}

/** Held for a week or more: gets the harder multiple-choice question. */
export const isStrong = (c: Pick<Card, 'srs'>) => !!c.srs && c.srs.state === 2 && c.srs.stability >= STRONG_DAYS
