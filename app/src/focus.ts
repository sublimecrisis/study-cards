import type { ReviewLog } from './types'

// ---- Focus timer (Pomodoro) ----
// The timer stores when the block started plus a shift for pauses/skips, never a
// running counter, so it is right whenever the app is reopened.

export type Phase = 'focus' | 'break' | 'long'
export interface Preset {
  key: string
  label: string
  focus: number // minutes
  short: number
  long: number
  longAfter: number // long break after every N focus rounds (0 = never)
}
export const PRESETS: Preset[] = [
  { key: '50-10', label: '50 / 10', focus: 50, short: 10, long: 30, longAfter: 2 },
  { key: '25-5', label: '25 / 5', focus: 25, short: 5, long: 20, longAfter: 4 },
  { key: '90-20', label: '90 / 20', focus: 90, short: 20, long: 20, longAfter: 0 },
]
export const presetOf = (key: string) => PRESETS.find((p) => p.key === key) ?? PRESETS[0]

export interface Segment {
  kind: Phase
  ms: number
  round: number // focus round number (for a break: the round just finished)
}

const MIN = 60_000
const MIN_LAST_FOCUS = 10 // don't squeeze a break in if less than this would be left to study

/** Rounds for a block. The last focus round shrinks to fit; a block never ends on a break. */
export function buildPlan(p: Preset, blockMin: number): Segment[] {
  const out: Segment[] = []
  let left = blockMin
  for (let round = 1; left > 0; round++) {
    const f = Math.min(p.focus, left)
    out.push({ kind: 'focus', ms: f * MIN, round })
    left -= f
    const long = p.longAfter > 0 && round % p.longAfter === 0
    const b = long ? p.long : p.short
    if (left - b < MIN_LAST_FOCUS) break
    out.push({ kind: long ? 'long' : 'break', ms: b * MIN, round })
    left -= b
  }
  return out
}

export interface RoundWindow {
  round: number
  from: number
  to: number
}
export interface FocusState {
  preset: string
  blockMin: number
  startedAt: number
  pausedAt: number | null
  shiftMs: number // + skips forward, - time spent paused
  rounds: RoundWindow[] // real clock windows of focus rounds so far (for the summary)
}

export const start = (preset: string, blockMin: number, now = Date.now()): FocusState => ({
  preset,
  blockMin,
  startedAt: now,
  pausedAt: null,
  shiftMs: 0,
  rounds: [],
})

const elapsed = (s: FocusState, now: number) => (s.pausedAt ?? now) - s.startedAt + s.shiftMs

export interface Position {
  plan: Segment[]
  i: number // current segment index (plan.length when done)
  seg: Segment | null
  remainingMs: number
  done: boolean
  totalRounds: number
}

export function position(s: FocusState, now = Date.now()): Position {
  const plan = buildPlan(presetOf(s.preset), s.blockMin)
  const totalRounds = plan.filter((x) => x.kind === 'focus').length
  let t = elapsed(s, now)
  for (let i = 0; i < plan.length; i++) {
    if (t < plan[i].ms) return { plan, i, seg: plan[i], remainingMs: plan[i].ms - t, done: false, totalRounds }
    t -= plan[i].ms
  }
  return { plan, i: plan.length, seg: null, remainingMs: 0, done: true, totalRounds }
}

export const pause = (s: FocusState, now = Date.now()): FocusState => (s.pausedAt ? s : { ...s, pausedAt: now })
export const resume = (s: FocusState, now = Date.now()): FocusState =>
  s.pausedAt ? { ...s, pausedAt: null, shiftMs: s.shiftMs - (now - s.pausedAt) } : s
/** Jump to the next segment (skip a break, or start the break early). */
export const skip = (s: FocusState, now = Date.now()): FocusState => ({ ...s, shiftMs: s.shiftMs + position(s, now).remainingMs })

/** Record the real-clock window of the focus round in progress (called every tick). */
export function trackRound(s: FocusState, now = Date.now()): FocusState {
  const pos = position(s, now)
  if (!pos.seg || pos.seg.kind !== 'focus' || s.pausedAt) return s
  const last = s.rounds[s.rounds.length - 1]
  if (last?.round === pos.seg.round) return last.to === now ? s : { ...s, rounds: [...s.rounds.slice(0, -1), { ...last, to: now }] }
  return { ...s, rounds: [...s.rounds, { round: pos.seg.round, from: now, to: now }] }
}

// ---- fatigue + summary ----

type Answer = Pick<ReviewLog, 'at' | 'correct' | 'ms'> & Partial<Pick<ReviewLog, 'wasNew' | 'cardId'>>

/**
 * Accuracy-drop check: with at least 30 answers in the block, compare the last 15
 * with everything before them. A drop of 20+ points suggests a break.
 */
export function fatigue(answers: Answer[], recent = 15, minTotal = 30, drop = 0.2) {
  if (answers.length < minTotal) return null
  const sorted = [...answers].sort((a, b) => a.at - b.at)
  const acc = (xs: Answer[]) => xs.filter((x) => x.correct).length / xs.length
  const before = acc(sorted.slice(0, -recent))
  const last = acc(sorted.slice(-recent))
  return before - last >= drop ? { before, last } : null
}

export interface BlockSummary {
  id: string
  at: number // block start
  preset: string
  minutesFocused: number
  answers: number
  accuracy: number | null
  rounds: RoundStats[]
  // added 2026-11-08 (older summaries don't have them)
  perMin?: number | null // cards answered per focused minute
  newCards?: number // first-time cards seen in the block
  cards?: number // different cards answered
}
export interface RoundStats {
  round: number
  answers: number
  accuracy: number | null
  minutes?: number
  perMin?: number | null
  newCards?: number
}

/** Answers, pace, new cards and accuracy for a stretch of study (pure). */
export function paceStats(answers: Answer[], minutes: number) {
  const acc = answers.length ? answers.filter((x) => x.correct).length / answers.length : null
  return {
    answers: answers.length,
    accuracy: acc,
    minutes,
    perMin: minutes >= 1 ? Math.round((answers.length / minutes) * 10) / 10 : null,
    newCards: answers.filter((a) => a.wasNew).length,
    cards: new Set(answers.map((a) => a.cardId ?? a.at)).size,
  }
}

export function summarize(s: FocusState, answers: Answer[], id: string): BlockSummary {
  const rounds: RoundStats[] = s.rounds.map((r) => {
    const xs = answers.filter((a) => a.at >= r.from && a.at <= r.to + 5_000)
    const p = paceStats(xs, Math.round((r.to - r.from) / MIN))
    return { round: r.round, answers: p.answers, accuracy: p.accuracy, minutes: p.minutes, perMin: p.perMin, newCards: p.newCards }
  })
  const inBlock = answers.filter((a) => a.at >= s.startedAt)
  const minutesFocused = Math.round(s.rounds.reduce((n, r) => n + (r.to - r.from), 0) / MIN)
  const p = paceStats(inBlock, minutesFocused)
  return { id, at: s.startedAt, preset: s.preset, minutesFocused, answers: p.answers, accuracy: p.accuracy, rounds, perMin: p.perMin, newCards: p.newCards, cards: p.cards }
}

export const clock = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}
export const PHASE_LABEL: Record<Phase, string> = { focus: 'Focus', break: 'Break', long: 'Long break' }
