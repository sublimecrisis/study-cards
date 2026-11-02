import { describe, expect, it } from 'vitest'
import { Rating } from 'ts-fsrs'
import { autoGrade, DEFAULT_PACE, expectedMs, isStrong, paceFrom } from './grade'
import { makeQuestion, NONE_OF_THESE } from './quizgen'
import type { Card } from './types'

describe('autoGrade', () => {
  const exp = 10_000
  it('wrong = Again, guessed = Hard, normal = Good, never Easy', () => {
    expect(autoGrade({ correct: false, ms: 1000, expectedMs: exp })).toEqual({ rating: Rating.Again, reason: 'wrong' })
    expect(autoGrade({ correct: true, guessed: true, ms: 1000, expectedMs: exp })).toEqual({ rating: Rating.Hard, reason: 'guessed' })
    expect(autoGrade({ correct: true, ms: 1000, expectedMs: exp }).rating).toBe(Rating.Good)
  })
  it('slow for you = Hard; a long pause ignores speed', () => {
    expect(autoGrade({ correct: true, ms: 17_000, expectedMs: exp }).rating).toBe(Rating.Good)
    expect(autoGrade({ correct: true, ms: 19_000, expectedMs: exp })).toEqual({ rating: Rating.Hard, reason: 'slow' })
    expect(autoGrade({ correct: true, ms: 120_000, expectedMs: exp })).toEqual({ rating: Rating.Good, reason: 'away' })
    expect(autoGrade({ correct: false, ms: 120_000, expectedMs: exp }).rating).toBe(Rating.Again)
  })
})

describe('pace', () => {
  const log = (ms: number, chars: number, i: number) => ({ at: i, ms, correct: 1 as const, qtype: 'mc' as const, chars })
  it('uses the default until 20 right MC answers exist', () => {
    expect(paceFrom(Array.from({ length: 19 }, (_, i) => log(12_500, 100, i)))).toBe(DEFAULT_PACE)
  })
  it('median ms per character of right answers, ignoring wrong ones and long pauses', () => {
    const logs = [
      ...Array.from({ length: 21 }, (_, i) => log(2_500 + 100 * 40, 100, i)), // 40 ms/char
      { at: 99, ms: 500, correct: 0 as const, qtype: 'mc' as const, chars: 100 },
      { at: 98, ms: 200_000, correct: 1 as const, qtype: 'mc' as const, chars: 100 },
    ]
    expect(paceFrom(logs)).toBe(40)
    expect(expectedMs(200, 40)).toBe(10_500)
  })
})

describe('hard multiple choice', () => {
  const card = (id: string, term: string, def: string, extra: Partial<Card> = {}): Card => ({
    id, setId: 's', position: 0, term, definition: def, notes: '', tags: ['ch5'], starred: 0, needsCheck: 0,
    termImage: null, defImage: null, createdAt: 0, updatedAt: 0, deleted: 0, dirty: 0, ...extra,
  })
  const pool = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta'].map((w, i) => card(w, w, `${w} muscle definition ${i}`))
  it('5 options ending in "None of these"; right answer listed at most once', () => {
    let none = 0
    for (let k = 0; k < 200; k++) {
      const q = makeQuestion(pool[0], pool, 'mc', 'definition', { hard: true })
      expect(q.options).toHaveLength(5)
      expect(q.options![4]).toBe(NONE_OF_THESE)
      const listed = q.options!.filter((o) => o === pool[0].definition).length
      if (q.correctIndex === 4) {
        none++
        expect(listed).toBe(0)
      } else {
        expect(listed).toBe(1)
        expect(q.options![q.correctIndex!]).toBe(pool[0].definition)
      }
    }
    expect(none).toBeGreaterThan(20) // ~25%
    expect(none).toBeLessThan(90)
  })
  it('only cards held a week+ count as strong', () => {
    const srs = { state: 2 as const, stability: 7, difficulty: 5, scheduled_days: 7, reps: 3, lapses: 0, learning_steps: 0, due: 0 }
    expect(isStrong({ srs })).toBe(true)
    expect(isStrong({ srs: { ...srs, stability: 3 } })).toBe(false)
    expect(isStrong({ srs: { ...srs, state: 3 } })).toBe(false)
  })
})
