import CardTools from './CardTools'
import HookPanel from './HookPanel'
import { CardImage, RichText } from './rich'
import type { Card } from './types'

/**
 * Back / Skip for study sessions.
 * - Skip: the current card moves to the end of the session, ungraded.
 * - Back: look at cards already answered this session (read only: flag, edit, make a
 *   hook), one step at a time. It never regrades, so an answer can't be taken back.
 */
export function StudyNav({ history, viewing, setViewing, onSkip, canSkip }: {
  history: Card[]
  viewing: number | null // index into history, or null = current question
  setViewing: (i: number | null) => void
  onSkip?: () => void
  canSkip: boolean
}) {
  const back = () => setViewing(viewing === null ? history.length - 1 : Math.max(0, viewing - 1))
  return (
    <div className="study-nav">
      <button type="button" className="btn small" disabled={!history.length || viewing === 0} onClick={back}>
        ↶ Back
      </button>
      {viewing === null ? (
        onSkip && (
          <button type="button" className="btn small" disabled={!canSkip} onClick={onSkip} title="Move this card to the end of the session without grading it">
            Skip ⤼
          </button>
        )
      ) : (
        <>
          <span className="muted small">
            Answered card {viewing + 1} of {history.length}
          </span>
          {viewing < history.length - 1 && (
            <button type="button" className="btn small" onClick={() => setViewing(viewing + 1)}>
              Next ↷
            </button>
          )}
          <button type="button" className="btn small primary" onClick={() => setViewing(null)}>
            Back to question
          </button>
        </>
      )}
    </div>
  )
}

/** Read-only view of an answered card. */
export function PastCard({ card }: { card: Card }) {
  return (
    <div className="past-card">
      <div className="q-prompt">
        <span className="q-label">Term</span>
        <RichText text={card.term} />
        <CardImage id={card.termImage} className="face-img" />
      </div>
      <div className="past-answer">
        <span className="q-label">Answer</span>
        <RichText text={card.definition} mark={card.keyword} />
        <CardImage id={card.defImage} className="face-img" />
        {card.notes && <RichText className="notes" text={card.notes} />}
      </div>
      <CardTools key={card.id} card={card} />
      <HookPanel key={`h-${card.id}`} card={card} />
    </div>
  )
}
