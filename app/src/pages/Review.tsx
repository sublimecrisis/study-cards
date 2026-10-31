import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Kbd, SessionBar } from '../components'
import { CardImage, RichText } from '../rich'
import { loadScope, readScope, scopeKey } from '../scope'
import { isDue, preview, Rating, rate } from '../srs'
import { getSettings, loadDayStats } from '../stats'
import type { Card } from '../types'
import type { Grade } from 'ts-fsrs'

const BUTTONS: { r: Grade; label: string; cls: string }[] = [
  { r: Rating.Again, label: 'Again', cls: 'again' },
  { r: Rating.Hard, label: 'Hard', cls: 'hard' },
  { r: Rating.Good, label: 'Good', cls: 'good' },
  { r: Rating.Easy, label: 'Easy', cls: 'easy' },
]

export function Side({ card, side }: { card: Card; side: 'term' | 'definition' }) {
  return (
    <div className="face-content">
      <RichText text={side === 'term' ? card.term : card.definition} />
      <CardImage id={side === 'term' ? card.termImage : card.defImage} className="face-img" />
      {side === 'definition' && card.notes && <RichText className="notes" text={card.notes} />}
    </div>
  )
}

export default function Review() {
  const [params] = useSearchParams()
  const scope = readScope(params)
  const [queue, setQueue] = useState<Card[] | null>(null)
  const [label, setLabel] = useState('')
  const [shown, setShown] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const started = useRef(Date.now())

  useEffect(() => {
    ;(async () => {
      const { cards, label } = await loadScope(scope)
      const [settings, day] = await Promise.all([getSettings(), loadDayStats()])
      const due = cards.filter((c) => isDue(c)).sort((a, b) => a.srs!.due - b.srs!.due)
      const fresh = cards.filter((c) => !c.srs || c.srs.state === 0).slice(0, Math.max(0, settings.newPerDay - day.newToday))
      // Mix new cards in among reviews rather than all at the end.
      const q: Card[] = []
      const step = fresh.length ? Math.max(1, Math.floor(due.length / fresh.length)) : 0
      let n = 0
      due.forEach((c, i) => {
        q.push(c)
        if (step && (i + 1) % step === 0 && n < fresh.length) q.push(fresh[n++])
      })
      q.push(...fresh.slice(n))
      setQueue(q)
      setTotal(q.length)
      setLabel(label)
      started.current = Date.now()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()])

  const card = queue?.[0]
  const answer = async (r: Grade) => {
    if (!card || !shown) return
    const srs = await rate(card, r, Date.now() - started.current)
    setShown(false)
    started.current = Date.now()
    setQueue((q) => {
      const rest = q!.slice(1)
      // Still in short-term learning (due within ~20 min)? See it again this session.
      if (srs.due < Date.now() + 20 * 60_000) return [...rest, { ...card, srs }]
      setDone((d) => d + 1)
      return rest
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (!shown) setShown(true)
      } else if (shown && ['1', '2', '3', '4'].includes(e.key)) answer(Number(e.key) as Grade)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!queue) return null
  const back = scope.kind === 'set' ? `/set/${scope.id}` : scope.kind === 'course' ? `/course/${scope.id}` : '/'

  if (!card)
    return (
      <div className="study">
        <Link to={back} className="crumb">← Back</Link>
        <div className="done-box">
          <div className="big">✓</div>
          <h1>{total ? 'Review done for today' : 'Nothing due right now'}</h1>
          <p className="muted">
            {total ? `${done} cards reviewed in ${label}.` : `${label}: no cards are due and no new cards are left for today.`} Come back tomorrow — the
            schedule spaces cards out so you see each one just before you'd forget it.
          </p>
          <div className="actions">
            <Link className="btn primary" to={`/quiz?${params}`}>Take a quick quiz</Link>
            <Link className="btn" to={`/study/learn?${params}`}>Learn mode</Link>
          </div>
        </div>
      </div>
    )

  const iv = shown ? preview(card) : null
  return (
    <div className="study">
      <div className="study-head">
        <Link to={back} className="crumb">← {label}</Link>
        <span className="muted small">{queue.length} left{scopeKey(scope) === 'all' ? '' : ''}</span>
      </div>
      <SessionBar done={done} total={total} />
      <div className={`face ${shown ? 'revealed' : ''}`} onClick={() => setShown(true)}>
        {card.srs ? null : <span className="badge">New</span>}
        <Side card={card} side="term" />
        {shown && (
          <>
            <hr />
            <Side card={card} side="definition" />
          </>
        )}
      </div>
      {!shown ? (
        <button className="btn primary wide" onClick={() => setShown(true)}>
          Show answer <Kbd>Space</Kbd>
        </button>
      ) : (
        <div className="rate">
          {BUTTONS.map((b, i) => (
            <button key={b.r} className={`rate-btn ${b.cls}`} onClick={() => answer(b.r)}>
              <span>{b.label}</span>
              <small>{iv![b.r]}</small>
              <Kbd>{i + 1}</Kbd>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
