import type { Card } from './types'

/**
 * Twins: the same concept stored as separate cards (textbooks repeat key terms across
 * chapters, and the Exam Prep deck repeats them again).
 *
 * - Same concept (shares a schedule, asked once per session): same name once brackets
 *   are dropped ("Human movement system (HMS)" / "(kinetic chain)") AND answers that
 *   overlap. Same name with different answers (overactive vs underactive muscles) stays apart.
 * - Same answer (never offered as each other's wrong option): one answer's words are
 *   (almost) all inside the other's, e.g. "Integrated program design includes" vs
 *   "Integrated training". Tendon vs ligament each have a word the other lacks, so they
 *   remain good wrong options for each other.
 * No chaining by answer similarity: that merged tendon with ligament on the real deck.
 */
export const SAME_ANSWER = 0.9
export const SAME_NAME_OVERLAP = 0.5
const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'from', 'are', 'its', 'your', 'this', 'which', 'what', 'into', 'when', 'than', 'they', 'their', 'about', 'used', 'by', 'of', 'to', 'in', 'or', 'an', 'is', 'on', 'at', 'as', 'be'])

export const termKey = (term: string) => term.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
export const words = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []).filter((w) => !STOP.has(w)))
/** Share of the smaller answer's words that also appear in the other. */
export function containment(a: Set<string>, b: Set<string>) {
  let i = 0
  for (const w of a) if (b.has(w)) i++
  return i / Math.max(1, Math.min(a.size, b.size))
}

type Lite = Pick<Card, 'id' | 'term' | 'definition'> & Partial<Pick<Card, 'drill' | 'occlusion'>>
const skip = (c: Lite) => !!c.drill || !!c.occlusion

/** Same concept: shares a schedule and is asked once per session. */
export function sameConcept(a: Lite, b: Lite) {
  if (a.id === b.id) return true
  if (skip(a) || skip(b)) return false
  const ka = termKey(a.term)
  return ka.length > 2 && ka === termKey(b.term) && containment(words(a.definition), words(b.definition)) >= SAME_NAME_OVERLAP
}

/** Effectively the same answer: never show both in one multiple-choice question. */
export function sameAnswer(a: Lite, b: Lite) {
  if (skip(a) || skip(b)) return false
  if (sameConcept(a, b)) return true
  const A = words(a.definition), B = words(b.definition)
  if (containment(A, B) < SAME_ANSWER) return false
  // The few words that differ must not carry the meaning: a number (120 vs 129) or several words.
  const diff = [...A].filter((w) => !B.has(w)).concat([...B].filter((w) => !A.has(w)))
  return diff.length <= 3 && !diff.some((w) => /\d/.test(w))
}

/**
 * Group same-concept cards (same name + overlapping answers). Returns card id -> group id
 * (the group id is one member's id); cards without twins are left out.
 */
export function twinGroups(cards: Lite[]): Map<string, string> {
  const byKey = new Map<string, Lite[]>()
  for (const c of cards) {
    if (skip(c)) continue
    const k = termKey(c.term)
    if (k.length > 2) (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(c)
  }
  const out = new Map<string, string>()
  for (const list of byKey.values()) {
    if (list.length < 2) continue
    // Within one name, link cards whose answers overlap (each joins the first one it matches).
    const groups: Lite[][] = []
    for (const c of list) {
      const g = groups.find((grp) => grp.some((o) => sameConcept(c, o)))
      if (g) g.push(c)
      else groups.push([c])
    }
    for (const g of groups) if (g.length > 1) for (const c of g) out.set(c.id, g[0].id)
  }
  return out
}

/** Keep the first card of each twin group, in order (for session queues). */
export function oncePerConcept<T extends { id: string }>(cards: T[], groups: Map<string, string>): T[] {
  const used = new Set<string>()
  return cards.filter((c) => {
    const g = groups.get(c.id)
    if (!g) return true
    if (used.has(g)) return false
    used.add(g)
    return true
  })
}
