import { useEffect, useSyncExternalStore } from 'react'
import { pause as pauseBlock, resume as resumeBlock } from './focus'
import { setFocus, useFocus } from './focusStore'

/**
 * Study clock: "active time" = wall clock minus every paused stretch. Answer timers
 * (multiple-choice grading, time studied, quiz timers) read activeNow(), so walking away
 * never makes an answer look slow. Pausing is manual (Pause button) or automatic when the
 * app goes to the background (phone locked, another app opened).
 */
interface State {
  paused: false | 'manual' | 'away'
  since: number // when the current pause started
  pausedTotal: number // ms paused before the current pause
}
let state: State = { paused: false, since: 0, pausedTotal: 0 }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
let pausedFocusBlock = false // did pausing study also pause the focus timer?

/** Wall clock minus all paused time (frozen while paused). */
export function activeNow(now = Date.now()) {
  return now - state.pausedTotal - (state.paused ? now - state.since : 0)
}

export function pauseStudy(reason: 'manual' | 'away' = 'manual') {
  if (state.paused) {
    if (reason === 'manual' && state.paused === 'away') {
      state = { ...state, paused: 'manual' }
      const fs = focusSnapshot()
      if (fs?.block && !fs.block.pausedAt) {
        setFocus({ block: pauseBlock(fs.block) })
        pausedFocusBlock = true
      }
    }
    emit()
    return
  }
  state = { ...state, paused: reason, since: Date.now() }
  // Pressing Pause also pauses a running focus block (and Resume resumes it). Leaving the
  // app does NOT: you're often away because it's your break, and the break must keep running.
  const fs = focusSnapshot()
  if (reason === 'manual' && fs?.block && !fs.block.pausedAt) {
    setFocus({ block: pauseBlock(fs.block) })
    pausedFocusBlock = true
  }
  emit()
}

export function resumeStudy() {
  if (!state.paused) return
  state = { paused: false, since: 0, pausedTotal: state.pausedTotal + (Date.now() - state.since) }
  const fs = focusSnapshot()
  if (pausedFocusBlock && fs?.block?.pausedAt) setFocus({ block: resumeBlock(fs.block) })
  pausedFocusBlock = false
  emit()
}

// focusStore keeps its state behind a hook; read it through a tiny bridge set by useStudyPause.
let focusSnapshot: () => ReturnType<typeof useFocus> | null = () => null

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Pause state for study screens; also wires auto-pause when the app is hidden. */
export function useStudyPause() {
  const s = useSyncExternalStore(subscribe, () => state)
  const focus = useFocus()
  focusSnapshot = () => focus
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') pauseStudy('away')
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      // Leaving the study screen ends any pause, so other screens aren't left frozen.
      resumeStudy()
    }
  }, [])
  return s.paused
}
