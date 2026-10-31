import { useEffect, useState } from 'react'
import { supabase } from './cloud'
import { db } from './db'
import type { Card, CardSet, Course, Meta, QuizResult, ReviewLog } from './types'

/**
 * Two-way sync with Supabase. Every record carries `updatedAt` (edit time) and
 * `dirty` (changed since last sync). Push uploads dirty records — the server keeps
 * whichever edit is newer — then pull downloads everything the server received
 * since our last pull. Deletes are soft, so they sync like any other edit.
 */

export type Kind = 'course' | 'set' | 'card' | 'review' | 'quiz' | 'meta' | 'image'
export interface Remote {
  kind: Kind
  id: string
  updated_at: number
  deleted: boolean
  data: Record<string, unknown>
  server_ts?: string
}

const strip = <T extends { dirty?: unknown }>(r: T) => {
  const { dirty: _, ...rest } = r
  void _
  return rest
}

// ---- record <-> row mapping (pure; tested) ----
export function toRemote(kind: Kind, r: Course | CardSet | Card | ReviewLog | QuizResult | Meta | { id: string; createdAt: number }): Remote {
  switch (kind) {
    case 'course':
    case 'set':
    case 'card': {
      const x = r as Course
      return { kind, id: x.id, updated_at: x.updatedAt, deleted: !!x.deleted, data: strip(x) }
    }
    case 'review':
    case 'quiz': {
      const x = r as ReviewLog
      return { kind, id: x.id, updated_at: x.at, deleted: false, data: strip(x) }
    }
    case 'meta': {
      const x = r as Meta
      return { kind, id: x.key, updated_at: x.updatedAt, deleted: false, data: strip(x) }
    }
    case 'image': {
      const x = r as { id: string; createdAt: number }
      return { kind, id: x.id, updated_at: x.createdAt, deleted: false, data: { id: x.id, createdAt: x.createdAt } }
    }
  }
}

/** Should a remote row replace the local copy? Never overwrite a newer unsynced local edit. */
export function shouldApply(local: { updatedAt?: number; at?: number; createdAt?: number; dirty?: number } | undefined, remote: Remote) {
  if (!local) return true
  const localTime = local.updatedAt ?? local.at ?? local.createdAt ?? 0
  if (local.dirty) return remote.updated_at > localTime
  return remote.updated_at >= localTime
}

// ---- status for the UI ----
export interface SyncStatus {
  state: 'signed-out' | 'idle' | 'syncing' | 'error'
  email?: string
  lastSync?: number
  message?: string
  pushed?: number
  pulled?: number
}
let status: SyncStatus = { state: 'signed-out' }
const listeners = new Set<(s: SyncStatus) => void>()
const setStatus = (s: Partial<SyncStatus>) => {
  status = { ...status, ...s }
  listeners.forEach((l) => l(status))
}
export function useSyncStatus() {
  const [s, set] = useState(status)
  useEffect(() => {
    listeners.add(set)
    return () => void listeners.delete(set)
  }, [])
  return s
}

const cursorKey = (uid: string) => `study-cards:sync-cursor:${uid}`
const readCursor = (uid: string) => {
  try {
    return localStorage.getItem(cursorKey(uid)) ?? '1970-01-01T00:00:00Z'
  } catch {
    return '1970-01-01T00:00:00Z'
  }
}
const writeCursor = (uid: string, v: string) => {
  try {
    localStorage.setItem(cursorKey(uid), v)
  } catch {
    /* private mode: next sync just re-pulls */
  }
}
export function resetCursors() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('study-cards:sync-cursor:')) localStorage.removeItem(k)
  } catch {
    /* ignore */
  }
}

const CHUNK = 400

async function push(uid: string) {
  let n = 0
  const send = async (rows: Remote[]) => {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase.rpc('push_records', { items: rows.slice(i, i + CHUNK) })
      if (error) throw error
    }
    n += rows.length
  }

  // Images first: upload the file, then its record (so a record never points at a missing file).
  const imgs = await db.images.where('dirty').equals(1).toArray()
  for (const img of imgs) {
    const { error } = await supabase.storage.from('images').upload(`${uid}/${img.id}.jpg`, img.blob, { upsert: true, contentType: img.blob.type || 'image/jpeg' })
    if (error) throw error
  }
  if (imgs.length) {
    await send(imgs.map((i) => toRemote('image', i)))
    await db.images.where('id').anyOf(imgs.map((i) => i.id)).modify({ dirty: 0 })
  }

  // Only clear `dirty` if the record wasn't edited again while we were uploading.
  const tables = [
    ['course', db.courses],
    ['set', db.sets],
    ['card', db.cards],
    ['review', db.reviews],
    ['quiz', db.quizzes],
  ] as const
  for (const [kind, table] of tables) {
    const rows = await (table as typeof db.cards).where('dirty').equals(1).toArray()
    if (!rows.length) continue
    const sent = new Map(rows.map((r) => [r.id, (r as Card).updatedAt ?? (r as unknown as ReviewLog).at]))
    await send(rows.map((r) => toRemote(kind, r)))
    await (table as typeof db.cards)
      .where('id')
      .anyOf([...sent.keys()])
      .modify((r) => {
        if (((r as Card).updatedAt ?? (r as unknown as ReviewLog).at) === sent.get(r.id)) r.dirty = 0
      })
  }
  const metas = (await db.meta.toArray()).filter((m) => m.dirty)
  if (metas.length) {
    await send(metas.map((m) => toRemote('meta', m)))
    for (const m of metas) await db.meta.where('key').equals(m.key).modify((x) => void (x.updatedAt === m.updatedAt && (x.dirty = 0)))
  }
  return n
}

const overlapDone = new Set<string>()

async function pull(uid: string) {
  const saved = readCursor(uid)
  // Once per app launch, start a few minutes before the cursor to catch any row that was
  // committed slightly out of order (re-applying is harmless). Every other pull pages
  // strictly forward, so a big upload isn't re-downloaded on each sync.
  let page = saved
  if (!overlapDone.has(uid)) {
    page = new Date(new Date(saved).getTime() - 5 * 60_000).toISOString()
    overlapDone.add(uid)
  }
  let newest = saved
  let n = 0
  for (;;) {
    const { data, error } = await supabase
      .from('records')
      .select('kind,id,updated_at,deleted,data,server_ts')
      .gt('server_ts', page)
      .order('server_ts', { ascending: true })
      .limit(1000)
    if (error) throw error
    const rows = (data ?? []) as Remote[]
    if (!rows.length) break
    n += await apply(uid, rows)
    page = rows[rows.length - 1].server_ts!
    if (page > newest) newest = page
    if (rows.length < 1000) break
  }
  writeCursor(uid, newest)
  return n
}

async function apply(uid: string, rows: Remote[]) {
  let n = 0
  const byKind = new Map<Kind, Remote[]>()
  for (const r of rows) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r])

  const plain = [
    ['course', db.courses],
    ['set', db.sets],
    ['card', db.cards],
    ['review', db.reviews],
    ['quiz', db.quizzes],
  ] as const
  for (const [kind, table] of plain) {
    const list = byKind.get(kind)
    if (!list) continue
    const t = table as typeof db.cards
    const locals = await t.bulkGet(list.map((r) => r.id))
    const put = list.filter((r, i) => shouldApply(locals[i] as never, r)).map((r) => ({ ...r.data, dirty: 0 }) as unknown as Card)
    if (put.length) await t.bulkPut(put)
    n += put.length
  }
  for (const r of byKind.get('meta') ?? []) {
    const local = await db.meta.get(r.id)
    if (shouldApply(local, r)) {
      await db.meta.put({ ...(r.data as unknown as Meta), dirty: 0 })
      n++
    }
  }
  for (const r of byKind.get('image') ?? []) {
    if (await db.images.get(r.id)) continue
    const { data, error } = await supabase.storage.from('images').download(`${uid}/${r.id}.jpg`)
    if (error || !data) continue // file not there yet; the next sync will retry
    await db.images.put({ id: r.id, blob: data, createdAt: r.updated_at, dirty: 0 })
    n++
  }
  return n
}

let running: Promise<void> | null = null
let again = false

/** Run one push+pull. Concurrent calls coalesce into one follow-up run. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    const { data } = await supabase.auth.getSession()
    const user = data.session?.user
    if (!user) return setStatus({ state: 'signed-out', email: undefined })
    setStatus({ state: 'syncing', email: user.email, message: undefined })
    try {
      const pushed = await push(user.id)
      const pulled = await pull(user.id)
      setStatus({ state: 'idle', lastSync: Date.now(), pushed, pulled })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)
      setStatus({ state: 'error', message: navigator.onLine === false ? 'Offline — will sync when you reconnect.' : msg })
    }
  })().finally(() => {
    running = null
    if (again) {
      again = false
      void syncNow()
    }
  })
  return running
}

let timer: number | undefined
/** Called whenever something local is marked dirty: sync a few seconds later. */
function scheduleSync() {
  clearTimeout(timer)
  timer = window.setTimeout(() => void syncNow(), 4000)
}

let started = false
/** Wire up automatic syncing: on start, sign-in, local edits, coming online, returning to the app, and every 2 minutes. */
export function startSync() {
  if (started) return
  started = true
  for (const t of [db.courses, db.sets, db.cards, db.images, db.reviews, db.quizzes, db.meta] as const) {
    ;(t as typeof db.cards).hook('creating', (_k, obj) => void ((obj as { dirty?: number }).dirty && scheduleSync()))
    ;(t as typeof db.cards).hook('updating', (mods) => void ((mods as { dirty?: number }).dirty && scheduleSync()))
  }
  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      setStatus({ email: session.user.email, state: status.state === 'signed-out' ? 'idle' : status.state })
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') void syncNow()
    } else setStatus({ state: 'signed-out', email: undefined })
  })
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void syncNow())
  setInterval(() => document.visibilityState === 'visible' && void syncNow(), 120_000)
}
