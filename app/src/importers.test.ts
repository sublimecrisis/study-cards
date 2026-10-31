import 'fake-indexeddb/auto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { db } from './db'
import { parseCsv, parsePasted, planImport, runImport, toCsv } from './importers'

const KNOWT = join(__dirname, '../../import/knowt')
// The real card files are personal and not in the repo; these tests run only where they exist.
const HAVE_CARDS = existsSync(KNOWT)

function readKnowt() {
  const files = [
    ...readdirSync(KNOWT).filter((f) => f.startsWith('nasm-cpt7__') && f.endsWith('.csv')),
    ...readdirSync(join(KNOWT, 'full-versions')).map((f) => `full-versions/${f}`),
  ]
  return files.flatMap((f) => parseCsv(readFileSync(join(KNOWT, f), 'utf8'), f))
}

describe('parsePasted', () => {
  it('splits Quizlet-style tab lines on the first separator only', () => {
    const cards = parsePasted('ATP\tenergy\tcurrency\nVO2 max\tmax oxygen use\n\n', '\t', '\n')
    expect(cards).toEqual([
      { term: 'ATP', definition: 'energy\tcurrency', needsCheck: 0 },
      { term: 'VO2 max', definition: 'max oxygen use', needsCheck: 0 },
    ])
  })
  it('flags "(verify …)" cards', () => {
    expect(parsePasted('HRmax - 208 - 0.7 x age (verify in your textbook)', ' - ', '\n')[0].needsCheck).toBe(1)
  })
})

describe('parseCsv', () => {
  it('reads a header-less two-column file', () => {
    const rows = parseCsv('a,b\n"c, d","e ""quoted"""\n', 'my-set.csv')
    expect(rows.map((r) => [r.term, r.definition, r.set])).toEqual([
      ['a', 'b', 'my set'],
      ['c, d', 'e "quoted"', 'my set'],
    ])
  })
  it('turns a needs-check tag into the flag', () => {
    const [r] = parseCsv('"term","definition","tags"\n"a","b","d1;needs-check"\n', 'f.csv')
    expect(r).toMatchObject({ tags: ['d1'], needsCheck: 1 })
  })
  it('round-trips our own export format', () => {
    const csv = toCsv([{ term: 'x, "y"', definition: 'line1\nline2', tags: ['a', 'b'], notes: '$E=mc^2$' }], 'C', 'S')
    const [r] = parseCsv(csv, 'f.csv')
    expect(r).toMatchObject({ term: 'x, "y"', definition: 'line1\nline2', tags: ['a', 'b'], notes: '$E=mc^2$', course: 'C', set: 'S' })
  })
})

describe.skipIf(!HAVE_CARDS)('CySA+ files (real files in import/knowt)', () => {
  const files = HAVE_CARDS ? readdirSync(KNOWT).filter((f) => f.startsWith('comptia-cysa__')) : []
  const plan = planImport(files.flatMap((f) => parseCsv(readFileSync(join(KNOWT, f), 'utf8'), f)), true)
  it('gives 6 sets, 720 cards, 10 flagged, one course', () => {
    expect(plan.length).toBe(6)
    expect(plan.reduce((n, p) => n + p.cards.length, 0)).toBe(720)
    expect(plan.flatMap((p) => p.cards).filter((c) => c.needsCheck).length).toBe(10)
    expect(new Set(plan.map((p) => p.course))).toEqual(new Set(['CompTIA CySA+']))
    expect(plan.flatMap((p) => p.cards).some((c) => c.tags?.includes('needs-check'))).toBe(false)
  })
})

describe.skipIf(!HAVE_CARDS)('Knowt bundle (real files in import/knowt)', () => {
  const rows = HAVE_CARDS ? readKnowt() : []
  const plan = planImport(rows, true)

  it('reads all 5024 cards', () => expect(rows.length).toBe(5024))

  it('merges Essentials into Full: 23 chapter sets + Exam Prep, no duplicates', () => {
    expect(plan.length).toBe(24)
    expect(plan.reduce((n, p) => n + p.cards.length, 0)).toBe(2941 + 303)
    expect(plan.flatMap((p) => p.cards).filter((c) => c.tags?.includes('essentials')).length).toBe(1780)
    expect(plan.some((p) => /\((full|essentials)\)/i.test(p.set))).toBe(false)
    expect(plan.find((p) => p.set.startsWith('Ch 1:'))!.set).toBe('Ch 1: The Modern State of Health and Fitness')
  })

  it('flags the "(verify in your CPT7 textbook)" cards', () => {
    const flagged = plan.flatMap((p) => p.cards).filter((c) => c.needsCheck)
    expect(flagged.length).toBe(10)
  })

  it('without merging keeps all 47 sets', () => expect(planImport(readKnowt(), false).length).toBe(47))

  it('imports into the database, and re-importing skips existing sets', async () => {
    const first = await runImport(planImport(readKnowt(), true))
    expect(first).toMatchObject({ sets: 24, cards: 3244, essentials: 1780, skipped: [] })
    expect(await db.cards.count()).toBe(3244)
    expect((await db.courses.toArray()).map((c) => c.name)).toEqual(['NASM CPT7'])
    const again = await runImport(planImport(readKnowt(), true))
    expect(again.sets).toBe(0)
    expect(again.skipped.length).toBe(24)
    expect(await db.cards.count()).toBe(3244)
  })
})
