import { useState } from 'react'
import { Link } from 'react-router-dom'
import { STATUS_LABEL, type Status } from './srs'
import { scopeQuery, type Scope } from './scope'
import type { Breakdown } from './stats'
import type { QuizResult } from './types'

// Ordinal one-hue ramp (validated light & dark); "not studied" is the neutral track.
const ORDER: Status[] = ['mastered', 'familiar', 'learning', 'new']

/** Stacked memory-status bar + legend. */
export function ProgressBar({ b, compact }: { b: Breakdown; compact?: boolean }) {
  if (!b.total) return null
  const pct = (n: number) => (n / b.total) * 100
  return (
    <div className="progress">
      <div className="pbar" role="img" aria-label={ORDER.map((s) => `${STATUS_LABEL[s]} ${b[s]}`).join(', ')}>
        {ORDER.map((s) =>
          b[s] ? <span key={s} className={`seg seg-${s}`} style={{ width: `${pct(b[s])}%` }} title={`${STATUS_LABEL[s]}: ${b[s]} (${Math.round(pct(b[s]))}%)`} /> : null,
        )}
      </div>
      {!compact && (
        <div className="plegend">
          {ORDER.map((s) => (
            <span key={s}>
              <i className={`swatch seg-${s}`} /> {STATUS_LABEL[s]} <b>{b[s]}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Mode buttons for a set / course / everything; with `filters`, also its own filter chips, else uses `filter`. */
export function StudyLauncher(props: { base: Omit<Scope, 'filter'>; due: number; filters?: { f: Scope['filter']; label: string }[]; filter?: Scope['filter'] }) {
  const { base, due, filters = [] } = props
  const [own, setFilter] = useState<Scope['filter']>('all')
  const filter = props.filter ?? own
  const q = scopeQuery({ ...base, filter })
  return (
    <div className="launcher">
      {filters.length > 1 && (
        <div className="chips">
          <span className="muted small">Study:</span>
          {filters.map(({ f, label }) => (
            <button key={f} className={`chip ${f === filter ? 'on' : ''}`} onClick={() => setFilter(f)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="modes">
        <Link className="mode" to={`/study/review?${q}`}>
          <span className="mode-icon">↻</span>
          <span>
            Review
            <small>{due ? `${due} due` : 'spaced repetition'}</small>
          </span>
        </Link>
        <Link className="mode" to={`/study/learn?${q}`}>
          <span className="mode-icon">◎</span>
          <span>
            Learn<small>guided rounds</small>
          </span>
        </Link>
        <Link className="mode" to={`/study/flashcards?${q}`}>
          <span className="mode-icon">▭</span>
          <span>
            Flashcards<small>flip & sort</small>
          </span>
        </Link>
        <Link className="mode" to={`/quiz?${q}`}>
          <span className="mode-icon">✓</span>
          <span>
            Quiz<small>quick or custom</small>
          </span>
        </Link>
      </div>
    </div>
  )
}

/** Quiz score history: one column per quiz, oldest → newest. */
export function ScoreChart({ results }: { results: QuizResult[] }) {
  const [hover, setHover] = useState<number | null>(null)
  if (!results.length) return null
  const last = results.slice(-20)
  const W = 320, H = 110, T = 8, L = 30, B = 14, gap = 2
  const bw = Math.min(24, (W - L) / last.length - gap)
  const y = (p: number) => T + (H - B - T) * (1 - p)
  const h = hover !== null ? last[hover] : null
  const avg = Math.round((last.reduce((n, r) => n + r.correct / r.total, 0) / last.length) * 100)
  return (
    <figure className="chart">
      <figcaption>
        <strong>Quiz scores</strong> <span className="muted small">last {last.length} · average {avg}%</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Quiz scores, average ${avg}%`} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((p) => (
          <g key={p}>
            <line x1={L} x2={W} y1={y(p)} y2={y(p)} className="grid" />
            <text x={L - 4} y={y(p) + 3} className="tick" textAnchor="end">
              {p * 100}%
            </text>
          </g>
        ))}
        {last.map((r, i) => {
          const p = r.correct / r.total
          const x = L + 4 + i * (bw + gap)
          const top = y(p)
          return (
            <g key={r.id} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <rect x={x - gap / 2} y={T} width={bw + gap} height={H - B - T} fill="transparent" />
              <path
                className={`col ${hover === i ? 'on' : ''}`}
                d={p > 0 ? `M${x},${H - B} V${top + Math.min(4, H - B - top)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${H - B} Z` : ''}
              />
            </g>
          )
        })}
        <line x1={L} x2={W} y1={H - B} y2={H - B} className="axis" />
      </svg>
      <div className="chart-tip small">
        {h ? (
          <>
            {new Date(h.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · <b>{Math.round((h.correct / h.total) * 100)}%</b> ({h.correct}/{h.total}) · {h.label}
          </>
        ) : (
          <span className="muted">Hover or tap a column for details.</span>
        )}
      </div>
      <details className="small">
        <summary>Table</summary>
        <table className="tbl">
          <tbody>
            {[...last].reverse().map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                <td>{r.label}</td>
                <td>
                  {r.correct}/{r.total}
                </td>
                <td>{Math.round((r.correct / r.total) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

/** Thin top progress line for study sessions. */
export const SessionBar = ({ done, total }: { done: number; total: number }) => (
  <div className="session-bar" role="progressbar" aria-valuenow={done} aria-valuemax={total}>
    <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
  </div>
)

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

/** "Right, but I guessed": counts the answer as shaky so the card comes back sooner. */
export const GuessedButton = ({ onClick }: { onClick: () => void }) => (
  <button type="button" className="btn small guessed" title="Treat this as a miss so it comes back sooner" onClick={onClick}>
    I guessed
  </button>
)
