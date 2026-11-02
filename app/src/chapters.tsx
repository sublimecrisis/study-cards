import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { CardSet } from './types'

/**
 * Chapter colors: a course's sets in chapter order are split into up to 8 bands of
 * neighboring chapters, each with a fixed color from a color-blind-checked palette
 * (--ch-1 … --ch-8 in index.css). The short chapter label always shows next to the
 * color, so color is never the only cue.
 */
export const BANDS = 8

export function chapterSlots(sets: CardSet[]): Map<string, number> {
  const out = new Map<string, number>()
  const byCourse = new Map<string, CardSet[]>()
  for (const s of sets) if (!s.deleted) (byCourse.get(s.courseId) ?? byCourse.set(s.courseId, []).get(s.courseId)!).push(s)
  for (const list of byCourse.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    list.forEach((s, i) => out.set(s.id, list.length <= BANDS ? i + 1 : Math.floor((i * BANDS) / list.length) + 1))
  }
  return out
}

/** "Ch 5: The Nervous, Skeletal…" → "Ch 5"; names without a colon are shortened. */
export const shortName = (name: string) => (name.includes(':') ? name.slice(0, name.indexOf(':')) : name.length > 18 ? name.slice(0, 17) + '…' : name)

export function useChapter(setId: string) {
  const info = useLiveQuery(async () => {
    const sets = await db.sets.toArray()
    const set = sets.find((s) => s.id === setId)
    return set ? { slot: chapterSlots(sets).get(setId) ?? 1, name: set.name } : null
  }, [setId])
  return info ?? null
}

/** Small colored chapter label for study screens. */
export function ChapterChip({ setId }: { setId: string }) {
  const ch = useChapter(setId)
  if (!ch) return null
  return (
    <span className="ch-chip" style={{ borderColor: `var(--ch-${ch.slot})` }} title={ch.name}>
      <span className="ch-dot" style={{ background: `var(--ch-${ch.slot})` }} />
      {shortName(ch.name)}
    </span>
  )
}
