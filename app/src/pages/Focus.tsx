import { useState } from 'react'
import { Link } from 'react-router-dom'
import { buildPlan, clock, pause, paceStats, PHASE_LABEL, position, presetOf, PRESETS, resume, skip, start, type BlockSummary, type FocusState } from '../focus'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { primeSound, setFocus, useFocus, useNow } from '../focusStore'

const LENGTHS = [60, 120, 180, 240]
const PREF = 'focus-pref'
const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`)
const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}` : `${min}m`)

function loadPref() {
  try {
    return { preset: '50-10', blockMin: 240, ...JSON.parse(localStorage.getItem(PREF) ?? '{}') }
  } catch {
    return { preset: '50-10', blockMin: 240 }
  }
}

/** Focus timer: start a block, follow the round plan, see how each round went. */
export default function Focus() {
  const { block, summary } = useFocus()
  const now = useNow(!!block)
  const [pref, setPref] = useState(loadPref)
  const choose = (p: Partial<typeof pref>) => {
    const next = { ...pref, ...p }
    setPref(next)
    try {
      localStorage.setItem(PREF, JSON.stringify(next))
    } catch {
      /* remembered for this visit only */
    }
  }

  if (block) {
    const pos = position(block, now)
    if (pos.done) return null // FocusLayer saves the summary on the next tick
    const seg = pos.seg!
    const progress = 1 - pos.remainingMs / seg.ms
    return (
      <div className="focus-page">
        <h1>Focus</h1>
        <section className={`panel focus-now ${seg.kind === 'focus' ? 'on' : 'rest'}`}>
          <div className="focus-phase">
            {PHASE_LABEL[seg.kind]} · round {seg.round} of {pos.totalRounds}
            {block.pausedAt ? ' · paused' : ''}
          </div>
          <div className="focus-clock">{clock(pos.remainingMs)}</div>
          <div className="goal-bar wide">
            <span style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="actions">
            {block.pausedAt ? (
              <button className="btn primary" onClick={() => setFocus({ block: resume(block) })}>
                Resume
              </button>
            ) : (
              <button className="btn" onClick={() => setFocus({ block: pause(block) })}>
                Pause
              </button>
            )}
            <button className="btn" onClick={() => setFocus({ block: skip(block) })}>
              {seg.kind === 'focus' ? 'Break now' : 'Skip break'}
            </button>
            {seg.kind === 'focus' && (
              <Link className="btn primary" to="/">
                Study
              </Link>
            )}
          </div>
        </section>
        <LiveBlockStats block={block} now={now} />
        <Plan preset={block.preset} blockMin={block.blockMin} current={pos.i} />
        <button className="btn link small danger" onClick={() => confirm('End this block now?') && setFocus({ block: null, fatigueSnooze: 0 })}>
          End block
        </button>
      </div>
    )
  }

  const p = presetOf(pref.preset)
  const plan = buildPlan(p, pref.blockMin)
  const focusMin = plan.filter((s) => s.kind === 'focus').reduce((n, s) => n + s.ms / 60_000, 0)
  return (
    <div className="focus-page">
      <h1>Focus</h1>
      {summary && <Summary s={summary} />}
      <section className="panel">
        <h2>Start a study block</h2>
        <p className="muted small">Study in rounds with breaks in between, so you stay sharp for the whole block instead of fading after hour two.</p>
        <div className="field-label small">Rhythm (focus / break, minutes)</div>
        <div className="chips">
          {PRESETS.map((x) => (
            <button key={x.key} className={`chip ${pref.preset === x.key ? 'on' : ''}`} onClick={() => choose({ preset: x.key })}>
              {x.label}
            </button>
          ))}
        </div>
        <div className="field-label small">Block length</div>
        <div className="chips">
          {LENGTHS.map((m) => (
            <button key={m} className={`chip ${pref.blockMin === m ? 'on' : ''}`} onClick={() => choose({ blockMin: m })}>
              {hm(m)}
            </button>
          ))}
        </div>
        <p className="small">
          <b>{plan.filter((s) => s.kind === 'focus').length} rounds</b> · {hm(focusMin)} of studying
          {p.longAfter ? ` · ${p.long} min long break after every ${p.longAfter} rounds` : ''}
        </p>
        <button
          className="btn primary"
          onClick={() => {
            primeSound()
            setFocus({ block: start(pref.preset, pref.blockMin), summary: null, fatigueSnooze: 0 })
          }}
        >
          Start {hm(pref.blockMin)} block
        </button>
        <p className="muted small">
          Keep the app open while you study: you'll hear a chime when a round ends. If you switch apps, the timer keeps the right time but can't alert you
          yet.
        </p>
      </section>
      <Plan preset={pref.preset} blockMin={pref.blockMin} current={-1} />
    </div>
  )
}

function Plan({ preset, blockMin, current }: { preset: string; blockMin: number; current: number }) {
  const plan = buildPlan(presetOf(preset), blockMin)
  let t = 0
  return (
    <details className="panel focus-plan" open={current < 0}>
      <summary>Round plan</summary>
      <ol>
        {plan.map((s, i) => {
          const from = t
          t += s.ms / 60_000
          return (
            <li key={i} className={`${s.kind} ${i === current ? 'now' : i < current ? 'past' : ''}`}>
              <span className="focus-plan-time muted small">{`${Math.floor(from / 60)}:${String(from % 60).padStart(2, '0')}`}</span>
              <span>
                {s.kind === 'focus' ? `Focus round ${s.round}` : PHASE_LABEL[s.kind]} · {s.ms / 60_000} min
              </span>
            </li>
          )
        })}
      </ol>
    </details>
  )
}

export function Summary({ s }: { s: BlockSummary }) {
  return (
    <section className="panel focus-summary">
      <h2>Block done 🎉</h2>
      <PaceTiles minutes={s.minutesFocused} answers={s.answers} perMin={s.perMin} newCards={s.newCards} accuracy={s.accuracy} />
      {s.rounds.length > 0 && (
        <table className="tbl small round-table">
          <thead>
            <tr>
              <th>Round</th>
              <th>Right</th>
              <th>Cards</th>
              <th>Per min</th>
              <th>New</th>
            </tr>
          </thead>
          <tbody>
            {s.rounds.map((r) => (
              <tr key={r.round}>
                <td>{r.round}</td>
                <td>{pct(r.accuracy)}</td>
                <td>{r.answers}</td>
                <td>{r.perMin ?? '—'}</td>
                <td>{r.newCards ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">If accuracy or cards per minute drop in the later rounds, you're fading: try shorter rounds or a longer long break next time.</p>
    </section>
  )
}

function PaceTiles({ minutes, answers, perMin, newCards, accuracy }: { minutes: number; answers: number; perMin?: number | null; newCards?: number; accuracy: number | null }) {
  return (
    <div className="pace-tiles">
      <div><b>{hm(minutes)}</b><span className="muted small">focused</span></div>
      <div><b>{answers}</b><span className="muted small">cards answered</span></div>
      <div><b>{perMin ?? '—'}</b><span className="muted small">cards / min</span></div>
      <div><b>{newCards ?? '—'}</b><span className="muted small">new learned</span></div>
      <div><b>{pct(accuracy)}</b><span className="muted small">right</span></div>
    </div>
  )
}

/** Live numbers for the block in progress. */
function LiveBlockStats({ block, now }: { block: FocusState; now: number }) {
  const answers = useLiveQuery(() => db.reviews.where('at').aboveOrEqual(block.startedAt).toArray(), [block.startedAt]) ?? []
  // Focused minutes so far: finished rounds plus the one in progress.
  const minutes = Math.round(block.rounds.reduce((n, r) => n + (r.to - r.from), 0) / 60_000)
  const p = paceStats(answers, minutes)
  void now
  return (
    <section className="panel">
      <div className="small muted">This block so far</div>
      <PaceTiles minutes={p.minutes} answers={p.answers} perMin={p.perMin} newCards={p.newCards} accuracy={p.accuracy} />
    </section>
  )
}
