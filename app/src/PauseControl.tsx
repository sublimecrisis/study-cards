import { pauseStudy, resumeStudy, useStudyPause } from './studyClock'

/**
 * Pause button for study headers, plus the paused screen. The screen covers the question
 * so it can't be studied off the clock; paused time never counts toward grading or stats.
 */
export default function PauseControl() {
  const paused = useStudyPause()
  return (
    <>
      <button type="button" className="btn small pause-btn" onClick={() => (paused ? resumeStudy() : pauseStudy())} aria-label="Pause">
        ⏸ Pause
      </button>
      {paused && (
        <div className="pause-screen" role="dialog" aria-label="Paused">
          <div className="pause-card">
            <div className="pause-icon">⏸</div>
            <h2>{paused === 'away' ? 'Paused while you were away' : 'Paused'}</h2>
            <p className="muted">The clock is stopped, so this pause won't affect how your answers are graded or your study time.</p>
            <button className="btn primary" autoFocus onClick={resumeStudy}>
              Resume
            </button>
          </div>
        </div>
      )}
    </>
  )
}
