import { shuffle } from './scope'
import type { Card, Scenario } from './types'

export type QType = 'mc' | 'tf' | 'written' | 'scenario' | 'order' | 'match'
export type AnswerWith = 'term' | 'definition' | 'both'

export interface QuizConfig {
  count: number
  types: QType[]
  answerWith: AnswerWith
}

export interface Question {
  card: Card
  type: QType
  /** What's shown as the question; `answerSide` is what the student answers with. */
  promptSide: 'term' | 'definition'
  answerSide: 'term' | 'definition'
  options?: string[] // mc
  optionCards?: (Card | undefined)[] // mc: the card each option came from (explains a wrong pick); undefined = "None of these"
  correctIndex?: number // mc
  shown?: string // tf: the answer side shown (may be a wrong one)
  shownCard?: Card // tf: the card `shown` came from
  tfTrue?: boolean
  scenario?: Scenario // scenario: the AI-written question (options/correctIndex hold its shuffled choices)
  shuffled?: string[] // order: items in the order shown; match: right-hand choices in the order shown
  hard?: boolean // mc: closest distractors + a "None of these" option
}

export const NONE_OF_THESE = 'None of these'
const NONE_CHANCE = 0.25 // hard mode: how often the real answer is left out

const side = (c: Card, s: 'term' | 'definition') => (s === 'term' ? c.term : c.definition)
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])

/**
 * Plausible wrong answers: other cards from the pool whose answer text shares words
 * or tags with the right one and has a similar length — so options aren't obviously wrong.
 */
export function distractors(card: Card, pool: Card[], s: 'term' | 'definition', n = 3): string[] {
  return distractorCards(card, pool, s, n).map((c) => side(c, s).trim())
}

export function distractorCards(card: Card, pool: Card[], s: 'term' | 'definition', n = 3, noise = 1.5): Card[] {
  const right = side(card, s).trim()
  const rw = words(right)
  const seen = new Set([right.toLowerCase()])
  const scored = pool
    .filter((c) => c.id !== card.id && !c.drill && !c.occlusion)
    .map((c) => {
      const t = side(c, s).trim()
      let shared = 0
      for (const w of words(t)) if (rw.has(w)) shared++
      const tags = c.tags.filter((x) => card.tags.includes(x)).length + (card.occlusion && c.occlusion?.group === card.occlusion.group ? 6 : 0)
      const len = Math.abs(t.length - right.length) / Math.max(t.length, right.length, 1)
      return { c, t, score: shared * 2 + tags + (1 - len) * 2 + Math.random() * noise }
    })
    .sort((a, b) => b.score - a.score)
  const out: Card[] = []
  for (const { c, t } of scored) {
    if (!t || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    out.push(c)
    if (out.length === n) break
  }
  return out
}

/**
 * `hard` (multiple choice only): the closest wrong answers (same chapter, shared words,
 * similar length) plus "None of these", which is the right answer about 1 time in 4,
 * so you can't get it by recognizing or eliminating.
 */
export function makeQuestion(card: Card, pool: Card[], type: QType, answerWith: AnswerWith, opts: { hard?: boolean; partner?: Card } = {}): Question {
  // Drill cards are always asked their own way.
  if (card.drill?.kind === 'order') {
    const items = card.drill.items
    let shuffled = shuffle(items)
    if (shuffled.every((x, i) => x === items[i]) && shuffled.length > 1) shuffled = [...shuffled.slice(1), shuffled[0]] // never start already solved
    return { card, type: 'order', promptSide: 'term', answerSide: 'definition', shuffled }
  }
  if (card.drill?.kind === 'match') return { card, type: 'match', promptSide: 'term', answerSide: 'definition', shuffled: shuffle(card.drill.pairs.map((p) => p[1])) }
  // In mixed mode, typed answers are always the (short) term — typing whole definitions isn't a fair test.
  const answerSide: 'term' | 'definition' = card.occlusion
    ? 'definition' // a diagram card always asks "name the covered part"
    : answerWith === 'both'
      ? type === 'written' || Math.random() < 0.5
        ? 'term'
        : 'definition'
      : answerWith
  const promptSide = answerSide === 'term' ? 'definition' : 'term'
  const q: Question = { card, type, promptSide, answerSide }
  if (type === 'scenario') {
    const sc = card.scenarios?.[Math.floor(Math.random() * (card.scenarios?.length ?? 0))]
    if (!sc) return makeQuestion(card, pool, 'mc', answerWith, opts) // not generated yet: fall back to a normal question
    const order = shuffle([0, 1, 2, 3])
    return { ...q, scenario: sc, options: order.map((k) => sc.options[k]), correctIndex: order.indexOf(sc.correct) }
  }
  // A card you've mixed up with another always gets that partner as one of the options.
  const withPartner = (wrong: Card[], n: number) => {
    const p = opts.partner
    if (!p || p.id === card.id || side(p, answerSide).trim() === side(card, answerSide).trim()) return wrong.slice(0, n)
    return [p, ...wrong.filter((c) => c.id !== p.id && side(c, answerSide).trim() !== side(p, answerSide).trim())].slice(0, n)
  }
  if (type === 'mc' && opts.hard) {
    const wrong = withPartner(distractorCards(card, pool, answerSide, 4, 0.3), 4)
    if (wrong.length >= 3) {
      const none = Math.random() < NONE_CHANCE
      const cards = shuffle(none ? wrong.slice(0, 4) : [card, ...wrong.slice(0, 3)]) // partner (if any) is first in `wrong`, so it's always kept
      q.hard = true
      q.optionCards = [...cards, undefined]
      q.options = [...cards.map((c) => side(c, answerSide).trim()), NONE_OF_THESE]
      q.correctIndex = none ? cards.length : cards.indexOf(card)
      return q
    }
  }
  if (type === 'mc') {
    const wrong = withPartner(distractorCards(card, pool, answerSide), 3)
    if (wrong.length === 0) return { ...q, type: 'written' } // tiny set: nothing to choose from
    const cards = shuffle([card, ...wrong])
    q.optionCards = cards
    q.options = cards.map((c) => side(c, answerSide).trim())
    q.correctIndex = cards.indexOf(card)
  } else if (type === 'tf') {
    const wrong = distractorCards(card, pool, answerSide, 1)
    q.tfTrue = wrong.length === 0 || Math.random() < 0.5
    q.shownCard = q.tfTrue ? card : wrong[0]
    q.shown = side(q.shownCard, answerSide).trim()
  }
  return q
}

export function buildQuiz(cards: Card[], pool: Card[], cfg: QuizConfig): Question[] {
  const picked = shuffle(cards).slice(0, cfg.count)
  return picked.map((c, i) => makeQuestion(c, pool, cfg.types[i % cfg.types.length], cfg.answerWith))
}

// ---- written-answer grading ----
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // "(RMR)" style asides are optional
    .replace(/[^a-z0-9%]+/g, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}

/**
 * Forgiving match: ignores case, punctuation, articles and parenthetical asides,
 * allows small typos (~15%), and accepts either half of "A / B" or "A (B)" answers.
 */
export function gradeWritten(typed: string, answer: string): boolean {
  const t = normalize(typed)
  if (!t) return false
  const candidates = new Set([answer, ...answer.split(/\s*[/;]\s*|\s+or\s+/i), answer.replace(/\(([^)]*)\)/g, '').trim(), ...[...answer.matchAll(/\(([^)]*)\)/g)].map((m) => m[1])])
  for (const c of candidates) {
    const a = normalize(c)
    if (!a) continue
    if (a === t) return true
    if (levenshtein(a, t) <= Math.max(1, Math.floor(a.length * 0.15))) return true
  }
  return false
}
