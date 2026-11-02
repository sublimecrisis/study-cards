import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { db, updateCard } from '../db'
import { KIND_LABEL, makeHook } from '../hooks'
import { RichText } from '../rich'
import { shuffle } from '../scope'
import { recordOutcome } from '../srs'
import type { Card, CardSet } from '../types'

/** Every memory hook you've made, plus a quiz that drills hook ⇄ term. */
export default function Hooks() {
  const data = useLiveQuery(async () => {
    const cards = (await db.cards.filter((c) => !c.deleted && !!c.hook).toArray()).sort((a, b) => b.hook!.at - a.hook!.at)
    const sets = new Map((await db.sets.toArray()).map((s) => [s.id, s]))
    return { cards, sets }
  })
  const [tab, setTab] = useState<'list' | 'quiz'>('list')
  const [query, setQuery] = useState('')
  const [byChapter, setByChapter] = useState(false)
  if (!data) return null
  const { cards, sets } = data

  const q = query.trim().toLowerCase()
  const shown = q ? cards.filter((c) => [c.term, c.definition, c.hook!.text].some((t) => t.toLowerCase().includes(q))) : cards

  return (
    <div className="hooks-page">
      <h1>Memory hooks</h1>
      <div className="chips">
        <button className={`chip ${tab === 'list' ? 'on' : ''}`} onClick={() => setTab('list')}>
          All hooks {cards.length}
        </button>
        <button className={`chip ${tab === 'quiz' ? 'on' : ''}`} onClick={() => setTab('quiz')} disabled={cards.length < 4}>
          Quiz my hooks
        </button>
      </div>

      {!cards.length && (
        <p className="panel">
          No hooks yet. While you study, tap <b>🪝 Make a memory hook</b> on a card you keep forgetting: you'll get a mnemonic, acronym or vivid image, and it
          lands here.
        </p>
      )}
      {cards.length > 0 && cards.length < 4 && tab === 'list' && <p className="muted small">Make {4 - cards.length} more to unlock the hook quiz.</p>}

      {tab === 'quiz' && cards.length >= 4 ? (
        <HookQuiz cards={cards} />
      ) : (
        cards.length > 0 && (
          <>
            <div className="hooks-tools">
              <input type="search" placeholder="Search hooks" value={query} onChange={(e) => setQuery(e.target.value)} />
              <label className="small">
                <input type="checkbox" checked={byChapter} onChange={(e) => setByChapter(e.target.checked)} /> By chapter
              </label>
            </div>
            {byChapter ? (
              groupByChapter(shown, sets).map(([name, cs]) => (
                <section key={name}>
                  <h3 className="hooks-chapter">{name}</h3>
                  <HookList cards={cs} sets={sets} />
                </section>
              ))
            ) : (
              <HookList cards={shown} sets={sets} />
            )}
          </>
        )
      )}
    </div>
  )
}

function groupByChapter(cards: Card[], sets: Map<string, CardSet>): [string, Card[]][] {
  const m = new Map<string, Card[]>()
  for (const c of cards) {
    const name = sets.get(c.setId)?.name ?? 'Other'
    ;(m.get(name) ?? m.set(name, []).get(name)!).push(c)
  }
  return [...m].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
}

function HookList({ cards, sets }: { cards: Card[]; sets: Map<string, CardSet> }) {
  return (
    <ul className="hook-list">
      {cards.map((c) => (
        <HookRow key={c.id} card={c} chapter={sets.get(c.setId)?.name ?? ''} />
      ))}
    </ul>
  )
}

function HookRow({ card, chapter }: { card: Card; chapter: string }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(card.hook!.text)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const again = async () => {
    setBusy(true)
    setError('')
    try {
      const h = await makeHook(card)
      setText(h.text)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="panel hook-row">
      <div className="hook-row-head">
        <b>
          <RichText text={card.term} />
        </b>
        <span className="hook-kind">{KIND_LABEL[card.hook!.kind]}</span>
      </div>
      {editing ? (
        <div className="card-tools-edit">
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="actions">
            <button
              className="btn primary small"
              disabled={!text.trim()}
              onClick={async () => {
                await updateCard(card.id, { hook: { ...card.hook!, text: text.trim() } })
                setEditing(false)
              }}
            >
              Save
            </button>
            <button className="btn small" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="hook-text">
          <RichText text={card.hook!.text} />
        </p>
      )}
      <p className="muted small">
        <RichText text={card.definition} mark={card.keyword} />
      </p>
      <div className="hook-row-actions small">
        <Link to={`/set/${card.setId}`} className="muted">
          {chapter}
        </Link>
        <span>
          <button className="btn link small" onClick={() => setEditing(!editing)}>
            ✎ Edit
          </button>
          <button className="btn link small" disabled={busy} onClick={again}>
            {busy ? 'Making…' : '↻ New hook'}
          </button>
          <button className="btn link small danger" onClick={() => confirm('Delete this hook?') && updateCard(card.id, { hook: null })}>
            Delete
          </button>
        </span>
      </div>
      {error && <p className="muted small">{error}</p>}
    </li>
  )
}

interface HQ {
  card: Card
  reverse: boolean // false: hook → pick the term; true: term → pick the hook
  options: Card[]
}
const ROUND = 10

function buildRound(cards: Card[]): HQ[] {
  return shuffle(cards)
    .slice(0, ROUND)
    .map((card, i) => ({ card, reverse: i % 2 === 1, options: shuffle([card, ...shuffle(cards.filter((c) => c.id !== card.id)).slice(0, 3)]) }))
}

/** Hook ⇄ term multiple choice. Answers count toward the card's schedule like a quiz. */
function HookQuiz({ cards }: { cards: Card[] }) {
  const [round, setRound] = useState(() => buildRound(cards))
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [right, setRight] = useState(0)
  const shownAt = useRef(Date.now())

  if (i >= round.length)
    return (
      <div className="panel done-box">
        <h2>
          {right} / {round.length} right
        </h2>
        <p className="muted">Hooks you missed: open them in the list and say them out loud once, or tap ↻ New hook if one doesn't stick.</p>
        <button
          className="btn primary"
          onClick={() => {
            setRound(buildRound(cards))
            setI(0)
            setRight(0)
            setPicked(null)
            shownAt.current = Date.now()
          }}
        >
          Another round
        </button>
      </div>
    )

  const q = round[i]
  const correct = q.options.indexOf(q.card)
  const choose = (k: number) => {
    if (picked !== null) return
    setPicked(k)
    if (k === correct) setRight((n) => n + 1)
    void recordOutcome(q.card, k === correct, 'quiz', Date.now() - shownAt.current)
  }
  return (
    <div className="question">
      <div className="muted small">
        {i + 1} / {round.length}
      </div>
      <div className="q-prompt">
        <span className="q-label">{q.reverse ? 'Which hook goes with' : 'Which term is this hook for?'}</span>
        <RichText text={q.reverse ? q.card.term : q.card.hook!.text} />
      </div>
      <div className="options">
        {q.options.map((o, k) => (
          <button
            key={o.id}
            className={`option ${picked === null ? '' : k === correct ? 'right' : k === picked ? 'wrong' : 'dim'}`}
            disabled={picked !== null}
            onClick={() => choose(k)}
          >
            <RichText text={q.reverse ? o.hook!.text : o.term} />
          </button>
        ))}
      </div>
      {picked !== null && (
        <>
          <p className="muted small">
            <b>
              <RichText text={q.card.term} />
            </b>
            : <RichText text={q.card.definition} mark={q.card.keyword} />
          </p>
          <div className={`feedback ${picked === correct ? 'right' : 'wrong'}`}>
            <span>{picked === correct ? '✓ Correct' : '✕ Not quite'}</span>
            <button
              className="btn primary"
              autoFocus
              onClick={() => {
                setI(i + 1)
                setPicked(null)
                shownAt.current = Date.now()
              }}
            >
              Continue
            </button>
          </div>
        </>
      )}
    </div>
  )
}
