import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CardTools from '../CardTools'
import { ChapterChip } from '../chapters'
import { Kbd, SessionBar } from '../components'
import HookPanel from '../HookPanel'
import { RichText } from '../rich'
import { loadScope, readScope } from '../scope'
import type { Card } from '../types'
import { Side } from './Review'

/** Browse: read through cards with the answer showing. No grading, no log, no schedule. */
export default function Browse() {
  const [params] = useSearchParams()
  const scope = readScope(params)
  const [cards, setCards] = useState<Card[] | null>(null)
  const [label, setLabel] = useState('')
  const [i, setI] = useState(0)

  useEffect(() => {
    loadScope(scope).then(({ cards, label }) => {
      setCards(cards)
      setLabel(label)
      setI(0)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()])

  const n = cards?.length ?? 0
  const go = (d: number) => setI((x) => Math.max(0, Math.min(n - 1, x + d)))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        go(1)
      } else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!cards) return null
  const back = scope.kind === 'set' ? `/set/${scope.id}` : scope.kind === 'course' ? `/course/${scope.id}` : '/'
  if (!n) return <p>No cards here. <Link to={back}>Back</Link></p>
  const card = cards[i]

  return (
    <div className="study">
      <div className="study-head">
        <Link to={back} className="crumb">← {label}</Link>
        <span className="muted small">
          {i + 1} / {n}
        </span>
      </div>
      <SessionBar done={i + 1} total={n} />
      <div className="face revealed browse-card">
        <div className="face-chapter">
          <ChapterChip setId={card.setId} />
        </div>
        <Side card={card} side="term" revealed />
        <hr />
        {card.occlusion ? <RichText text={card.definition} className="dg-answer" /> : <Side card={card} side="definition" />}
      </div>
      <CardTools key={card.id} card={card} />
      <HookPanel key={`h-${card.id}`} card={card} compact />
      <div className="sort">
        <button className="btn sort-btn" disabled={i === 0} onClick={() => go(-1)}>
          <Kbd>←</Kbd> Previous
        </button>
        <button className="btn sort-btn primary" disabled={i === n - 1} onClick={() => go(1)}>
          Next <Kbd>→</Kbd>
        </button>
      </div>
      <p className="muted small center">Browse only: nothing here is graded or added to your schedule.</p>
    </div>
  )
}
