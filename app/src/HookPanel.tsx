import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from './db'
import { KIND_LABEL, makeHook } from './hooks'
import { RichText } from './rich'
import type { Card } from './types'

/** Shows a card's memory hook, or a button to make one. */
export default function HookPanel({ card, compact }: { card: Card; compact?: boolean }) {
  const live = useLiveQuery(() => db.cards.get(card.id), [card.id]) ?? card
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (live.drill || live.occlusion) return null

  const run = async () => {
    setBusy(true)
    setError('')
    try {
      await makeHook(live)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (live.hook)
    return (
      <div className="hook" onClick={(e) => e.stopPropagation()}>
        <div className="hook-head">
          <span className="hook-kind">🪝 {KIND_LABEL[live.hook.kind]}</span>
          {!compact && (
            <button type="button" className="btn link small" disabled={busy} onClick={run}>
              {busy ? 'Making a new one…' : 'Try another'}
            </button>
          )}
        </div>
        <RichText text={live.hook.text} />
        {error && <div className="muted small">{error}</div>}
      </div>
    )
  return (
    <div className="hook-make" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="btn small" disabled={busy} onClick={run}>
        {busy ? 'Making a memory hook…' : '🪝 Make a memory hook'}
      </button>
      {error && <span className="muted small"> {error}</span>}
    </div>
  )
}
