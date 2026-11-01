import CardTools from '../CardTools'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Kbd, SessionBar } from '../components'
import { updateCard } from '../db'
import { loadScope, readScope, shuffle } from '../scope'
import { recordFlip } from '../srs'
import type { Card } from '../types'
import { Side } from './Review'

/** Quizlet-style flashcards: flip, then sort into "know it" / "still learning". Doesn't change the schedule. */
export default function Flashcards() {
  const [params] = useSearchParams()
  const scope = readScope(params)
  const [all, setAll] = useState<Card[] | null>(null)
  const [deck, setDeck] = useState<Card[]>([])
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [defFirst, setDefFirst] = useState(false)
  const [known, setKnown] = useState<Set<string>>(new Set())
  const [label, setLabel] = useState('')
  const started = useRef(Date.now())
  const touch = useRef<number | null>(null)

  useEffect(() => {
    loadScope(scope).then(({ cards, label }) => {
      setAll(cards)
      setDeck(cards)
      setLabel(label)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()])

  const card = deck[i]
  const go = (d: number) => {
    setFlipped(false)
    setI((x) => Math.max(0, Math.min(deck.length, x + d)))
    started.current = Date.now()
  }
  const sort = (knew: boolean) => {
    if (!card) return
    recordFlip(card, knew, Date.now() - started.current)
    setKnown((k) => {
      const n = new Set(k)
      if (knew) n.add(card.id)
      else n.delete(card.id)
      return n
    })
    go(1)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === ' ') {
        e.preventDefault()
        setFlipped((f) => !f)
      } else if (e.key === 'ArrowRight') sort(true)
      else if (e.key === 'ArrowLeft') sort(false)
      else if (e.key === 'ArrowUp' || e.key === 'Backspace') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!all) return null
  const back = scope.kind === 'set' ? `/set/${scope.id}` : scope.kind === 'course' ? `/course/${scope.id}` : '/'
  if (!all.length) return <p>No cards here. <Link to={back}>Back</Link></p>

  if (!card) {
    const left = deck.filter((c) => !known.has(c.id))
    return (
      <div className="study">
        <Link to={back} className="crumb">← {label}</Link>
        <div className="done-box">
          <h1>Round done</h1>
          <p>
            <b>{deck.length - left.length}</b> known · <b>{left.length}</b> still learning
          </p>
          <div className="actions">
            {left.length > 0 && (
              <button className="btn primary" onClick={() => { setDeck(shuffle(left)); setI(0) }}>
                Keep going with {left.length} still learning
              </button>
            )}
            <button className="btn" onClick={() => { setDeck(all); setKnown(new Set()); setI(0) }}>
              Restart all {all.length}
            </button>
            <Link className="btn" to={`/study/learn?${params}`}>Learn mode</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="study">
      <div className="study-head">
        <Link to={back} className="crumb">← {label}</Link>
        <span className="muted small">
          {i + 1} / {deck.length}
        </span>
      </div>
      <SessionBar done={i} total={deck.length} />
      <div className="chips">
        <button className="chip" onClick={() => { setDeck(shuffle(deck)); setI(0); setFlipped(false) }}>⤮ Shuffle</button>
        <button className={`chip ${defFirst ? 'on' : ''}`} onClick={() => setDefFirst(!defFirst)}>Definition first</button>
      </div>
      <div
        className={`flip ${flipped ? 'flipped' : ''}`}
        onClick={() => setFlipped(!flipped)}
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current === null) return
          const dx = e.changedTouches[0].clientX - touch.current
          touch.current = null
          if (Math.abs(dx) > 60) sort(dx > 0)
        }}
      >
        <div className="flip-inner">
          <div className="flip-face front">
            <Side card={card} side={defFirst ? 'definition' : 'term'} />
          </div>
          <div className="flip-face back">
            <Side card={card} side={defFirst ? 'term' : 'definition'} />
          </div>
        </div>
        <button
          className={`star corner ${card.starred ? 'on' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            updateCard(card.id, { starred: card.starred ? 0 : 1 })
            setDeck((d) => d.map((c) => (c.id === card.id ? { ...c, starred: c.starred ? 0 : 1 } : c)))
          }}
          aria-label="Star"
        >
          {card.starred ? '★' : '☆'}
        </button>
      </div>
      <p className="muted small center">Tap to flip · swipe right = know it, left = still learning</p>
      <CardTools key={card.id} card={card} />
      <div className="sort">
        <button className="btn sort-btn learning" onClick={() => sort(false)}>
          ✕ Still learning <Kbd>←</Kbd>
        </button>
        <button className="btn sort-btn know" onClick={() => sort(true)}>
          ✓ Know it <Kbd>→</Kbd>
        </button>
      </div>
      {i > 0 && (
        <button className="btn link small" onClick={() => go(-1)}>
          ↶ Previous card
        </button>
      )}
    </div>
  )
}
