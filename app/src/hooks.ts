import { supabase } from './cloud'
import { db, updateCard } from './db'
import type { Card, MemoryHook } from './types'

/**
 * AI memory hooks: one mnemonic / acronym / vivid image / tiny story per card, plus the
 * key word to highlight. Made on request, saved on the card (synced), so each costs one call.
 */
export async function makeHook(card: Card): Promise<MemoryHook> {
  if (!navigator.onLine) throw new Error("You're offline.")
  if (!(await supabase.auth.getSession()).data.session) throw new Error('Sign in to make memory hooks.')
  const set = await db.sets.get(card.setId)
  const course = set ? await db.courses.get(set.courseId) : undefined
  const { data, error } = await supabase.functions.invoke('explain', {
    body: { mode: 'hook', course: course?.name ?? '', term: card.term, definition: card.definition, notes: card.notes },
  })
  if (error) {
    const ctx = (error as { context?: unknown }).context
    const detail = ctx instanceof Response ? await ctx.json().catch(() => null) : null
    throw new Error(detail?.error ?? "Couldn't reach the AI service.")
  }
  const h = (data as { hook?: { text: string; kind: MemoryHook['kind']; keyword: string } })?.hook
  if (!h) throw new Error('No hook came back. Is the updated explain function deployed?')
  const hook: MemoryHook = { text: h.text, kind: h.kind, at: Date.now() }
  const fresh = (await db.cards.get(card.id)) ?? card
  // Keep a key word you set yourself; otherwise use the AI's pick.
  await updateCard(card.id, { hook, ...(fresh.keyword ? {} : { keyword: h.keyword }) })
  return hook
}

export const KIND_LABEL: Record<MemoryHook['kind'], string> = { acronym: 'Acronym', mnemonic: 'Mnemonic', image: 'Picture it', story: 'Story' }
