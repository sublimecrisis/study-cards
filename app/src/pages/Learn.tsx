import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SessionBar } from '../components'
import { db } from '../db'
import { answer, start, type Item, type LearnState } from '../learnQueue'
import QuestionView from '../QuestionView'
import { makeQuestion, type Question } from '../quizgen'
import { loadPairs, partnerMap, partnerOf } from '../confusions'
import { twinIndex } from '../twinStore'
import { oncePerConcept } from '../twins'
import { interleave, loadCoursePools, loadScope, readScope } from '../scope'
import { isDue, recordOutcome, statusOf } from '../srs'
import type { Card } from '../types'

const CHECKPOINT = 10 // answers between progress check-ins

/**
 * Learn, spaced-repetition style:
 *  - what to learn: cards that are due first (the schedule says you're about to forget
 *    them), then new cards. Cards you already know and aren't due are skipped.
 *  - within the session: each card must be recalled twice with other cards in between;
 *    misses come back quickly, correct answers come back later (see learnQueue.ts).
 *  - afterwards: every learned card goes into the review schedule.
 */
export default function Learn() {
  const [params] = useSearchParams()
  const scope = readScope(params)
  const [all, setAll] = useState<Card[] | null>(null)
  const [label, setLabel] = useState('')
  const [includeAll, setIncludeAll] = useState(false)
  const [mcOnly, setMcOnly] = useState(false)
  const [st, setSt] = useState<LearnState | null>(null)
  const [q, setQ] = useState<Question | null>(null)
  const [n, setN] = useState(0) // answers this session
  const [right, setRight] = useState(0)
  const [pause, setPause] = useState(false)
  const [summary, setSummary] = useState<{ when: string; count: number }[] | null>(null)
  const started = useRef(Date.now())
  const partners = useRef<Map<string, string[]>>(new Map())
  const poolOf = useRef<((c: Card) => Card[]) | null>(null)
  const [twins, setTwins] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    loadPairs().then((p) => (partners.current = partnerMap(p)))
    loadCoursePools().then((f) => (poolOf.current = f))
    twinIndex().then((t) => setTwins(t.group))
    loadScope(scope).then(({ cards, label }) => {
      setAll(cards)
      setLabel(label)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()])

  // Due cards first (most overdue first), then new ones; already-known, not-due cards only on request.
  const plan = useMemo(() => {
    if (!all) return null
    const due = all.filter((c) => statusOf(c) !== 'new' && isDue(c)).sort((a, b) => a.srs!.due - b.srs!.due)
    const fresh = interleave(all.filter((c) => statusOf(c) === 'new')) // mix chapters
    const rest = all.filter((c) => statusOf(c) !== 'new' && !isDue(c))
    // Twins (same concept in several chapters) share a schedule: learn each concept once.
    return { due, fresh, rest, items: oncePerConcept([...due, ...fresh, ...(includeAll ? rest : [])], twins) }
  }, [all, includeAll, twins])

  const ask = (s: LearnState) => {
    const cur = s.queue[0]
    if (!cur) return setQ(null)
    const typed = cur.stage === 1 && !mcOnly
    const pool = poolOf.current?.(cur.card) ?? all!
    setQ(makeQuestion(cur.card, pool, typed ? 'written' : 'mc', typed ? 'term' : 'definition', { partner: partnerOf(cur.card, partners.current, pool) }))
    started.current = Date.now()
  }

  const begin = () => {
    // Cards you've seen before start one step in: they only need the spaced (typed) recall.
    const items: Item[] = plan!.items.map((card) => ({ card, stage: statusOf(card) === 'new' ? 0 : 1, misses: 0 }))
    const s = start(items)
    setSt(s)
    setN(0)
    setRight(0)
    setSummary(null)
    ask(s)
  }

  const onAnswer = (rightAnswer: boolean, guessed = false) => {
    const correct = rightAnswer && !guessed // a guess counts as a miss: the card comes back
    const ms = Date.now() - started.current
    const { state, learned } = answer(st!, correct)
    if (learned) recordOutcome(learned.card, learned.misses === 0, 'learn', ms)
    setSt(state)
    const nn = n + 1
    setN(nn)
    setRight((r) => r + (correct ? 1 : 0))
    if (!state.queue.length) return finish(state)
    if (nn % CHECKPOINT === 0) {
      setPause(true)
      setQ(null)
    } else ask(state)
  }

  const finish = async (s: LearnState) => {
    setQ(null)
    // When will these come back? Read the freshly scheduled due dates.
    await new Promise((r) => setTimeout(r, 300))
    const fresh = await db.cards.bulkGet(s.learned.map((i) => i.card.id))
    const day = 86_400_000
    const buckets = new Map<string, number>()
    for (const c of fresh) {
      if (!c?.srs) continue
      const d = Math.max(0, Math.round((c.srs.due - Date.now()) / day))
      const when = d === 0 ? 'Later today' : d === 1 ? 'Tomorrow' : `In ${d} days`
      buckets.set(when, (buckets.get(when) ?? 0) + 1)
    }
    setSummary([...buckets].map(([when, count]) => ({ when, count })))
  }

  if (!all || !plan) return null
  const back = scope.kind === 'set' ? `/set/${scope.id}` : scope.kind === 'course' ? `/course/${scope.id}` : '/'
  if (!all.length) return <p>No cards here. <Link to={back}>Back</Link></p>

  const total = st ? st.learned.length + st.queue.length + st.pool.length : plan.items.length
  const header = (
    <>
      <div className="study-head">
        <Link to={back} className="crumb">← {label}</Link>
        {st && (
          <span className="muted small">
            {st.learned.length} / {total} learned
          </span>
        )}
      </div>
      {st && <SessionBar done={st.learned.length} total={total} />}
    </>
  )

  // ---- start screen ----
  if (!st)
    return (
      <div className="study">
        {header}
        <div className="done-box">
          <h1>Learn</h1>
          <p className="muted">
            Each card needs two correct answers, spaced apart, to count as learned. Misses come right back; learned cards join
            your review schedule so they return just before you'd forget them.
          </p>
          <p>
            <b>{plan.due.length}</b> due for review · <b>{plan.fresh.length}</b> new
            {plan.rest.length ? <> · {plan.rest.length} already known (not due)</> : null}
          </p>
          {plan.rest.length > 0 && (
            <label className="check small">
              <input type="checkbox" checked={includeAll} onChange={(e) => setIncludeAll(e.target.checked)} /> Also practice cards that
              aren't due yet
            </label>
          )}
          <label className="check small">
            <input type="checkbox" checked={mcOnly} onChange={(e) => setMcOnly(e.target.checked)} /> Multiple choice only (skip typing)
          </label>
          <button className="btn primary" onClick={begin} disabled={!plan.items.length} autoFocus>
            {plan.items.length ? `Start — ${plan.items.length} cards` : 'Nothing due or new here'}
          </button>
          {!plan.items.length && <p className="muted small">Everything here is learned and not due yet. Tick the box above to practice anyway, or take a quiz.</p>}
        </div>
      </div>
    )

  // ---- finished ----
  if (!st.queue.length)
    return (
      <div className="study">
        {header}
        <div className="done-box">
          <div className="big">🎉</div>
          <h1>You learned {st.learned.length} cards</h1>
          <p className="muted">
            {right} of {n} answers correct. They're now in your spaced-repetition schedule:
          </p>
          {summary && (
            <ul className="plan">
              {summary.map((b) => (
                <li key={b.when}>
                  <b>{b.when}:</b> {b.count} {b.count === 1 ? 'card' : 'cards'}
                </li>
              ))}
            </ul>
          )}
          <div className="actions">
            <Link className="btn primary" to={`/quiz?${params}`}>Test yourself with a quiz</Link>
            <Link className="btn" to={back}>Done</Link>
          </div>
        </div>
      </div>
    )

  // ---- checkpoint ----
  if (pause)
    return (
      <div className="study">
        {header}
        <div className="done-box">
          <h1>Check-in</h1>
          <p>
            <b>{right}</b> of {n} correct so far · <b>{st.learned.length}</b> learned · <b>{st.queue.length + st.pool.length}</b> to go
          </p>
          <div className="actions">
            <button className="btn primary" autoFocus onClick={() => (setPause(false), ask(st))}>
              Keep going
            </button>
            <button className="btn" onClick={() => finish({ ...st, queue: [] }).then(() => setSt({ ...st, queue: [], pool: [] }))}>
              Stop here
            </button>
          </div>
        </div>
      </div>
    )

  return (
    <div className="study">
      {header}
      {q && (
        <>
          <span className="muted small">{st.queue[0].stage === 0 ? 'First recall' : 'Spaced recall — one more to learn it'}</span>
          <QuestionView key={n} q={q} onAnswer={onAnswer} />
        </>
      )}
    </div>
  )
}
