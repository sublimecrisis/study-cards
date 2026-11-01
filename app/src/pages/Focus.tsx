import { useState } from 'react'
import { Link } from 'react-router-dom'
import { buildPlan, clock, pause, PHASE_LABEL, position, presetOf, PRESETS, resume, skip, start, type BlockSummary } from '../focus'
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
      <p className="small">
        <b>{hm(s.minutesFocused)}</b> focused · <b>{s.answers}</b> answers · <b>{pct(s.accuracy)}</b> right
      </p>
      {s.rounds.length > 0 && (
        <ul className="exam-sets">
          {s.rounds.map((r) => (
            <li key={r.round}>
              <span>Round {r.round}</span>
              <span className="mini-bar">
                <span style={{ width: pct(r.accuracy === null ? 0 : r.accuracy) }} />
              </span>
              <span className="small">
                <b>{pct(r.accuracy)}</b> <span className="muted">· {r.answers}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">If accuracy falls in the later rounds, try shorter rounds or a longer long break next time.</p>
    </section>
  )
}
