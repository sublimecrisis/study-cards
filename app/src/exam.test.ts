import { describe, expect, it } from 'vitest'
import { daysUntil, examBoost, newPerDayNeeded, readiness, weakest } from './exam'
import { nextSrs, Rating, retrievabilityAt } from './srs'
import type { Card } from './types'

const DAY = 86_400_000
const card = (id: string, extra: Partial<Card> = {}): Card => ({
  id, setId: 's', position: 0, term: id, definition: '', notes: '', tags: [], starred: 0, needsCheck: 0,
  termImage: null, defImage: null, createdAt: 0, updatedAt: 0, deleted: 0, dirty: 0, ...extra,
})

describe('exam readiness', () => {
  const now = new Date(2026, 10, 1, 9).getTime()
  const exam = new Date(2026, 10, 9).getTime()
  it('counts days to the exam', () => expect(daysUntil(exam, now)).toBe(8))
  it('recall decays with time and new cards count as zero', () => {
    const srs = nextSrs(null, Rating.Good, new Date(now))
    const learned = card('a', { srs })
    expect(retrievabilityAt(learned, now)).toBeGreaterThan(0.85)
    expect(retrievabilityAt(learned, exam)).toBeLessThan(retrievabilityAt(learned, now))
    expect(readiness([learned, card('b')], exam)).toBeCloseTo(retrievabilityAt(learned, exam + 8 * 3_600_000) / 2, 5)
  })
  it('exam boost pulls forward studied, not-yet-due cards you would forget by exam day', () => {
    // 2-day memory, reviewed today, next due in 2 days: by exam day (8 days out) recall has faded.
    const fading = { state: 2 as const, stability: 2, difficulty: 5, scheduled_days: 2, reps: 2, lapses: 0, learning_steps: 0, last_review: now, due: now + 2 * DAY }
    // Strong memory: still well remembered on exam day.
    const strong = { ...fading, stability: 60, scheduled_days: 60, due: now + 60 * DAY }
    // Reviewed today and due in 2 days (before the exam): must NOT come back today.
    expect(examBoost([card('x', { srs: fading }), card('y', { srs: strong }), card('new')], exam, 0.85, now)).toEqual([])
    // Reviewed a week ago, 10-day interval → next due after the exam, recall on exam day low → boosted.
    const lapsing = { ...fading, stability: 3, scheduled_days: 10, last_review: now - 7 * DAY, due: now + 3 * DAY + 8 * DAY }
    expect(examBoost([card('z', { srs: lapsing }), card('y', { srs: strong })], exam, 0.85, now).map((c) => c.id)).toEqual(['z'])
  })
  it('new cards per day to see everything before the exam', () => {
    expect(newPerDayNeeded([card('1'), card('2'), card('3'), card('4'), card('5'), card('6'), card('7'), card('8'), card('9')], exam, now)).toBe(2)
  })
})

describe('weakest cards', () => {
  it('ranks by recent misses and lapses, ignores cards never missed', () => {
    const now = Date.now()
    const logs = [
      { cardId: 'a', correct: 0 as const, at: now - DAY }, { cardId: 'a', correct: 0 as const, at: now - 2 * DAY },
      { cardId: 'b', correct: 0 as const, at: now - DAY }, { cardId: 'b', correct: 1 as const, at: now },
      { cardId: 'c', correct: 1 as const, at: now },
    ]
    expect(weakest([card('a'), card('b'), card('c')], logs).map((c) => c.id)).toEqual(['a', 'b'])
  })
})
