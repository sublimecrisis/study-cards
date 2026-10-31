import { supabase } from './cloud'
import { db, updateCard } from './db'
import type { Card } from './types'

export interface ExplainRequest {
  card: Card
  /** The wrong answer the student picked or typed, if any. */
  chosen?: string
  /** If the wrong answer came from another card: that card's other side (what it actually describes). */
  chosenMeans?: string
  answerSide: 'term' | 'definition'
}

const keyOf = (chosen?: string) => (chosen ?? '').trim().toLowerCase().slice(0, 200)

export const savedExplanation = (card: Card, chosen?: string) => card.explanations?.[keyOf(chosen)]

/**
 * Ask the AI (through the `explain` server function, which holds the OpenRouter key)
 * why the answer is right / the pick was wrong. Saved on the card so it syncs and
 * never costs twice.
 */
export async function explain(req: ExplainRequest): Promise<string> {
  const fresh = (await db.cards.get(req.card.id)) ?? req.card
  const saved = savedExplanation(fresh, req.chosen)
  if (saved) return saved

  if (!navigator.onLine) throw new Error('Explanations need an internet connection.')
  if (!(await supabase.auth.getSession()).data.session) throw new Error('Sign in (Settings → Cloud sync) to use explanations.')

  const set = await db.sets.get(fresh.setId)
  const course = set ? await db.courses.get(set.courseId) : undefined
  const { data, error } = await supabase.functions.invoke('explain', {
    body: {
      course: course?.name ?? '',
      set: set?.name ?? '',
      term: fresh.term,
      definition: fresh.definition,
      notes: fresh.notes,
      answerSide: req.answerSide,
      chosen: req.chosen ?? '',
      chosenMeans: req.chosenMeans ?? '',
    },
  })
  if (error) {
    // The function's own message (e.g. "not set up yet") is in the response body when there is one.
    const ctx = (error as { context?: unknown }).context
    const detail = ctx instanceof Response ? await ctx.json().catch(() => null) : null
    throw new Error(detail?.error ?? "Couldn't reach the explanation service — try again in a moment.")
  }
  // Plain text only: drop any markdown emphasis the model slips in.
  const text = String((data as { text?: string })?.text ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|\s)\*(\S.*?)\*(?=\s|[.,;:!?]|$)/g, '$1$2')
    .trim()
  if (!text) throw new Error('No explanation came back — try again.')
  await updateCard(fresh.id, { explanations: { ...(fresh.explanations ?? {}), [keyOf(req.chosen)]: text } })
  return text
}
