import { describe, expect, it } from 'vitest'
import { activePairs, notePairs, partnerMap, type Pair } from './confusions'
import { makeQuestion } from './quizgen'
import type { Card } from './types'

describe('confusion pairs', () => {
  it('records a mix-up once per pair, counting repeats', () => {
    let l: Pair[] = notePairs([], 'x', false, 'y', 1)
    l = notePairs(l, 'y', false, 'x', 2)
    expect(l).toEqual([{ a: 'x', b: 'y', count: 2, streak: 0, lastAt: 2, fixed: 0 }])
  })
  it('fixed after 3 right in a row on either card; a miss resets the streak', () => {
    let l = notePairs([], 'x', false, 'y')
    l = notePairs(l, 'x', true)
    l = notePairs(l, 'y', true)
    l = notePairs(l, 'x', false) // wrong, but not a new mix-up: streak resets
    expect(l[0]).toMatchObject({ streak: 0, fixed: 0, count: 1 })
    l = notePairs(notePairs(notePairs(l, 'x', true), 'y', true), 'x', true)
    expect(l[0].fixed).toBe(1)
    expect(activePairs(l)).toEqual([])
  })
  it('maps each card to its partners', () => {
    const l = notePairs(notePairs([], 'x', false, 'y'), 'x', false, 'z')
    expect(partnerMap(l).get('x')?.sort()).toEqual(['y', 'z'])
    expect(partnerMap(l).get('y')).toEqual(['x'])
  })
})

describe('partner as a forced option', () => {
  const card = (id: string, def: string): Card => ({
    id, setId: 's', position: 0, term: id, definition: def, notes: '', tags: [], starred: 0, needsCheck: 0,
    termImage: null, defImage: null, createdAt: 0, updatedAt: 0, deleted: 0, dirty: 0,
  })
  const pool = ['apple tree fruit', 'banana yellow fruit', 'cherry red fruit', 'date sweet fruit', 'zzz unrelated thing qq'].map((d, i) => card(`c${i}`, d))
  it('always includes the partner, in normal and hard questions', () => {
    for (let k = 0; k < 50; k++) {
      const q = makeQuestion(pool[0], pool, 'mc', 'definition', { partner: pool[4] })
      expect(q.options).toContain(pool[4].definition)
      const h = makeQuestion(pool[0], pool, 'mc', 'definition', { partner: pool[4], hard: true })
      expect(h.options).toContain(pool[4].definition)
    }
  })
})
