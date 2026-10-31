import { describe, expect, it } from 'vitest'
import { ACTIVE, answer, GAP_RIGHT, GAP_WRONG, start, type Item } from './learnQueue'
import type { Card } from './types'

const item = (id: string, stage: 0 | 1 = 0): Item => ({ card: { id } as Card, stage, misses: 0 })
const ids = (q: Item[]) => q.map((i) => i.card.id)

describe('Learn spacing', () => {
  it(`keeps ${ACTIVE} cards in play and refills from the pool`, () => {
    const s = start('abcdefgh'.split('').map((c) => item(c)))
    expect(ids(s.queue)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(ids(s.pool)).toEqual(['g', 'h'])
  })
  it(`a miss comes back after ${GAP_WRONG} other cards, reset to the first stage`, () => {
    const { state } = answer(start('abcdef'.split('').map((c) => item(c, 1))), false)
    expect(ids(state.queue).indexOf('a')).toBe(GAP_WRONG)
    expect(state.queue[GAP_WRONG]).toMatchObject({ stage: 0, misses: 1 })
  })
  it(`a first correct answer comes back after ${GAP_RIGHT} others, at the spaced stage`, () => {
    const { state } = answer(start('abcdef'.split('').map((c) => item(c))), true)
    expect(ids(state.queue).indexOf('a')).toBe(GAP_RIGHT)
    expect(state.queue[GAP_RIGHT].stage).toBe(1)
  })
  it('a card is learned only after two correct answers with others in between', () => {
    let s = start('abcdef'.split('').map((c) => item(c)))
    let learned: string[] = []
    for (let k = 0; k < 40 && s.queue.length; k++) {
      const r = answer(s, true)
      if (r.learned) learned = [...learned, r.learned.card.id]
      s = r.state
    }
    expect(learned.sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(s.learned).toHaveLength(6)
  })
  it('a known card (starting at the spaced stage) is learned with one correct answer', () => {
    const r = answer(start([item('k', 1)]), true)
    expect(r.learned?.card.id).toBe('k')
  })
})
