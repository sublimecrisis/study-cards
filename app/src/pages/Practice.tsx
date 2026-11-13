import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SessionBar } from '../components'
import PauseControl from '../PauseControl'
import QuestionView from '../QuestionView'
import { makeQuestion } from '../quizgen'
import { RichText } from '../rich'
import { loadCoursePools, loadScope, readScope, shuffle } from '../scope'
import { recordFlip } from '../srs'
import { PastCard, StudyNav } from '../StudyNav'
import { twinIndex } from '../twinStore'
import { oncePerConcept } from '../twins'
import type { Card } from '../types'

/**
 * Practice: every card in the scope once, as multiple choice, with no spaced repetition.
 * Answers count toward streak and time studied (like Flashcards) but never touch the
 * schedule, and a miss doesn't come back unless you choose "Practice the missed ones".
 */
export default function Practice() {
  const [params] = useSearchParams()
  const scope = readScope(params)
  const [all, setAll] = useState<Card[] | null>(null)
  const [deck, setDeck] = useState<Card[]>([])
  const [label, setLabel] = useState('')
  const [poolOf, setPoolOf] = useState<((c: Card) => Card[]) | null>(null)
  const [i, setI] = useState(0)
  const [round, setRound] = useState(0) // bumps on restart so questions are rebuilt
  const [missed, setMissed] = useState<Card[]>([])
  const [right, setRight] = useState(0)
  const [viewing, setViewing] = useState<number | null>(null)
  const [mixed, setMixed] = useState(false)
  const order = useRef<Card[]>([])

  useEffect(() => {
    ;(async () => {
      const [{ cards, label }, pools, twins] = await Promise.all([loadScope(scope), loadCoursePools(), twinIndex()])
      const once = oncePerConcept(cards, twins.group)
      order.current = once
      setAll(once)
      setDeck(once)
      setLabel(label)
      setPoolOf(() => pools)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()])

  const restart = (cards: Card[]) => {
    setDeck(cards)
    setI(0)
    setRight(0)
    setMissed([])
    setViewing(null)
    setRound((n) => n + 1)
  }

  const card = deck[i]
  const q = useMemo(
    () => (card && poolOf ? makeQuestion(card, poolOf(card), 'mc', 'both') : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card?.id, i, round, poolOf],
  )

  if (!all) return null
  const back = scope.kind === 'set' ? `/set/${scope.id}` : scope.kind === 'course' ? `/course/${scope.id}` : '/'
  if (!all.length) return <p>No cards here. <Link to={back}>Back</Link></p>

  if (!card)
    return (
      <div className="study">
        <Link to={back} className="crumb">← {label}</Link>
        <div className="done-box">
          <div className="big">✓</div>
          <h1>Practice done</h1>
          <p>
            <b className="tally-right">{right} right</b> · <b className="tally-wrong">{missed.length} missed</b>
          </p>
          <p className="muted small">Practice doesn't change your review schedule.</p>
          {missed.length > 0 && (
            <ul className="bedtime-missed">
              {missed.map((c) => (
                <li key={c.id}>
                  <b><RichText text={c.term} /></b>
                  <RichText text={c.definition} mark={c.keyword} />
                </li>
              ))}
            </ul>
          )}
          <div className="actions">
            {missed.length > 0 && (
              <button className="btn primary" onClick={() => restart(missed)}>
                Practice the {missed.length} missed
              </button>
            )}
            <button className="btn" onClick={() => restart(mixed ? shuffle(all) : all)}>
              Start over ({all.length})
            </button>
          </div>
        </div>
      </div>
    )

  const answer = (correct: boolean, guessed = false, ms = 0) => {
    const ok = correct && !guessed
    void recordFlip(card, ok, ms)
    if (ok) setRight((n) => n + 1)
    else setMissed((m) => [...m, card])
    setI(i + 1)
  }

  return (
    <div className="study">
      <div className="study-head">
        <Link to={back} className="crumb">← {label}</Link>
        <span className="muted small">
          {i + 1} / {deck.length} · <span className="tally-right">✓ {right}</span> · <span className="tally-wrong">✕ {missed.length}</span> <PauseControl />
        </span>
      </div>
      <SessionBar done={i} total={deck.length} />
      <div className="chips">
        <span className="badge inline">Practice · no schedule</span>
        <button
          className={`chip ${mixed ? 'on' : ''}`}
          onClick={() => {
            setMixed(!mixed)
            restart(mixed ? all : shuffle(all))
          }}
        >
          ⤮ Shuffle
        </button>
      </div>
      <StudyNav
        history={deck.slice(0, i)}
        viewing={viewing}
        setViewing={setViewing}
        canSkip={i < deck.length - 1}
        onSkip={() => setDeck([...deck.slice(0, i), ...deck.slice(i + 1), card])}
      />
      {viewing !== null && <PastCard key={deck[viewing].id} card={deck[viewing]} />}
      <div style={viewing !== null ? { display: 'none' } : undefined}>{q && <QuestionView key={`${round}-${i}-${card.id}`} q={q} onAnswer={answer} />}</div>
    </div>
  )
}
