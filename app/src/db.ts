import Dexie, { type EntityTable } from 'dexie'
import type { Card, CardDraft, CardSet, Course, ID, ImageRec, Meta, QuizResult, ReviewLog } from './types'

export class StudyDB extends Dexie {
  courses!: EntityTable<Course, 'id'>
  sets!: EntityTable<CardSet, 'id'>
  cards!: EntityTable<Card, 'id'>
  images!: EntityTable<ImageRec, 'id'>
  reviews!: EntityTable<ReviewLog, 'id'>
  quizzes!: EntityTable<QuizResult, 'id'>
  meta!: EntityTable<Meta, 'key'>

  constructor(name = 'study-cards') {
    super(name)
    this.version(1).stores({
      courses: 'id, updatedAt, dirty',
      sets: 'id, courseId, updatedAt, dirty',
      cards: 'id, setId, [setId+position], updatedAt, dirty, *tags',
      images: 'id, dirty',
    })
    this.version(2).stores({
      reviews: 'id, cardId, setId, at, dirty',
      quizzes: 'id, scope, at, dirty',
      meta: 'key',
    })
  }
}

export const db = new StudyDB()

export const newId = (): ID => crypto.randomUUID()

const COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#7c3aed', '#475569']

function fresh() {
  const now = Date.now()
  return { id: newId(), createdAt: now, updatedAt: now, deleted: 0 as const, dirty: 1 as const }
}

/** Patch + bump updatedAt + mark for sync. */
function touch<T extends object>(patch: T) {
  return { ...patch, updatedAt: Date.now(), dirty: 1 as const }
}

// ---- courses ----
export async function addCourse(name: string): Promise<ID> {
  const count = await db.courses.count()
  const c: Course = { ...fresh(), name: name.trim(), color: COLORS[count % COLORS.length], archived: 0 }
  await db.courses.add(c)
  return c.id
}

export const updateCourse = (id: ID, patch: Partial<Pick<Course, 'name' | 'color' | 'archived'>>) =>
  db.courses.update(id, touch(patch))

export async function deleteCourse(id: ID) {
  await db.transaction('rw', db.courses, db.sets, db.cards, async () => {
    const sets = await db.sets.where('courseId').equals(id).toArray()
    for (const s of sets) await softDeleteSetCards(s.id)
    await db.sets.where('courseId').equals(id).modify(touch({ deleted: 1 as const }))
    await db.courses.update(id, touch({ deleted: 1 as const }))
  })
}

// ---- sets ----
export async function addSet(courseId: ID, name: string, description = ''): Promise<ID> {
  const s: CardSet = { ...fresh(), courseId, name: name.trim(), description }
  await db.sets.add(s)
  return s.id
}

export const updateSet = (id: ID, patch: Partial<Pick<CardSet, 'name' | 'description' | 'courseId'>>) =>
  db.sets.update(id, touch(patch))

async function softDeleteSetCards(setId: ID) {
  await db.cards.where('setId').equals(setId).modify(touch({ deleted: 1 as const }))
}

export async function deleteSet(id: ID) {
  await db.transaction('rw', db.sets, db.cards, async () => {
    await softDeleteSetCards(id)
    await db.sets.update(id, touch({ deleted: 1 as const }))
  })
}

// ---- cards ----
export async function addCards(setId: ID, drafts: CardDraft[]): Promise<ID[]> {
  const last = await db.cards.where('[setId+position]').between([setId, Dexie.minKey], [setId, Dexie.maxKey]).last()
  let pos = last ? last.position + 1 : 0
  const cards: Card[] = drafts.map((d) => ({
    ...fresh(),
    setId,
    position: pos++,
    term: d.term,
    definition: d.definition,
    notes: d.notes ?? '',
    tags: d.tags ?? [],
    starred: 0,
    needsCheck: d.needsCheck ?? 0,
    termImage: null,
    defImage: null,
  }))
  await db.cards.bulkAdd(cards)
  return cards.map((c) => c.id)
}

export const updateCard = (
  id: ID,
  patch: Partial<Pick<Card, 'term' | 'definition' | 'notes' | 'tags' | 'starred' | 'needsCheck' | 'termImage' | 'defImage'>>,
) => db.cards.update(id, touch(patch))

export const deleteCard = (id: ID) => db.cards.update(id, touch({ deleted: 1 as const }))

// ---- images ----
export async function addImage(blob: Blob): Promise<ID> {
  const rec: ImageRec = { id: newId(), blob, createdAt: Date.now(), dirty: 1 }
  await db.images.add(rec)
  return rec.id
}

// ---- reads ----
export const liveCourses = () => db.courses.filter((c) => !c.deleted).sortBy('createdAt')
export const liveSets = (courseId: ID) =>
  db.sets.where('courseId').equals(courseId).filter((s) => !s.deleted).sortBy('createdAt')
export const liveCards = (setId: ID) =>
  db.cards.where('[setId+position]').between([setId, Dexie.minKey], [setId, Dexie.maxKey]).filter((c) => !c.deleted).toArray()
