import { shuffle } from './scope'
import type { Card } from './types'

export type QType = 'mc' | 'tf' | 'written'
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
  correctIndex?: number // mc
  shown?: string // tf: the answer side shown (may be a wrong one)
  tfTrue?: boolean
}

const side = (c: Card, s: 'term' | 'definition') => (s === 'term' ? c.term : c.definition)
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])

/**
 * Plausible wrong answers: other cards from the pool whose answer text shares words
 * or tags with the right one and has a similar length — so options aren't obviously wrong.
 */
export function distractors(card: Card, pool: Card[], s: 'term' | 'definition', n = 3): string[] {
  const right = side(card, s).trim()
  const rw = words(right)
  const seen = new Set([right.toLowerCase()])
  const scored = pool
    .filter((c) => c.id !== card.id)
    .map((c) => {
      const t = side(c, s).trim()
      let shared = 0
      for (const w of words(t)) if (rw.has(w)) shared++
      const tags = c.tags.filter((x) => card.tags.includes(x)).length
      const len = Math.abs(t.length - right.length) / Math.max(t.length, right.length, 1)
      return { t, score: shared * 2 + tags + (1 - len) * 2 + Math.random() * 1.5 }
    })
    .sort((a, b) => b.score - a.score)
  const out: string[] = []
  for (const { t } of scored) {
    if (!t || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    out.push(t)
    if (out.length === n) break
  }
  return out
}

export function makeQuestion(card: Card, pool: Card[], type: QType, answerWith: AnswerWith): Question {
  // In mixed mode, typed answers are always the (short) term — typing whole definitions isn't a fair test.
  const answerSide: 'term' | 'definition' =
    answerWith === 'both' ? (type === 'written' || Math.random() < 0.5 ? 'term' : 'definition') : answerWith
  const promptSide = answerSide === 'term' ? 'definition' : 'term'
  const q: Question = { card, type, promptSide, answerSide }
  if (type === 'mc') {
    const wrong = distractors(card, pool, answerSide)
    if (wrong.length === 0) return { ...q, type: 'written' } // tiny set: nothing to choose from
    const options = shuffle([side(card, answerSide), ...wrong])
    q.options = options
    q.correctIndex = options.indexOf(side(card, answerSide))
  } else if (type === 'tf') {
    const wrong = distractors(card, pool, answerSide, 1)
    q.tfTrue = wrong.length === 0 || Math.random() < 0.5
    q.shown = q.tfTrue ? side(card, answerSide) : wrong[0]
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
