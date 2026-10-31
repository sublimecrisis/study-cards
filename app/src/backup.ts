import { db } from './db'
import type { Card, CardSet, Course, Meta, QuizResult, ReviewLog } from './types'

interface BackupFile {
  app: 'study-cards'
  version: 1 | 2
  exportedAt: string
  courses: Course[]
  sets: CardSet[]
  cards: Card[]
  images: { id: string; createdAt: number; dataUrl: string }[]
  // v2: study history
  reviews?: ReviewLog[]
  quizzes?: QuizResult[]
  meta?: Meta[]
}

const toDataUrl = (b: Blob) =>
  new Promise<string>((ok, fail) => {
    const r = new FileReader()
    r.onload = () => ok(r.result as string)
    r.onerror = () => fail(r.error)
    r.readAsDataURL(b)
  })

/** Everything (incl. deleted records, images and study history) as one JSON file. */
export async function exportBackup(): Promise<string> {
  const images = await db.images.toArray()
  const file: BackupFile = {
    app: 'study-cards',
    version: 2,
    exportedAt: new Date().toISOString(),
    courses: await db.courses.toArray(),
    sets: await db.sets.toArray(),
    cards: await db.cards.toArray(),
    images: await Promise.all(images.map(async (i) => ({ id: i.id, createdAt: i.createdAt, dataUrl: await toDataUrl(i.blob) }))),
    reviews: await db.reviews.toArray(),
    quizzes: await db.quizzes.toArray(),
    meta: await db.meta.toArray(),
  }
  return JSON.stringify(file)
}

/** Merge a backup in: records are matched by id and the newer `updatedAt` wins, so nothing newer is overwritten. */
export async function restoreBackup(json: string) {
  const f = JSON.parse(json) as BackupFile
  if (f.app !== 'study-cards' || (f.version !== 1 && f.version !== 2)) throw new Error('This is not a Study Cards backup file.')
  let changed = 0
  await db.transaction('rw', [db.courses, db.sets, db.cards, db.images, db.reviews, db.quizzes, db.meta], async () => {
    const newer = <T extends { updatedAt: number }>(have: (T | undefined)[], items: T[]) =>
      items.filter((it, k) => !have[k] || have[k]!.updatedAt < it.updatedAt)
    const courses = newer(await db.courses.bulkGet(f.courses.map((i) => i.id)), f.courses)
    const sets = newer(await db.sets.bulkGet(f.sets.map((i) => i.id)), f.sets)
    const cards = newer(await db.cards.bulkGet(f.cards.map((i) => i.id)), f.cards)
    const meta = newer(await db.meta.bulkGet((f.meta ?? []).map((m) => m.key)), f.meta ?? [])
    await db.courses.bulkPut(courses)
    await db.sets.bulkPut(sets)
    await db.cards.bulkPut(cards)
    await db.meta.bulkPut(meta)
    // History records never change once written: add the ones we don't have.
    const haveR = new Set(await db.reviews.toCollection().primaryKeys())
    const haveQ = new Set(await db.quizzes.toCollection().primaryKeys())
    const reviews = (f.reviews ?? []).filter((r) => !haveR.has(r.id))
    const quizzes = (f.quizzes ?? []).filter((q) => !haveQ.has(q.id))
    await db.reviews.bulkAdd(reviews)
    await db.quizzes.bulkAdd(quizzes)
    changed = courses.length + sets.length + cards.length + meta.length + reviews.length + quizzes.length
    const have = new Set(await db.images.toCollection().primaryKeys())
    for (const i of f.images) {
      if (have.has(i.id)) continue
      const blob = await (await fetch(i.dataUrl)).blob()
      await db.images.add({ id: i.id, blob, createdAt: i.createdAt, dirty: 1 })
    }
  })
  return changed
}
