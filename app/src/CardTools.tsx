import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, updateCard } from './db'
import type { Card } from './types'

/**
 * Flag / quick-edit a card without leaving a study session.
 * Flagged cards show up under the "Needs check" filter; edits save straight away
 * and appear the next time the card comes up.
 */
export default function CardTools({ card }: { card: Card }) {
  const live = useLiveQuery(() => db.cards.get(card.id), [card.id]) ?? card
  const [editing, setEditing] = useState(false)
  const [term, setTerm] = useState('')
  const [def, setDef] = useState('')
  const [kw, setKw] = useState('')
  const [saved, setSaved] = useState(false)

  const open = () => {
    setTerm(live.term)
    setDef(live.definition)
    setKw(live.keyword ?? '')
    setSaved(false)
    setEditing(true)
  }
  const save = async () => {
    await updateCard(card.id, { term: term.trim(), definition: def.trim(), keyword: kw.trim() })
    setEditing(false)
    setSaved(true)
  }

  return (
    <div className="card-tools" onClick={(e) => e.stopPropagation()}>
      <div className="card-tools-row">
        <button
          type="button"
          className={`btn link small ${live.needsCheck ? 'flag-on' : ''}`}
          title="Flag this card to fix later (Needs check filter)"
          onClick={() => updateCard(card.id, { needsCheck: live.needsCheck ? 0 : 1 })}
        >
          {live.needsCheck ? '⚑ Flagged' : '⚐ Flag'}
        </button>
        {!live.drill && !live.occlusion && (
          <button type="button" className="btn link small" onClick={() => (editing ? setEditing(false) : open())}>
            ✎ {editing ? 'Cancel edit' : 'Edit'}
          </button>
        )}
        {saved && <span className="muted small">Saved, shows next time</span>}
      </div>
      {editing && (
        <div className="card-tools-edit">
          <label className="small muted">
            Term
            <textarea rows={2} value={term} onChange={(e) => setTerm(e.target.value)} />
          </label>
          <label className="small muted">
            Definition
            <textarea rows={3} value={def} onChange={(e) => setDef(e.target.value)} />
          </label>
          <label className="small muted">
            Key word to highlight (optional, must appear in the definition)
            <input value={kw} onChange={(e) => setKw(e.target.value)} />
          </label>
          {kw.trim() && !def.includes(kw.trim()) && <span className="small" style={{ color: 'var(--wrong)' }}>Not found in the definition, so it won't be highlighted.</span>}
          <button type="button" className="btn primary small" disabled={!term.trim() || !def.trim()} onClick={save}>
            Save
          </button>
        </div>
      )}
    </div>
  )
}
