import { db } from './db'
import { weakest } from './exam'
import { loadPairs, partnerMap } from './confusions'
import { bedtimeCards } from './bedtime'
import { startOfDay } from './srs'
import type { Card, CardSet, Course } from './types'

/** What to study: everything, one course, or one set — optionally narrowed by a filter. */
export interface Scope {
  kind: 'all' | 'course' | 'set'
  id: string
  filter: 'all' | 'starred' | 'check' | 'weak' | 'mixed' | 'tonight' | `tag:${string}`
}

export function readScope(params: URLSearchParams): Scope {
  const [kind, id = ''] = (params.get('scope') ?? 'all').split(':') as [Scope['kind'], string]
  return { kind: kind === 'course' || kind === 'set' ? kind : 'all', id, filter: (params.get('filter') as Scope['filter']) || 'all' }
}

export const scopeQuery = (s: Scope) =>
  new URLSearchParams({ scope: s.kind === 'all' ? 'all' : `${s.kind}:${s.id}`, ...(s.filter !== 'all' ? { filter: s.filter } : {}) }).toString()

export const scopeKey = (s: Pick<Scope, 'kind' | 'id'>) => (s.kind === 'all' ? 'all' : `${s.kind}:${s.id}`)

export const filterLabel = (f: Scope['filter']) =>
  f === 'starred' ? 'Starred' : f === 'check' ? 'Needs check' : f === 'weak' ? 'Weakest' : f === 'mixed' ? 'Mixed up' : f === 'tonight' ? 'Before bed' : f.startsWith('tag:') ? f.slice(4)[0].toUpperCase() + f.slice(5) : ''

export interface Loaded {
  cards: Card[]
  sets: Map<string, CardSet>
  label: string
}

/** Live (non-deleted, non-archived) cards in a scope, in set order. */
export async function loadScope(s: Scope): Promise<Loaded> {
  const courses = new Map<string, Course>((await db.courses.toArray()).filter((c) => !c.deleted).map((c) => [c.id, c]))
  const sets = (await db.sets.toArray()).filter((x) => {
    const c = courses.get(x.courseId)
    if (x.deleted || !c) return false
    if (s.kind === 'set') return x.id === s.id
    if (s.kind === 'course') return x.courseId === s.id
    return !c.archived
  })
  const setMap = new Map(sets.map((x) => [x.id, x]))
  const order = new Map(sets.map((x, i) => [x.id, i]))
  let cards = (await db.cards.toArray()).filter((c) => !c.deleted && setMap.has(c.setId))
  cards.sort((a, b) => order.get(a.setId)! - order.get(b.setId)! || a.position - b.position)
  if (s.filter === 'starred') cards = cards.filter((c) => c.starred)
  else if (s.filter === 'check') cards = cards.filter((c) => c.needsCheck)
  else if (s.filter.startsWith('tag:')) cards = cards.filter((c) => c.tags.includes(s.filter.slice(4)))
  else if (s.filter === 'tonight') cards = bedtimeCards(cards, await db.reviews.where('at').above(startOfDay(Date.now())).toArray())
  else if (s.filter === 'mixed') {
    const partners = partnerMap(await loadPairs())
    cards = cards.filter((c) => partners.has(c.id))
  } else if (s.filter === 'weak') cards = weakest(cards, await db.reviews.where('at').above(Date.now() - 60 * 86_400_000).toArray(), 40)
  const base = s.kind === 'set' ? (setMap.get(s.id)?.name ?? 'Set') : s.kind === 'course' ? (courses.get(s.id)?.name ?? 'Course') : 'All courses'
  const fl = filterLabel(s.filter)
  return { cards, sets: setMap, label: fl ? `${base} · ${fl}` : base }
}

export function shuffle<T>(a: T[]): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

/**
 * Interleave cards across chapters (sets): one from each in turn, keeping each chapter's
 * own order. Mixing topics makes you work out which concept applies, which studies show
 * beats doing one chapter at a time.
 */
export function interleave<T extends { setId: string }>(cards: T[]): T[] {
  const groups = new Map<string, T[]>()
  for (const c of cards) (groups.get(c.setId) ?? groups.set(c.setId, []).get(c.setId)!).push(c)
  const lists = [...groups.values()]
  const out: T[] = []
  for (let i = 0; out.length < cards.length; i++) for (const l of lists) if (i < l.length) out.push(l[i])
  return out
}

/**
 * Wrong options for multiple choice come from the card's own course (all of it), so a
 * filtered session (weakest, mixed up, before bed) still gets good options and courses
 * never mix (no NASM answers in a CySA+ question).
 */
export async function loadCoursePools(): Promise<(card: Card) => Card[]> {
  const sets = await db.sets.toArray()
  const courseOf = new Map(sets.filter((s) => !s.deleted).map((s) => [s.id, s.courseId]))
  const byCourse = new Map<string, Card[]>()
  await db.cards.each((c) => {
    const cid = courseOf.get(c.setId)
    if (c.deleted || !cid) return
    ;(byCourse.get(cid) ?? byCourse.set(cid, []).get(cid)!).push(c)
  })
  return (card) => byCourse.get(courseOf.get(card.setId) ?? '') ?? [card]
}
