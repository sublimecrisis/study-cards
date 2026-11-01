import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Kbd, SessionBar } from '../components'
import { db, newId } from '../db'
import QuestionView from '../QuestionView'
import { makeQuestion, type Question } from '../quizgen'
import { prepareScenarios } from '../scenario'
import { shuffle } from '../scope'
import { RichText } from '../rich'
import { loadScope, readScope, scopeKey } from '../scope'
import { recordOutcome } from '../srs'
import type { Card, CardSet } from '../types'
import WhyPanel from '../WhyPanel'

const LENGTHS = [
  { n: 120, label: 'Full exam — 120 questions, 2 hours' },
  { n: 60, label: 'Half — 60 questions, 1 hour' },
  { n: 30, label: 'Quick — 30 questions, 30 min' },
]
const PASS = 0.7

const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

/**
 * Exam simulation: multiple choice only, no feedback until you submit, timed
 * (1 minute per question, like the real NASM exam's 120 questions in 2 hours).
 * Results break down by chapter so you know where to study next.
 */
export default function PracticeExam() {
  const [params] = useSearchParams()
  const scope = readScope(params)
  const [all, setAll] = useState<Card[] | null>(null)
  const [sets, setSets] = useState<Map<string, CardSet>>(new Map())
  const [label, setLabel] = useState('')
  const [length, setLength] = useState(120)
  const [essentialsOnly, setEssentialsOnly] = useState(false)
  const [timed, setTimed] = useState(true)
  const [useScenarios, setUseScenarios] = useState(true)
  const [prep, setPrep] = useState('')
  const [qs, setQs] = useState<Question[] | null>(null)
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [flags, setFlags] = useState<Set<number>>(new Set())
  const [i, setI] = useState(0)
  const [deadline, setDeadline] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [done, setDone] = useState<{ ms: number } | null>(null)
  const [retry, setRetry] = useState<{ list: Question[]; k: number } | null>(null)
  const t0 = useRef(0)

  useEffect(() => {
    loadScope({ ...scope, filter: 'all' }).then(({ cards, sets, label }) => {
      setAll(cards.filter((c) => !c.occlusion && !c.drill)) // exam questions are text MC; diagram and order/match drills stay in Learn/Quiz
      setSets(sets)
      setLabel(label)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()])

  useEffect(() => {
    if (!qs || done) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [qs, done])

  const pool = useMemo(() => (all && essentialsOnly ? all.filter((c) => c.tags.includes('essentials')) : (all ?? [])), [all, essentialsOnly])

  const start = async () => {
    const n = Math.min(length, pool.length)
    let picked = shuffle(pool).slice(0, n)
    // About 40% exam-style scenario questions (AI-written once per card, then cached).
    const nScen = useScenarios ? Math.round(n * 0.4) : 0
    if (nScen) {
      const need = picked.slice(0, nScen).filter((c) => !c.scenarios?.length)
      if (need.length) {
        setPrep(`Writing ${need.length} scenario questions (first time only)…`)
        const r = await prepareScenarios(need, (d, t) => setPrep(`Writing scenario questions ${d}/${t} (first time only)…`))
        setPrep(r.failed ? `${r.failed} scenario questions couldn't be written (${r.error}); regular questions used instead.` : '')
        const fresh = new Map((await db.cards.bulkGet(picked.map((c) => c.id))).filter(Boolean).map((c) => [c!.id, c!]))
        picked = picked.map((c) => fresh.get(c.id) ?? c)
      }
    }
    setQs(shuffle(picked.map((c, k) => makeQuestion(c, all!, k < nScen ? 'scenario' : 'mc', 'both'))))
    setAnswers(Array(n).fill(null))
    setFlags(new Set())
    setI(0)
    setDone(null)
    t0.current = Date.now()
    setNow(t0.current)
    setDeadline(timed ? t0.current + n * 60_000 : 0)
  }

  const submit = async () => {
    if (!qs || done) return
    const ms = Date.now() - t0.current
    setDone({ ms })
    const per = Math.round(ms / qs.length)
    for (const [k, q] of qs.entries()) await recordOutcome(q.card, answers[k] === q.correctIndex, 'quiz', per)
    await db.quizzes.add({
      id: newId(),
      at: Date.now(),
      scope: scopeKey(scope),
      label: `Practice exam · ${qs.length} Q`,
      total: qs.length,
      correct: qs.filter((q, k) => answers[k] === q.correctIndex).length,
      ms,
      missed: qs.filter((q, k) => answers[k] !== q.correctIndex).map((q) => q.card.id),
      dirty: 1,
    })
  }

  // Time's up → submit automatically.
  useEffect(() => {
    if (qs && !done && deadline && now >= deadline) submit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now])

  // Keyboard: 1–4 choose, ←/→ move, F flag.
  useEffect(() => {
    if (!qs || done) return
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (n >= 1 && n <= 4) setAnswers((a) => a.map((x, k) => (k === i ? n - 1 : x)))
      else if (e.key === 'ArrowRight') setI((x) => Math.min(qs.length - 1, x + 1))
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
      else if (e.key.toLowerCase() === 'f') setFlags((f) => new Set(f.has(i) ? [...f].filter((x) => x !== i) : [...f, i]))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!all) return null
  const back = scope.kind === 'course' ? `/course/${scope.id}` : scope.kind === 'set' ? `/set/${scope.id}` : '/'

  // ---- setup ----
  if (!qs)
    return (
      <div className="study">
        <Link to={back} className="crumb">← {label}</Link>
        <h1>Practice exam</h1>
        <p className="muted">
          Multiple choice, no feedback until you submit, timed at 1 minute per question — like the NASM CPT exam (120 questions, 2 hours,
          passing ≈ 70%). Your results show which chapters to study next.
        </p>
        <section className="panel">
          <div className="form-grid">
            <label>
              Length
              <select value={length} onChange={(e) => setLength(Number(e.target.value))}>
                {LENGTHS.map((l) => (
                  <option key={l.n} value={l.n}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="chips">
            <button className={`chip ${!essentialsOnly ? 'on' : ''}`} onClick={() => setEssentialsOnly(false)}>
              All cards ({all.length})
            </button>
            {all.some((c) => c.tags.includes('essentials')) && (
              <button className={`chip ${essentialsOnly ? 'on' : ''}`} onClick={() => setEssentialsOnly(true)}>
                Essentials only ({all.filter((c) => c.tags.includes('essentials')).length})
              </button>
            )}
            <button className={`chip ${timed ? 'on' : ''}`} onClick={() => setTimed(!timed)}>
              {timed ? '✓ ' : ''}Timed
            </button>
            <button className={`chip ${useScenarios ? 'on' : ''}`} onClick={() => setUseScenarios(!useScenarios)}>
              {useScenarios ? '✓ ' : ''}Scenario questions (AI)
            </button>
          </div>
          {prep && <p className="result small">{prep}</p>}
          <button className="btn primary" onClick={start} disabled={pool.length < 4}>
            Start {Math.min(length, pool.length)}-question exam
          </button>
        </section>
      </div>
    )

  // ---- results ----
  if (done) {
    const right = qs.filter((q, k) => answers[k] === q.correctIndex).length
    const pct = right / qs.length
    const bySet = new Map<string, { r: number; n: number }>()
    qs.forEach((q, k) => {
      const e = bySet.get(q.card.setId) ?? { r: 0, n: 0 }
      e.n++
      if (answers[k] === q.correctIndex) e.r++
      bySet.set(q.card.setId, e)
    })
    const rows = [...bySet].map(([sid, e]) => ({ name: sets.get(sid)?.name ?? 'Other', ...e })).sort((a, b) => a.r / a.n - b.r / b.n)
    const missed = qs.map((q, k) => ({ q, k })).filter(({ q, k }) => answers[k] !== q.correctIndex)

    if (retry) {
      const q = retry.list[retry.k]
      return (
        <div className="study">
          <div className="study-head">
            <button className="btn link" onClick={() => setRetry(null)}>← Back to results</button>
            <span className="muted small">
              Retry {retry.k + 1} / {retry.list.length}
            </span>
          </div>
          <SessionBar done={retry.k} total={retry.list.length} />
          {q ? (
            <QuestionView key={retry.k} q={q} onAnswer={() => setRetry({ ...retry, k: retry.k + 1 })} />
          ) : (
            <div className="done-box">
              <h1>Done retrying</h1>
              <button className="btn primary" onClick={() => setRetry(null)}>Back to results</button>
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="study">
        <Link to={back} className="crumb">← {label}</Link>
        <div className="done-box">
          <div className={`score ${pct >= PASS ? 'good' : pct >= 0.6 ? 'ok' : 'low'}`}>{Math.round(pct * 100)}%</div>
          <h1>{pct >= PASS ? 'Passing score' : 'Below passing (70%)'}</h1>
          <p className="muted">
            {right} of {qs.length} correct · time {fmt(done.ms)} · {answers.filter((a) => a === null).length} unanswered
          </p>
          <div className="actions">
            {missed.length > 0 && (
              <button className="btn primary" onClick={() => setRetry({ list: missed.map(({ q }) => q), k: 0 })}>
                Retry {missed.length} missed (with feedback)
              </button>
            )}
            <button className="btn" onClick={start}>New exam</button>
          </div>
        </div>
        <section className="panel">
          <h2>By chapter (weakest first)</h2>
          <ul className="exam-sets">
            {rows.map((r) => (
              <li key={r.name}>
                <span>{r.name}</span>
                <span className="mini-bar">
                  <span style={{ width: `${(r.r / r.n) * 100}%`, background: r.r / r.n >= PASS ? 'var(--right)' : 'var(--wrong)' }} />
                </span>
                <span className="muted small">
                  {r.r}/{r.n}
                </span>
              </li>
            ))}
          </ul>
        </section>
        {missed.length > 0 && (
          <>
            <h2>Missed questions</h2>
            <div className="cards">
              {missed.map(({ q, k }) => (
                <div key={k} className="panel missed">
                  <div className="q-label">{q.scenario ? 'Scenario' : q.promptSide === 'term' ? 'Term' : 'Definition'}</div>
                  <RichText text={q.scenario ? q.scenario.question : q.promptSide === 'term' ? q.card.term : q.card.definition} />
                  <p className="small">
                    <span className="wrong-text">Your answer: {answers[k] === null ? '(none)' : q.options![answers[k]!]}</span>
                  </p>
                  {q.scenario ? (
                    <div className="why">
                      <p>
                        <b>Correct:</b> <RichText text={q.options![q.correctIndex!]} />
                      </p>
                      <p>
                        <b>Why:</b> <RichText text={q.scenario.why} />
                      </p>
                    </div>
                  ) : (
                  <WhyPanel card={q.card} answerSide={q.answerSide} chosen={answers[k] === null ? undefined : q.options![answers[k]!]} chosenCard={answers[k] === null ? undefined : q.optionCards?.[answers[k]!]} />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  // ---- running ----
  const q = qs[i]
  const answered = answers.filter((a) => a !== null).length
  const left = deadline ? deadline - now : 0
  return (
    <div className="study">
      <div className="study-head">
        <span className="muted small">
          Question {i + 1} / {qs.length} · {answered} answered
        </span>
        {deadline > 0 && <span className={`timer ${left < 5 * 60_000 ? 'low' : ''}`}>⏱ {fmt(left)}</span>}
      </div>
      <SessionBar done={answered} total={qs.length} />
      <div className="question">
        <div className="q-prompt">
          <span className="q-label">{q.scenario ? 'Scenario — choose the best answer' : `${q.promptSide === 'term' ? 'Term' : 'Definition'} — choose the matching ${q.answerSide}`}</span>
          <RichText text={q.scenario ? q.scenario.question : q.promptSide === 'term' ? q.card.term : q.card.definition} />
        </div>
        <div className="options">
          {q.options!.map((o, k) => (
            <button key={k} className={`option ${answers[i] === k ? 'picked' : ''}`} onClick={() => setAnswers((a) => a.map((x, j) => (j === i ? k : x)))}>
              <Kbd>{k + 1}</Kbd>
              <RichText text={o} />
            </button>
          ))}
        </div>
      </div>
      <div className="exam-nav">
        <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>← Prev</button>
        <button className={`btn ${flags.has(i) ? 'flagged-btn' : ''}`} onClick={() => setFlags((f) => new Set(f.has(i) ? [...f].filter((x) => x !== i) : [...f, i]))}>
          {flags.has(i) ? '⚑ Flagged' : '⚐ Flag'}
        </button>
        {i < qs.length - 1 ? (
          <button className="btn primary" onClick={() => setI(i + 1)}>Next →</button>
        ) : (
          <button className="btn primary" onClick={() => (answered < qs.length && !confirm(`${qs.length - answered} unanswered. Submit anyway?`) ? null : submit())}>
            Submit exam
          </button>
        )}
      </div>
      <details className="q-grid-wrap">
        <summary className="small">Jump to question ({flags.size} flagged)</summary>
        <div className="q-grid">
          {qs.map((_, k) => (
            <button key={k} className={`qg ${answers[k] !== null ? 'done' : ''} ${flags.has(k) ? 'flag' : ''} ${k === i ? 'cur' : ''}`} onClick={() => setI(k)}>
              {k + 1}
            </button>
          ))}
        </div>
        <button className="btn small" onClick={() => (answered < qs.length && !confirm(`${qs.length - answered} unanswered. Submit anyway?`) ? null : submit())}>
          Submit exam now
        </button>
      </details>
    </div>
  )
}
