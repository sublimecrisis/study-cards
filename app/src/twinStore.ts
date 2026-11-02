import { db } from './db'
import { twinGroups } from './twins'
import type { Srs } from './types'

/**
 * Twin groups for all courses (built per course so courses never merge), cached for the
 * session. `group` maps card id -> group id; `members` maps group id -> card ids.
 */
export interface TwinIndex {
  group: Map<string, string>
  members: Map<string, string[]>
}
let cached: Promise<TwinIndex> | null = null

export function twinIndex(): Promise<TwinIndex> {
  cached ??= (async () => {
    const sets = new Map((await db.sets.toArray()).filter((s) => !s.deleted).map((s) => [s.id, s.courseId]))
    const byCourse = new Map<string, Parameters<typeof twinGroups>[0]>()
    await db.cards.each((c) => {
      const cid = sets.get(c.setId)
      if (c.deleted || !cid) return
      ;(byCourse.get(cid) ?? byCourse.set(cid, []).get(cid)!).push(c)
    })
    const group = new Map<string, string>()
    for (const cards of byCourse.values()) for (const [id, g] of twinGroups(cards)) group.set(id, g)
    const members = new Map<string, string[]>()
    for (const [id, g] of group) (members.get(g) ?? members.set(g, []).get(g)!).push(id)
    return { group, members }
  })()
  return cached
}
/** Call after cards are added/edited in bulk so groups are rebuilt. */
export const resetTwins = () => void (cached = null)

/** Studying one card counts for its twins: give them the same schedule. */
export async function shareSchedule(cardId: string, srs: Srs) {
  const { group, members } = await twinIndex()
  const g = group.get(cardId)
  if (!g) return
  const now = Date.now()
  await db.transaction('rw', db.cards, async () => {
    for (const id of members.get(g)!) if (id !== cardId) await db.cards.update(id, { srs, updatedAt: now, dirty: 1 })
  })
}

/**
 * One-time (per launch) alignment: within each twin group, every card takes the schedule
 * of the most recently reviewed member, so a twin of a card you already know stops
 * showing up as "new". Only writes cards that actually differ.
 */
export async function alignTwins() {
  const { members } = await twinIndex()
  const updates: { id: string; srs: Srs }[] = []
  for (const ids of members.values()) {
    const cards = (await db.cards.bulkGet(ids)).filter((c) => c && !c.deleted)
    const best = cards.reduce<Srs | null>((b, c) => (c!.srs && c!.srs.state !== 0 && (c!.srs.last_review ?? 0) > (b?.last_review ?? -1) ? c!.srs : b), null)
    if (!best) continue
    for (const c of cards) if (c!.srs?.last_review !== best.last_review || c!.srs?.due !== best.due) updates.push({ id: c!.id, srs: best })
  }
  if (!updates.length) return 0
  const now = Date.now()
  await db.transaction('rw', db.cards, async () => {
    for (const u of updates) await db.cards.update(u.id, { srs: u.srs, updatedAt: now, dirty: 1 })
  })
  return updates.length
}
