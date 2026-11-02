import { describe, expect, it } from 'vitest'
import { bedtimeCards, isBedtime } from './bedtime'
import type { Card } from './types'

const DAY = 86_400_000
const now = new Date(2026, 10, 2, 21).getTime()
const card = (id: string, stability: number | null, lastDaysAgo = 1): Card => ({
  id, setId: 's', position: 0, term: id, definition: '', notes: '', tags: [], starred: 0, needsCheck: 0,
  termImage: null, defImage: null, createdAt: 0, updatedAt: 0, deleted: 0, dirty: 0,
  srs: stability === null ? null : { state: 2, stability, difficulty: 5, scheduled_days: 1, reps: 2, lapses: 0, learning_steps: 0, due: now, last_review: now - lastDaysAgo * DAY },
})

describe('before-bed review', () => {
  it("today's misses first (newest first), then shaky cards by lowest recall; skips strong and new cards", () => {
    const cards = [card('strong', 100), card('shaky', 0.3, 5), card('shakier', 0.2, 6), card('missed1', 50), card('missed2', 50), card('new', null)]
    const logs = [
      { cardId: 'missed1', correct: 0 as const, at: now - 3 * 3_600_000 },
      { cardId: 'missed2', correct: 0 as const, at: now - 1 * 3_600_000 },
      { cardId: 'strong', correct: 1 as const, at: now - 2 * 3_600_000 },
      { cardId: 'old-miss', correct: 0 as const, at: now - 2 * DAY },
    ]
    expect(bedtimeCards(cards, logs, now).map((c) => c.id)).toEqual(['missed2', 'missed1', 'shakier', 'shaky'])
  })
  it('shows from 8 pm', () => {
    expect(isBedtime(new Date(2026, 10, 2, 19, 59).getTime())).toBe(false)
    expect(isBedtime(new Date(2026, 10, 2, 20, 0).getTime())).toBe(true)
  })
})
