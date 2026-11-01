import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { db, newId } from './db'
import { clock, fatigue, PHASE_LABEL, position, skip, summarize, trackRound } from './focus'
import { chime, saveSummary, setFocus, useFocus, useNow } from './focusStore'
import type { ReviewLog } from './types'

/** Top-bar timer: "Focus 32:10 · 2/4", or a Focus link when no block is running. */
export function FocusPill() {
  const { block } = useFocus()
  const now = useNow(!!block)
  if (!block)
    return (
      <Link to="/focus" className="focus-pill idle">
        ⏱ Focus
      </Link>
    )
  const pos = position(block, now)
  if (pos.done) return null
  const kind = pos.seg!.kind
  return (
    <Link to="/focus" className={`focus-pill ${kind === 'focus' ? 'on' : 'rest'} ${block.pausedAt ? 'paused' : ''}`}>
      {block.pausedAt ? '⏸' : kind === 'focus' ? '●' : '☕'} {PHASE_LABEL[kind]} {clock(pos.remainingMs)}
      <span className="focus-round">
        {' '}
        · {pos.seg!.round}/{pos.totalRounds}
      </span>
    </Link>
  )
}

const TIPS = [
  'Stand up and move around.',
  'Drink some water.',
  'Look at something 20 feet away for 20 seconds.',
  'Skip the phone scrolling: a quiet break lets what you just studied settle in.',
  'Breathe slowly: in for 4, out for 6.',
]
const LONG_TIPS = ['Eat a snack and get some fresh air.', 'Take a short walk.', 'Stretch your neck, shoulders and hips.']
const STUDY_ROUTES = ['/study/', '/quiz']

/**
 * Runs the block: records round windows, chimes on phase changes, saves the summary
 * when the block ends, suggests a break when accuracy drops, and covers the study
 * pages during breaks (soft lock: "Skip break" is always there).
 */
export default function FocusLayer() {
  const { block, fatigueSnooze } = useFocus()
  const now = useNow(!!block)
  const loc = useLocation()
  const lastIndex = useRef<number | null>(null)
  const answers = useLiveQuery(async (): Promise<ReviewLog[]> => (block ? db.reviews.where('at').aboveOrEqual(block.startedAt).toArray() : []), [block?.startedAt])

  const pos = block ? position(block, now) : null

  useEffect(() => {
    if (!block || !pos) {
      lastIndex.current = null
      return
    }
    const tracked = trackRound(block, now)
    if (pos.done) {
      if (!answers) return // wait for the review log, or the summary would count 0 answers
      const summary = summarize(tracked, answers ?? [], newId())
      void saveSummary(summary)
      setFocus({ block: null, summary, fatigueSnooze: 0 })
      chime('break')
      return
    }
    if (lastIndex.current !== null && lastIndex.current !== pos.i) chime(pos.seg!.kind === 'focus' ? 'focus' : 'break')
    lastIndex.current = pos.i
    if (tracked !== block && now - (block.rounds.at(-1)?.to ?? 0) > 15_000) setFocus({ block: tracked }) // save ~every 15 s
    else if (tracked.rounds.length !== block.rounds.length) setFocus({ block: tracked })
  })

  if (!block || !pos || pos.done) return null
  const kind = pos.seg!.kind
  const onStudyPage = STUDY_ROUTES.some((r) => loc.pathname.startsWith(r))

  if (kind !== 'focus' && onStudyPage && !block.pausedAt) {
    const tips = kind === 'long' ? [...LONG_TIPS, ...TIPS.slice(0, 2)] : TIPS
    return (
      <div className="break-screen" role="dialog" aria-label="Break">
        <div className="break-card">
          <div className="break-kind">{kind === 'long' ? 'Long break' : 'Break time'}</div>
          <div className="break-clock">{clock(pos.remainingMs)}</div>
          <p className="muted">
            Round {pos.seg!.round} of {pos.totalRounds} done. Your session waits right here.
          </p>
          <ul className="break-tips">
            {tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <div className="actions">
            <Link className="btn" to="/focus">
              Focus page
            </Link>
          </div>
          <button className="btn link small" onClick={() => setFocus({ block: skip(block) })}>
            Skip break
          </button>
        </div>
      </div>
    )
  }

  const tired = kind === 'focus' && answers && answers.length > fatigueSnooze ? fatigue(answers) : null
  if (tired)
    return (
      <div className="focus-banner">
        <span>
          Accuracy dropping: {Math.round(tired.before * 100)}% earlier, {Math.round(tired.last * 100)}% in your last 15. Take your break now?
        </span>
        <span className="focus-banner-actions">
          <button className="btn small primary" onClick={() => setFocus({ block: skip(block), fatigueSnooze: answers!.length + 15 })}>
            Break now
          </button>
          <button className="btn link small" onClick={() => setFocus({ fatigueSnooze: answers!.length + 15 })}>
            Keep going
          </button>
        </span>
      </div>
    )
  return null
}
