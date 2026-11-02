import { db } from './db'
import { endOfToday, isDue, startOfDay, statusOf, type Status } from './srs'
import type { Card, ReviewLog } from './types'

// ---- settings (synced via the meta table) ----
export interface Settings {
  dailyGoal: number // cards studied per day
  newPerDay: number // new cards Review mode introduces per day
  examBoost: boolean // Review pulls forward cards that would fade before an exam
  reviewStyle: 'flip' | 'mc' // Review: flip + rate yourself, or multiple choice graded by the app
}
export const DEFAULT_SETTINGS: Settings = { dailyGoal: 20, newPerDay: 20, examBoost: true, reviewStyle: 'mc' }

export async function getSettings(): Promise<Settings> {
  const m = await db.meta.get('settings')
  return { ...DEFAULT_SETTINGS, ...((m?.value as Partial<Settings>) ?? {}) }
}
export async function saveSettings(patch: Partial<Settings>) {
  await db.meta.put({ key: 'settings', value: { ...(await getSettings()), ...patch }, updatedAt: Date.now(), dirty: 1 })
}

// ---- progress ----
export type Breakdown = Record<Status, number> & { total: number; due: number }

export function breakdown(cards: Card[], now = Date.now()): Breakdown {
  const b: Breakdown = { new: 0, learning: 0, familiar: 0, mastered: 0, total: cards.length, due: 0 }
  for (const c of cards) {
    b[statusOf(c)]++
    if (isDue(c, now)) b.due++
  }
  return b
}

/** ~8 s per review card, ~20 s per new card (first sight takes longer). */
export const estMinutes = (due: number, fresh: number) => Math.max(1, Math.round((due * 8 + fresh * 20) / 60))

// ---- streak & daily goal (pure, from review logs) ----
export function dayStats(logs: Pick<ReviewLog, 'at' | 'cardId' | 'ms' | 'wasNew'>[], now = Date.now()) {
  const today = startOfDay(now)
  const byDay = new Map<number, Set<string>>()
  let msToday = 0
  let newToday = 0
  for (const l of logs) {
    const d = startOfDay(l.at)
    if (!byDay.has(d)) byDay.set(d, new Set())
    byDay.get(d)!.add(l.cardId)
    if (d === today) {
      msToday += l.ms
      if (l.wasNew) newToday++
    }
  }
  // Streak counts back from today (or yesterday, if today isn't started yet).
  let streak = 0
  let day = byDay.has(today) ? today : startOfDay(today - 1)
  while (byDay.has(day)) {
    streak++
    day = startOfDay(day - 1) // via local midnight, safe across DST
  }
  return { studiedToday: byDay.get(today)?.size ?? 0, streak, minutesToday: Math.round(msToday / 60000), newToday }
}

export async function loadDayStats() {
  const since = startOfDay(Date.now() - 400 * 86_400_000)
  return dayStats(await db.reviews.where('at').above(since).toArray())
}

export { endOfToday }
