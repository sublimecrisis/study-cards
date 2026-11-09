import { describe, expect, it } from 'vitest'
import { buildPlan, fatigue, pause, position, presetOf, resume, skip, start, summarize, trackRound } from './focus'

const MIN = 60_000
const mins = (plan: { kind: string; ms: number }[]) => plan.map((s) => `${s.kind[0]}${s.ms / MIN}`).join(' ')

describe('focus plan', () => {
  it('4-hour 50/10 block: long break at the 2-hour mark, last round shrinks to fit', () => {
    const plan = buildPlan(presetOf('50-10'), 240)
    expect(mins(plan)).toBe('f50 b10 f50 l30 f50 b10 f40')
    expect(plan.reduce((n, s) => n + s.ms, 0)).toBe(240 * MIN)
  })
  it('25/5: long break after every 4 rounds', () => {
    expect(mins(buildPlan(presetOf('25-5'), 240))).toBe('f25 b5 f25 b5 f25 b5 f25 l20 f25 b5 f25 b5 f25 b5 f15')
  })
  it('never ends on a break or leaves a tiny last round', () => {
    // 50/10 in 65 min: 50 focus, then only 5 min would be left after a break → stop.
    expect(mins(buildPlan(presetOf('50-10'), 65))).toBe('f50')
    expect(mins(buildPlan(presetOf('50-10'), 30))).toBe('f30')
  })
})

describe('focus position', () => {
  const t0 = new Date(2026, 10, 2, 9).getTime()
  const s = start('50-10', 240, t0)
  it('tracks the current segment from the start time', () => {
    expect(position(s, t0 + 10 * MIN)).toMatchObject({ i: 0, remainingMs: 40 * MIN, totalRounds: 4 })
    expect(position(s, t0 + 55 * MIN)).toMatchObject({ i: 1, remainingMs: 5 * MIN })
    expect(position(s, t0 + 115 * MIN).seg?.kind).toBe('long')
    expect(position(s, t0 + 241 * MIN).done).toBe(true)
  })
  it('pause freezes the clock; resume continues where it left off', () => {
    const p = pause(s, t0 + 10 * MIN)
    expect(position(p, t0 + 30 * MIN).remainingMs).toBe(40 * MIN)
    const r = resume(p, t0 + 30 * MIN)
    expect(position(r, t0 + 35 * MIN).remainingMs).toBe(35 * MIN)
  })
  it('skip jumps to the next segment (break early, or skip a break)', () => {
    const k = skip(s, t0 + 20 * MIN)
    expect(position(k, t0 + 20 * MIN)).toMatchObject({ i: 1, remainingMs: 10 * MIN })
    const k2 = skip(k, t0 + 22 * MIN)
    expect(position(k2, t0 + 22 * MIN)).toMatchObject({ i: 2, remainingMs: 50 * MIN })
  })
})

describe('fatigue + summary', () => {
  const at = (i: number) => 1000 + i
  it('needs 30 answers and a 20-point drop in the last 15', () => {
    const good = Array.from({ length: 20 }, (_, i) => ({ at: at(i), correct: 1 as const, ms: 0 }))
    const bad = Array.from({ length: 15 }, (_, i) => ({ at: at(100 + i), correct: (i < 9 ? 1 : 0) as 0 | 1, ms: 0 })) // 60%
    expect(fatigue(good)).toBeNull()
    expect(fatigue([...good, ...bad])).toMatchObject({ before: 1, last: 0.6 })
    const ok = bad.map((b, i) => ({ ...b, correct: (i < 13 ? 1 : 0) as 0 | 1 })) // 87%
    expect(fatigue([...good, ...ok])).toBeNull()
  })
  it('summarizes accuracy per focus round', () => {
    const t0 = 0
    let s = start('25-5', 60, t0)
    s = trackRound(s, t0)
    s = trackRound(s, t0 + 25 * MIN - 1)
    s = trackRound(s, t0 + 30 * MIN)
    s = trackRound(s, t0 + 54 * MIN)
    const answers = [
      { at: 5 * MIN, correct: 1 as const, ms: 0 },
      { at: 10 * MIN, correct: 1 as const, ms: 0 },
      { at: 40 * MIN, correct: 0 as const, ms: 0 },
      { at: 45 * MIN, correct: 1 as const, ms: 0 },
    ]
    const sum = summarize(s, answers, 'x')
    expect(sum.rounds).toMatchObject([
      { round: 1, answers: 2, accuracy: 1, minutes: 25 },
      { round: 2, answers: 2, accuracy: 0.5, minutes: 24 },
    ])
    expect(sum).toMatchObject({ answers: 4, accuracy: 0.75, minutesFocused: 49 })
  })
  it('pace: cards per minute, new cards, different cards', async () => {
    const { paceStats } = await import('./focus')
    const xs = [
      { at: 1, correct: 1 as const, ms: 0, wasNew: 1 as const, cardId: 'a' },
      { at: 2, correct: 0 as const, ms: 0, wasNew: 0 as const, cardId: 'b' },
      { at: 3, correct: 1 as const, ms: 0, wasNew: 0 as const, cardId: 'b' },
    ]
    expect(paceStats(xs, 2)).toMatchObject({ answers: 3, perMin: 1.5, newCards: 1, cards: 2 })
    expect(paceStats(xs, 0).perMin).toBeNull() // under a minute: no rate yet
  })
})
