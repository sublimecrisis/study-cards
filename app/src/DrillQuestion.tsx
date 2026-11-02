import { useState } from 'react'
import CardTools from './CardTools'
import { GuessedButton, Kbd } from './components'
import type { Question } from './quizgen'
import { RichText } from './rich'
import { activeNow } from './studyClock'

/**
 * Ordering: tap the items in the right sequence (tap a placed item to take it back).
 * Matching: pick the matching term for each description.
 * All-or-nothing scoring, with every position/pair marked afterwards.
 */
export default function DrillQuestion({ q, onAnswer }: { q: Question; onAnswer: (correct: boolean, guessed?: boolean, ms?: number) => void }) {
  const drill = q.card.drill!
  const [placed, setPlaced] = useState<string[]>([])
  const [picks, setPicks] = useState<Record<number, string>>({})
  const [checked, setChecked] = useState<boolean | null>(null)
  const [shownAt] = useState(() => activeNow())
  const [ms, setMs] = useState(0)
  const check = (ok: boolean) => {
    setMs(activeNow() - shownAt)
    setChecked(ok)
  }

  if (drill.kind === 'order') {
    const left = q.shuffled!.filter((x) => !placed.includes(x))
    const right = placed.length === drill.items.length && placed.every((x, i) => x === drill.items[i])
    return (
      <div className="question">
        <div className="q-prompt">
          <span className="q-label">Put in order</span>
          <RichText text={q.card.term} />
          <CardTools card={q.card} />
        </div>
        <ol className="order-placed">
          {placed.map((x, i) => (
            <li key={x} className={checked === null ? '' : x === drill.items[i] ? 'right' : 'wrong'}>
              <button className="order-item" disabled={checked !== null} onClick={() => setPlaced((p) => p.filter((y) => y !== x))}>
                <span className="order-n">{i + 1}</span> <RichText text={x} />
              </button>
            </li>
          ))}
        </ol>
        {left.length > 0 && <div className="q-ask muted small">Tap the next one</div>}
        <div className="order-pool">
          {left.map((x) => (
            <button key={x} className="option" onClick={() => setPlaced((p) => [...p, x])}>
              <RichText text={x} />
            </button>
          ))}
        </div>
        {checked === null ? (
          <button className="btn primary" disabled={left.length > 0} onClick={() => check(right)}>
            Check
          </button>
        ) : (
          <>
            {!checked && (
              <div className="q-correct">
                Correct order: <RichText text={drill.items.join(' → ')} />
              </div>
            )}
            <div className={`feedback ${checked ? 'right' : 'wrong'}`}>
              <span>{checked ? '✓ All in order' : `✕ ${placed.filter((x, i) => x === drill.items[i]).length} of ${drill.items.length} in the right spot`}</span>
              {checked && <GuessedButton onClick={() => onAnswer(true, true, ms)} />}
              <button className="btn primary" autoFocus onClick={() => onAnswer(checked, false, ms)}>
                Continue <Kbd>Enter</Kbd>
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  const pairs = drill.pairs
  const all = pairs.every((_, i) => picks[i])
  const nRight = pairs.filter((p, i) => picks[i] === p[1]).length
  return (
    <div className="question">
      <div className="q-prompt">
        <span className="q-label">Match them up</span>
        <RichText text={q.card.term} />
        <CardTools card={q.card} />
      </div>
      <div className="match-rows">
        {pairs.map((p, i) => (
          <div key={i} className={`match-row ${checked === null ? '' : picks[i] === p[1] ? 'right' : 'wrong'}`}>
            <div className="match-left">
              <RichText text={p[0]} />
            </div>
            <select value={picks[i] ?? ''} disabled={checked !== null} onChange={(e) => setPicks((x) => ({ ...x, [i]: e.target.value }))}>
              <option value="">Choose…</option>
              {q.shuffled!.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {checked !== null && picks[i] !== p[1] && <div className="muted small">Answer: {p[1]}</div>}
          </div>
        ))}
      </div>
      {checked === null ? (
        <button className="btn primary" disabled={!all} onClick={() => check(nRight === pairs.length)}>
          Check
        </button>
      ) : (
        <div className={`feedback ${checked ? 'right' : 'wrong'}`}>
          <span>{checked ? '✓ All matched' : `✕ ${nRight} of ${pairs.length} right`}</span>
          {checked && <GuessedButton onClick={() => onAnswer(true, true, ms)} />}
          <button className="btn primary" autoFocus onClick={() => onAnswer(checked, false, ms)}>
            Continue <Kbd>Enter</Kbd>
          </button>
        </div>
      )}
    </div>
  )
}
