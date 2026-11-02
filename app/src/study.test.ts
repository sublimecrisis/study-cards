import { describe, expect, it } from 'vitest'
import { buildQuiz, distractors, gradeWritten } from './quizgen'
import { isDue, nextSrs, Rating, statusOf } from './srs'
import { breakdown, dayStats } from './stats'
import type { Card } from './types'

const card = (id: string, term: string, definition: string, extra: Partial<Card> = {}): Card => ({
  id, setId: 's', position: 0, term, definition, notes: '', tags: [], starred: 0, needsCheck: 0,
  termImage: null, defImage: null, createdAt: 0, updatedAt: 0, deleted: 0, dirty: 0, ...extra,
})

describe('FSRS status', () => {
  it('new → learning → familiar → mastered as memory grows', () => {
    const c = card('1', 't', 'd')
    expect(statusOf(c)).toBe('new')
    let srs = nextSrs(null, Rating.Good, new Date(2026, 0, 1))
    expect(statusOf({ srs })).toBe('learning')
    let t = new Date(2026, 0, 1)
    for (let i = 0; i < 8; i++) {
      t = new Date(srs.due + 1000)
      srs = nextSrs(srs, Rating.Good, t)
    }
    expect(statusOf({ srs })).toBe('mastered')
    expect(srs.due).toBeGreaterThan(t.getTime() + 20 * 86_400_000)
  })
  it('Again on a mature card sends it back to relearning, due soon', () => {
    const srs = nextSrs({ due: 0, stability: 40, difficulty: 5, scheduled_days: 40, reps: 6, lapses: 0, learning_steps: 0, state: 2, last_review: Date.now() - 40 * 86_400_000 }, Rating.Again)
    expect(statusOf({ srs })).toBe('learning')
    expect(isDue({ srs })).toBe(true)
  })
  it('breakdown counts statuses and due cards', () => {
    const b = breakdown([card('a', 't', 'd'), card('b', 't', 'd', { srs: nextSrs(null, Rating.Again) })])
    expect(b).toMatchObject({ total: 2, new: 1, learning: 1, due: 1 })
  })
})

describe('quiz generation', () => {
  const pool = [
    card('1', 'ATP-PC system', 'Fuel for 10-15 seconds of all-out effort'),
    card('2', 'Glycolysis', 'Fuel for 30-50 seconds of hard effort'),
    card('3', 'Oxidative system', 'Fuel for long, low-intensity effort'),
    card('4', 'Karvonen', 'Uses heart rate reserve'),
    card('5', 'Dup', 'Fuel for 10-15 seconds of all-out effort'),
  ]
  it('wrong answers are distinct from the right one and from each other', () => {
    const d = distractors(pool[0], pool, 'definition')
    expect(d).toHaveLength(3)
    expect(new Set(d).size).toBe(3)
    expect(d).not.toContain(pool[0].definition) // the duplicate-text card is skipped
  })
  it('builds the requested number of questions with one correct MC option each', () => {
    const qs = buildQuiz(pool, pool, { count: 4, types: ['mc', 'tf', 'written'], answerWith: 'term' })
    expect(qs).toHaveLength(4)
    for (const q of qs) {
      expect(q.answerSide).toBe('term')
      if (q.type === 'mc') expect(q.options![q.correctIndex!]).toBe(q.card.term)
      if (q.type === 'tf') expect(q.shown === q.card.term).toBe(q.tfTrue)
    }
  })
})

describe('written grading', () => {
  it.each([
    ['atp pc system', 'ATP-PC system', true],
    ['ATP-PC sytem', 'ATP-PC system', true],
    ['the mitochondria', 'Mitochondria', true],
    ['RMR', 'Resting metabolic rate (RMR)', true],
    ['resting metabolic rate', 'Resting metabolic rate (RMR)', true],
    ['UEBA', 'UEBA (user and entity behavior analytics) / user behavior analysis', true],
    ['glycolysis', 'ATP-PC system', false],
    ['', 'x', false],
  ])('%s vs %s → %s', (typed, answer, ok) => expect(gradeWritten(typed, answer)).toBe(ok))
})

describe('streaks', () => {
  const day = (offset: number) => new Date(2026, 9, 31 + offset, 12).getTime()
  const now = day(0)
  it('counts consecutive days ending today', () => {
    const logs = [day(0), day(-1), day(-2), day(-4)].map((at, i) => ({ at, cardId: String(i), ms: 1000, wasNew: 0 as const }))
    expect(dayStats(logs, now)).toMatchObject({ streak: 3, studiedToday: 1 })
  })
  it('keeps yesterday’s streak alive before you study today', () => {
    const logs = [day(-1), day(-2)].map((at, i) => ({ at, cardId: String(i), ms: 1000, wasNew: 0 as const }))
    expect(dayStats(logs, now)).toMatchObject({ streak: 2, studiedToday: 0 })
  })
  it('counts distinct cards toward the daily goal', () => {
    const logs = [1, 2, 3].map(() => ({ at: now, cardId: 'same', ms: 1000, wasNew: 0 as const }))
    expect(dayStats(logs, now).studiedToday).toBe(1)
  })
})

describe('scenario questions', () => {
  it('keep the right answer correct after shuffling options, and fall back to MC when not generated', async () => {
    const { makeQuestion } = await import('./quizgen')
    const sc = { question: 'A client…?', options: ['A', 'B', 'C', 'D'], correct: 2, why: 'because' }
    const c = card('s1', 'Term', 'Def', { scenarios: [sc] })
    for (let k = 0; k < 20; k++) {
      const q = makeQuestion(c, [c], 'scenario', 'both')
      expect(q.options![q.correctIndex!]).toBe('C')
    }
    const plain = card('p', 'T', 'D')
    expect(makeQuestion(plain, [plain, card('x', 'X', 'Y'), card('z', 'Z', 'W')], 'scenario', 'both').type).not.toBe('scenario')
  })
})

describe('interleave', () => {
  it('takes one card from each chapter in turn, keeping each chapter in order', async () => {
    const { interleave } = await import('./scope')
    const c = (id: string, setId: string) => ({ id, setId })
    const out = interleave([c('a1', 'A'), c('a2', 'A'), c('a3', 'A'), c('b1', 'B'), c('c1', 'C'), c('c2', 'C')])
    expect(out.map((x) => x.id)).toEqual(['a1', 'b1', 'c1', 'a2', 'c2', 'a3'])
  })
})
