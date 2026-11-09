import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SessionBar } from '../components'
import { db, newId } from '../db'
import QuestionView from '../QuestionView'
import { twinIndex } from '../twinStore'
import { oncePerConcept } from '../twins'
import { buildQuiz, type AnswerWith, type QType, type Question, type QuizConfig } from '../quizgen'
import { CardImage, RichText } from '../rich'
import { loadScope, readScope, scopeKey } from '../scope'
import { recordOutcome } from '../srs'
import type { Card, QuizResult } from '../types'
import { prepareScenarios } from '../scenario'
import { shuffle } from '../scope'
import { activeNow } from '../studyClock'
import PauseControl from '../PauseControl'
import { PastCard, StudyNav } from '../StudyNav'

const QUICK: QuizConfig = { count: 10, types: ['mc', 'tf', 'mc', 'written'], answerWith: 'both' }
// Ordering/matching come from drill cards themselves, so they aren't a choice here.
const TYPE_LABEL: Partial<Record<QType, string>> = { mc: 'Multiple choice', tf: 'True / false', written: 'Written', scenario: 'Scenario (AI)' }

const fmtTime = (ms: number) => {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function Quiz() {
  const [params] = useSearchParams()
  const scope = readScope(params)
  const [cards, setCards] = useState<Card[] | null>(null)
  const [label, setLabel] = useState('')
  const [cfg, setCfg] = useState<QuizConfig>({ count: 20, types: ['mc', 'tf', 'written'], answerWith: 'both' })
  const [timer, setTimer] = useState(true)
  const [qs, setQs] = useState<Question[] | null>(null)
  const [i, setI] = useState(0)
  const [viewing, setViewing] = useState<number | null>(null)
  const [answers, setAnswers] = useState<boolean[]>([])
  const [result, setResult] = useState<QuizResult | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const t0 = useRef(0)
  const qStart = useRef(0)
  const lastCfg = useRef<QuizConfig>(QUICK)
  const [prep, setPrep] = useState<string>('')

  useEffect(() => {
    loadScope(scope).then(({ cards, label }) => {
      setCards(cards)
      setLabel(label)
      setCfg((c) => ({ ...c, count: Math.min(c.count, cards.length) || 1 }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()])

  useEffect(() => {
    if (!qs || result) return
    const id = setInterval(() => setElapsed(activeNow() - t0.current), 1000)
    return () => clearInterval(id)
  }, [qs, result])

  const start = async (from: Card[], c: QuizConfig, retry = false) => {
    if (!retry) lastCfg.current = c // "New quiz" repeats the original settings, not the retry's size
    let pickFrom = from.filter((x) => !(c.types.length === 1 && c.types[0] === 'scenario' && x.occlusion))
    pickFrom = oncePerConcept(shuffle(pickFrom), (await twinIndex()).group) // don't ask the same concept twice
    if (c.types.includes('scenario')) {
      // Generate the AI questions this quiz needs before it starts (cached afterwards).
      pickFrom = shuffle(pickFrom).slice(0, Math.min(c.count, pickFrom.length))
      const need = pickFrom.filter((x) => !x.scenarios?.length && !x.occlusion) // question types are assigned after shuffling, so prepare all picked cards
      if (need.length) {
        setPrep(`Writing ${need.length} scenario questions…`)
        const r = await prepareScenarios(need, (d, t) => setPrep(`Writing scenario questions ${d}/${t}…`))
        setPrep(r.failed ? `${r.failed} couldn't be written (${r.error}); using regular questions for those.` : '')
        const fresh = new Map((await db.cards.bulkGet(pickFrom.map((x) => x.id))).filter(Boolean).map((x) => [x!.id, x!]))
        pickFrom = pickFrom.map((x) => fresh.get(x.id) ?? x)
      }
    }
    setQs(buildQuiz(pickFrom, cards!, { ...c, count: Math.min(c.count, pickFrom.length) }))
    setI(0)
    setViewing(null)
    setAnswers([])
    setResult(null)
    setElapsed(0)
    t0.current = qStart.current = activeNow()
  }

  const onAnswer = async (rightAnswer: boolean, guessed = false) => {
    const q = qs![i]
    recordOutcome(q.card, rightAnswer, 'quiz', activeNow() - qStart.current, guessed)
    const correct = rightAnswer && !guessed // guesses go on the "missed" list for retry
    qStart.current = activeNow()
    const a = [...answers, correct]
    setAnswers(a)
    if (i + 1 < qs!.length) return setI(i + 1)
    const r: QuizResult = {
      id: newId(),
      at: Date.now(),
      scope: scopeKey(scope),
      label,
      total: qs!.length,
      correct: a.filter(Boolean).length,
      ms: activeNow() - t0.current,
      missed: qs!.filter((_, k) => !a[k]).map((x) => x.card.id),
      dirty: 1,
    }
    await db.quizzes.add(r)
    setResult(r)
  }

  if (!cards) return null
  const back = scope.kind === 'set' ? `/set/${scope.id}` : scope.kind === 'course' ? `/course/${scope.id}` : '/'
  if (cards.length < 2) return <p>A quiz needs at least 2 cards. <Link to={back}>Back</Link></p>

  // ---- results ----
  if (result && qs) {
    const pct = Math.round((result.correct / result.total) * 100)
    const missed = qs.filter((_, k) => !answers[k])
    return (
      <div className="study">
        <Link to={back} className="crumb">← {label}</Link>
        <div className="done-box">
          <div className={`score ${pct >= 80 ? 'good' : pct >= 60 ? 'ok' : 'low'}`}>{pct}%</div>
          <h1>
            {result.correct} of {result.total} correct
          </h1>
          <p className="muted">Time {fmtTime(result.ms)} · missed cards will come up sooner in Review.</p>
          <div className="actions">
            {missed.length > 0 && (
              <button className="btn primary" onClick={() => start(missed.map((q) => q.card), { ...lastCfg.current, count: missed.length }, true)}>
                Retry {missed.length} missed
              </button>
            )}
            <button className="btn" onClick={() => start(cards, lastCfg.current)}>
              New quiz
            </button>
            <Link className="btn" to={back}>Done</Link>
          </div>
        </div>
        {missed.length > 0 && (
          <>
            <h2>Missed</h2>
            <div className="cards">
              {missed.map((q, k) => (
                <div key={k} className="card-row">
                  <div className="card-side term">
                    <RichText text={q.card.term} />
                    <CardImage id={q.card.termImage} />
                  </div>
                  <div className="card-side def">
                    <RichText text={q.card.definition} />
                    <CardImage id={q.card.defImage} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  // ---- running ----
  if (qs) {
    return (
      <div className="study">
        <div className="study-head">
          <Link to={back} className="crumb">← {label}</Link>
          <span className="muted small">
            {i + 1} / {qs.length}
            {timer && ` · ${fmtTime(elapsed)}`} <PauseControl />
          </span>
        </div>
        <SessionBar done={i} total={qs.length} />
        <StudyNav
          history={qs.slice(0, i).map((x) => x.card)}
          viewing={viewing}
          setViewing={setViewing}
          canSkip={i < qs.length - 1}
          onSkip={() => {
            setQs([...qs.slice(0, i), ...qs.slice(i + 1), qs[i]]) // ungraded: asked again at the end
            qStart.current = activeNow()
          }}
        />
        {viewing !== null && <PastCard key={qs[viewing].card.id} card={qs[viewing].card} />}
        <div style={viewing !== null ? { display: 'none' } : undefined}>
          <QuestionView key={`${i}-${qs[i].card.id}`} q={qs[i]} onAnswer={onAnswer} />
        </div>
      </div>
    )
  }

  // ---- setup ----
  const toggleType = (t: QType) =>
    setCfg((c) => {
      const has = c.types.includes(t)
      const types = has ? c.types.filter((x) => x !== t) : [...c.types, t]
      return { ...c, types: types.length ? types : c.types }
    })

  return (
    <div className="study">
      <Link to={back} className="crumb">← {label}</Link>
      <h1>Quiz</h1>
      <p className="muted">{label} · {cards.length} cards</p>
      <button className="btn primary wide" onClick={() => start(cards, { ...QUICK, count: Math.min(10, cards.length) })}>
        ⚡ Quick quiz — {Math.min(10, cards.length)} mixed questions
      </button>
      {prep && <p className="result small">{prep}</p>}
      <section className="panel">
        <h2>Custom quiz</h2>
        <div className="form-grid">
          <label>
            Questions: <b>{cfg.count}</b>
            <input type="range" min={1} max={Math.min(100, cards.length)} value={cfg.count} onChange={(e) => setCfg({ ...cfg, count: Number(e.target.value) })} />
          </label>
          <label>
            Answer with
            <select value={cfg.answerWith} onChange={(e) => setCfg({ ...cfg, answerWith: e.target.value as AnswerWith })}>
              <option value="both">Both (mixed)</option>
              <option value="term">Term</option>
              <option value="definition">Definition</option>
            </select>
          </label>
        </div>
        <div className="chips">
          {(Object.keys(TYPE_LABEL) as QType[]).map((t) => (
            <button key={t} className={`chip ${cfg.types.includes(t) ? 'on' : ''}`} onClick={() => toggleType(t)}>
              {cfg.types.includes(t) ? '✓ ' : ''}
              {TYPE_LABEL[t]}
            </button>
          ))}
          <button className={`chip ${timer ? 'on' : ''}`} onClick={() => setTimer(!timer)}>
            {timer ? '✓ ' : ''}Show timer
          </button>
        </div>
        <button className="btn primary" onClick={() => start(cards, cfg)}>
          Start {cfg.count}-question quiz
        </button>
      </section>
    </div>
  )
}
