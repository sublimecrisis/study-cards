import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SessionBar } from '../components'
import QuestionView from '../QuestionView'
import { makeQuestion, type Question } from '../quizgen'
import { loadScope, readScope } from '../scope'
import { recordOutcome, statusOf } from '../srs'
import type { Card } from '../types'

const ROUND = 7

interface Track {
  card: Card
  stage: number // 0 = multiple choice, 1 = written, 2 = mastered
  misses: number
  seen: boolean
}

/**
 * Quizlet-style Learn: rounds of 7. Each card goes multiple choice → typed answer;
 * a miss sends it back to the start of the line. Cards you already know well
 * (familiar/mastered) skip straight to typing.
 */
export default function Learn() {
  const [params] = useSearchParams()
  const scope = readScope(params)
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [pool, setPool] = useState<Card[]>([])
  const [label, setLabel] = useState('')
  const [mcOnly, setMcOnly] = useState(false)
  const [round, setRound] = useState<string[]>([]) // card ids in this round
  const [pos, setPos] = useState(0)
  const [q, setQ] = useState<Question | null>(null)
  const [roundScore, setRoundScore] = useState({ right: 0, total: 0, n: 0 })
  const [between, setBetween] = useState(false)
  const started = useRef(Date.now())

  useEffect(() => {
    loadScope(scope).then(({ cards, label }) => {
      setPool(cards)
      setLabel(label)
      setTracks(cards.map((card) => ({ card, stage: ['familiar', 'mastered'].includes(statusOf(card)) ? 1 : 0, misses: 0, seen: false })))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()])

  const finalStage = mcOnly ? 1 : 2
  const remaining = tracks?.filter((t) => t.stage < finalStage) ?? []

  const startRound = (ts: Track[]) => {
    // Finish cards already in progress (missed ones first) before starting new ones; new ones keep set order.
    const left = ts.filter((t) => t.stage < finalStage).sort((a, b) => Number(b.seen) - Number(a.seen) || b.misses - a.misses)
    const ids = left.slice(0, ROUND).map((t) => t.card.id)
    setRound(ids)
    setPos(0)
    setBetween(false)
    setRoundScore((s) => ({ right: 0, total: 0, n: s.n + 1 }))
    ask(ts, ids[0])
  }

  const ask = (ts: Track[], id?: string) => {
    const t = ts.find((x) => x.card.id === id)
    if (!t) return setQ(null)
    const type = t.stage === 0 || mcOnly ? 'mc' : 'written'
    setQ(makeQuestion(t.card, pool, type, type === 'mc' ? 'definition' : 'term'))
    started.current = Date.now()
  }

  useEffect(() => {
    if (tracks && round.length === 0 && remaining.length) startRound(tracks)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks])

  const onAnswer = (correct: boolean) => {
    const id = round[pos]
    const ms = Date.now() - started.current
    const next = tracks!.map((t) => {
      if (t.card.id !== id) return t
      const stage = correct ? Math.min(t.stage + 1, 2) : 0
      const nt = { ...t, stage, misses: t.misses + (correct ? 0 : 1), seen: true }
      if (stage >= finalStage) recordOutcome(t.card, nt.misses === 0, 'learn', ms)
      return nt
    })
    setTracks(next)
    setRoundScore((s) => ({ ...s, right: s.right + (correct ? 1 : 0), total: s.total + 1 }))
    if (pos + 1 < round.length) {
      setPos(pos + 1)
      ask(next, round[pos + 1])
    } else {
      setBetween(true)
      setQ(null)
    }
  }

  if (!tracks) return null
  const back = scope.kind === 'set' ? `/set/${scope.id}` : scope.kind === 'course' ? `/course/${scope.id}` : '/'
  if (!tracks.length) return <p>No cards here. <Link to={back}>Back</Link></p>
  const mastered = tracks.length - remaining.length

  const header = (
    <>
      <div className="study-head">
        <Link to={back} className="crumb">← {label}</Link>
        <span className="muted small">
          {mastered} / {tracks.length} learned
        </span>
      </div>
      <SessionBar done={mastered} total={tracks.length} />
    </>
  )

  if (!remaining.length)
    return (
      <div className="study">
        {header}
        <div className="done-box">
          <div className="big">🎉</div>
          <h1>You learned all {tracks.length} cards</h1>
          <p className="muted">They're now in your spaced-repetition schedule; Review will bring them back at the right time.</p>
          <div className="actions">
            <Link className="btn primary" to={`/quiz?${params}`}>Test yourself with a quiz</Link>
            <Link className="btn" to={back}>Done</Link>
          </div>
        </div>
      </div>
    )

  if (between)
    return (
      <div className="study">
        {header}
        <div className="done-box">
          <h1>Round {roundScore.n} done</h1>
          <p>
            <b>{roundScore.right}</b> of {roundScore.total} correct · <b>{remaining.length}</b> cards to go
          </p>
          <button className="btn primary" autoFocus onClick={() => startRound(tracks)}>
            Next round
          </button>
        </div>
      </div>
    )

  return (
    <div className="study">
      {header}
      <label className="check small">
        <input
          type="checkbox"
          checked={mcOnly}
          onChange={(e) => {
            setMcOnly(e.target.checked)
          }}
        />{' '}
        Multiple choice only (skip typing)
      </label>
      {q && <QuestionView key={`${roundScore.n}-${pos}`} q={q} onAnswer={onAnswer} />}
    </div>
  )
}
