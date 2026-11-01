export type ID = string

// Every synced record carries these. `dirty` = changed since last cloud sync
// (sync arrives once the Supabase account exists). Deletes are soft so they
// can sync too. Numbers instead of booleans because IndexedDB can't index booleans.
export interface Base {
  id: ID
  createdAt: number
  updatedAt: number
  deleted: 0 | 1
  dirty: 0 | 1
}

export interface Course extends Base {
  name: string
  color: string
  archived: 0 | 1
}

export interface CardSet extends Base {
  courseId: ID
  name: string
  description: string
}

export interface Card extends Base {
  setId: ID
  position: number
  term: string
  definition: string
  notes: string
  tags: string[]
  starred: 0 | 1
  needsCheck: 0 | 1
  termImage: ID | null
  defImage: ID | null
  /** Spaced-repetition memory state (FSRS); absent until first studied. */
  srs?: Srs | null
  /** Saved AI explanations, keyed by the wrong answer they explain ('' = general). Synced with the card. */
  explanations?: Record<string, string>
  /** "Label the diagram" card: termImage is the diagram, `box` is the part to name (the definition is its label). */
  occlusion?: Occlusion | null
}

/** A rectangle on an image, as fractions (0–1) of its width/height so it survives resizing. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Occlusion {
  group: string // all cards made from the same diagram share this
  box: Box // the part this card asks about
  others: Box[] // the diagram's other labelled parts (left visible for context)
  same?: Box[] // other parts with the SAME label: covered too, or they'd give the answer away
}

/** ts-fsrs card state with dates stored as epoch ms. */
export interface Srs {
  due: number
  stability: number
  difficulty: number
  scheduled_days: number
  reps: number
  lapses: number
  learning_steps: number
  state: 0 | 1 | 2 | 3 // New, Learning, Review, Relearning
  last_review?: number
}

export type StudyMode = 'review' | 'learn' | 'quiz' | 'flashcards'

/** One answer to one card, from any mode. Drives streaks, daily goal, time studied. */
export interface ReviewLog {
  id: ID
  cardId: ID
  setId: ID
  mode: StudyMode
  rating: 0 | 1 | 2 | 3 | 4 // 0 = not rated (flashcards), else FSRS Again..Easy
  correct: 0 | 1
  wasNew: 0 | 1
  at: number
  ms: number // time spent on this card
  dirty: 0 | 1
}

export interface QuizResult {
  id: ID
  at: number
  scope: string // e.g. "set:<id>", "course:<id>"
  label: string
  total: number
  correct: number
  ms: number
  missed: ID[] // card ids
  dirty: 0 | 1
}

export interface Meta {
  key: string
  value: unknown
  updatedAt: number
  dirty: 0 | 1
}

export interface ImageRec {
  id: ID
  blob: Blob
  createdAt: number
  dirty: 0 | 1
}

/** A card before it has an id/position (editor rows, importers). */
export interface CardDraft {
  term: string
  definition: string
  notes?: string
  tags?: string[]
  needsCheck?: 0 | 1
}
