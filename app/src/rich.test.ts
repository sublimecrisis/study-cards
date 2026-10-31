import { describe, expect, it } from 'vitest'
import { splitMath } from './rich'

describe('splitMath', () => {
  it('finds inline and display formulas', () => {
    expect(splitMath('HR $208-0.7x$ and $$a^2$$.')).toEqual([
      { math: false, display: false, text: 'HR ' },
      { math: true, display: false, text: '208-0.7x' },
      { math: false, display: false, text: ' and ' },
      { math: true, display: true, text: 'a^2' },
      { math: false, display: false, text: '.' },
    ])
  })
  it('leaves prices alone', () => {
    expect(splitMath('costs $5 or $10')).toEqual([{ math: false, display: false, text: 'costs $5 or $10' }])
  })
})
