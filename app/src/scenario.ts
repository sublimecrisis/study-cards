import { supabase } from './cloud'
import { db, updateCard } from './db'
import type { Card, Scenario } from './types'

/**
 * Exam-style scenario questions: the AI writes an application question from a card
 * ("A client's knees cave in during the overhead squat…"). Saved on the card (and
 * synced), so each card costs at most one AI call.
 */
async function generate(card: Card): Promise<Scenario> {
  const set = await db.sets.get(card.setId)
  const course = set ? await db.courses.get(set.courseId) : undefined
  const siblings = (await db.cards.where('setId').equals(card.setId).toArray()).filter((c) => !c.deleted && c.id !== card.id && !c.occlusion)
  const related = siblings.sort(() => Math.random() - 0.5).slice(0, 10).map((c) => c.term)
  const { data, error } = await supabase.functions.invoke('explain', {
    body: { mode: 'scenario', course: course?.name ?? '', term: card.term, definition: card.definition, notes: card.notes, related },
  })
  if (error) {
    const ctx = (error as { context?: unknown }).context
    const detail = ctx instanceof Response ? await ctx.json().catch(() => null) : null
    throw new Error(detail?.error ?? "Couldn't reach the question service.")
  }
  const s = (data as { scenario?: Scenario })?.scenario
  if (!s) throw new Error('No question came back. Is the updated explain function deployed?')
  return s
}

export async function ensureScenario(card: Card): Promise<Scenario> {
  const fresh = (await db.cards.get(card.id)) ?? card
  if (fresh.scenarios?.length) return fresh.scenarios[0]
  const s = await generate(fresh)
  await updateCard(fresh.id, { scenarios: [...(fresh.scenarios ?? []), s] })
  return s
}

/** Make sure every card in `cards` has a scenario; returns how many are ready. Runs a few at a time. */
export async function prepareScenarios(cards: Card[], onProgress?: (done: number, total: number) => void): Promise<{ ready: number; failed: number; error?: string }> {
  if (!navigator.onLine) return { ready: 0, failed: cards.length, error: 'Offline' }
  if (!(await supabase.auth.getSession()).data.session) return { ready: 0, failed: cards.length, error: 'Sign in to use AI questions' }
  let done = 0, failed = 0, lastError: string | undefined
  const queue = [...cards]
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try {
        await ensureScenario(c)
      } catch (e) {
        failed++
        lastError = e instanceof Error ? e.message : String(e)
      }
      onProgress?.(++done, cards.length)
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return { ready: done - failed, failed, error: lastError }
}
