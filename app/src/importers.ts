import Papa from 'papaparse'
import { addCards, addCourse, addSet, db } from './db'
import type { CardDraft } from './types'

/** One card as read from a file, before it's grouped into a set. */
export interface ParsedRow extends CardDraft {
  course: string
  set: string
}

export interface PlannedSet {
  course: string
  set: string
  cards: CardDraft[]
}

// Cards written with a "(verify in your textbook)"-style caveat get flagged.
const VERIFY = /\(verify\b[^)]*\)/i
const needsCheckOf = (d: CardDraft): 0 | 1 => (VERIFY.test(d.term) || VERIFY.test(d.definition) ? 1 : 0)

const splitTags = (s: string | undefined) =>
  (s ?? '')
    .split(';')
    .map((t) => t.trim())
    .filter(Boolean)

/** "nasm-cpt7__ch01-some-name.csv" → "ch01 some name" (fallback set name). */
function nameFromFile(file: string) {
  const base = file.replace(/^.*\//, '').replace(/\.[^.]+$/, '')
  const part = base.includes('__') ? base.split('__').pop()! : base
  return part.replace(/[-_]+/g, ' ').trim() || 'Imported set'
}

// ---- pasted text (Quizlet-style "term<sep>definition" lines) ----
export function parsePasted(text: string, termSep: string, cardSep: string): CardDraft[] {
  if (!termSep || !cardSep) return []
  return text
    .split(cardSep)
    .map((chunk) => chunk.replace(/^\r?\n|\r?\n$/g, ''))
    .filter((chunk) => chunk.trim())
    .map((chunk) => {
      const i = chunk.indexOf(termSep)
      const term = (i < 0 ? chunk : chunk.slice(0, i)).trim()
      const definition = (i < 0 ? '' : chunk.slice(i + termSep.length)).trim()
      const d: CardDraft = { term, definition }
      d.needsCheck = needsCheckOf(d)
      return d
    })
}

// ---- CSV: our format (term,definition,course,set,tags,notes) or any 2+ column file ----
export function parseCsv(text: string, fileName: string): ParsedRow[] {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' })
  const rows = res.data
  if (!rows.length) return []
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const hasHeader = head.includes('term') && head.includes('definition')
  const col = (name: string, fallback: number) => (hasHeader ? head.indexOf(name) : fallback)
  const [ti, di, ci, si, gi, ni] = [
    col('term', 0),
    col('definition', 1),
    col('course', -1),
    col('set', -1),
    col('tags', -1),
    col('notes', -1),
  ]
  const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')
  const fallbackSet = nameFromFile(fileName)
  return rows
    .slice(hasHeader ? 1 : 0)
    .map((r) => {
      const row: ParsedRow = {
        term: at(r, ti),
        definition: at(r, di),
        notes: at(r, ni),
        tags: splitTags(at(r, gi)),
        course: at(r, ci) || 'Imported',
        set: at(r, si) || fallbackSet,
      }
      // A `needs-check` tag is an instruction, not a topic: it becomes the flag.
      const flagged = row.tags!.some((t) => t.toLowerCase() === 'needs-check')
      row.tags = row.tags!.filter((t) => t.toLowerCase() !== 'needs-check')
      row.needsCheck = flagged ? 1 : needsCheckOf(row)
      return row
    })
    .filter((r) => r.term || r.definition)
}

const ESS = /\s*\(essentials\)\s*$/i
const FULL = /\s*\(full\)\s*$/i
const cardKey = (d: CardDraft) => `${d.term.trim().toLowerCase()}\u0000${d.definition.trim().toLowerCase()}`

/**
 * Group parsed rows into sets. With mergeEssentials, an "X (Essentials)" set whose
 * "X (Full)" twin is also present is folded into the full set: matching cards get an
 * `essentials` tag (so any mode can filter to them) instead of becoming duplicates.
 */
export function planImport(rows: ParsedRow[], mergeEssentials: boolean): PlannedSet[] {
  const groups = new Map<string, PlannedSet>()
  for (const { course, set, ...card } of rows) {
    const k = `${course}\u0000${set}`
    if (!groups.has(k)) groups.set(k, { course, set, cards: [] })
    groups.get(k)!.cards.push(card)
  }
  if (!mergeEssentials) return [...groups.values()]

  const out: PlannedSet[] = []
  const all = [...groups.values()]
  const fullByBase = new Map<string, PlannedSet>()
  for (const g of all) if (FULL.test(g.set)) fullByBase.set(`${g.course}\u0000${g.set.replace(FULL, '')}`, g)

  for (const g of all) {
    if (!ESS.test(g.set)) continue
    const full = fullByBase.get(`${g.course}\u0000${g.set.replace(ESS, '')}`)
    if (!full) continue
    const essKeys = new Set(g.cards.map(cardKey))
    const fullKeys = new Set(full.cards.map(cardKey))
    for (const c of full.cards) {
      c.tags = (c.tags ?? []).filter((t) => !/^(full|essentials)$/i.test(t))
      if (essKeys.has(cardKey(c))) c.tags.push('essentials')
    }
    // Essentials cards with no exact twin in the full set are kept, not lost.
    for (const c of g.cards)
      if (!fullKeys.has(cardKey(c)))
        full.cards.push({ ...c, tags: [...(c.tags ?? []).filter((t) => !/^(full|essentials)$/i.test(t)), 'essentials'] })
    g.cards = [] // merged
  }
  for (const g of all) {
    if (!g.cards.length) continue
    out.push(fullByBase.has(`${g.course}\u0000${g.set.replace(FULL, '')}`) && FULL.test(g.set) ? { ...g, set: g.set.replace(FULL, '') } : g)
  }
  return out
}

export interface ImportResult {
  sets: number
  cards: number
  essentials: number
  needsCheck: number
  skipped: string[]
}

/** Write a plan to the database. Sets that already exist (same course + name) are skipped, so re-importing is safe. */
export async function runImport(plan: PlannedSet[], target?: { setId: string }): Promise<ImportResult> {
  const res: ImportResult = { sets: 0, cards: 0, essentials: 0, needsCheck: 0, skipped: [] }
  const count = (cards: CardDraft[]) => {
    res.cards += cards.length
    res.essentials += cards.filter((c) => c.tags?.includes('essentials')).length
    res.needsCheck += cards.filter((c) => c.needsCheck).length
  }
  if (target) {
    const cards = plan.flatMap((p) => p.cards)
    await addCards(target.setId, cards)
    count(cards)
    return res
  }
  const courses = (await db.courses.toArray()).filter((c) => !c.deleted)
  const sets = (await db.sets.toArray()).filter((s) => !s.deleted)
  for (const p of plan) {
    let course = courses.find((c) => c.name.toLowerCase() === p.course.toLowerCase())
    if (!course) {
      const id = await addCourse(p.course)
      course = (await db.courses.get(id))!
      courses.push(course)
    }
    if (sets.some((s) => s.courseId === course.id && s.name.toLowerCase() === p.set.toLowerCase())) {
      res.skipped.push(`${p.course} › ${p.set}`)
      continue
    }
    const setId = await addSet(course.id, p.set)
    sets.push((await db.sets.get(setId))!)
    await addCards(setId, p.cards)
    res.sets++
    count(p.cards)
  }
  return res
}

/** Cards → CSV in the same format we import. */
export function toCsv(cards: { term: string; definition: string; tags: string[]; notes: string }[], course: string, set: string) {
  return Papa.unparse(
    {
      fields: ['term', 'definition', 'course', 'set', 'tags', 'notes'],
      data: cards.map((c) => [c.term, c.definition, course, set, c.tags.join(';'), c.notes]),
    },
    { quotes: true },
  )
}
