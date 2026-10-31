import { updateCard } from './db'
import { CardImage, RichText } from './rich'
import { STATUS_LABEL, statusOf } from './srs'
import type { Card } from './types'

/** Read-only card line used in set lists and search results. */
export default function CardRow({ card, context }: { card: Card; context?: React.ReactNode }) {
  return (
    <div className={`card-row ${card.needsCheck ? 'flagged' : ''}`}>
      <div className="card-side term">
        <RichText text={card.term} />
        {statusOf(card) !== 'new' && (
          <span className="status small">
            <i className={`swatch seg-${statusOf(card)}`} /> {STATUS_LABEL[statusOf(card)]}
          </span>
        )}
        <CardImage id={card.termImage} />
      </div>
      <div className="card-side def">
        <RichText text={card.definition} />
        <CardImage id={card.defImage} />
        {card.notes && <RichText className="notes" text={card.notes} />}
        {card.needsCheck ? (
          <div className="check-banner">
            ⚠ Needs checking against your textbook.{' '}
            <button className="btn link" onClick={() => updateCard(card.id, { needsCheck: 0 })}>
              Mark checked
            </button>
          </div>
        ) : null}
        {context && <div className="muted small">{context}</div>}
      </div>
      <button
        className={`star ${card.starred ? 'on' : ''}`}
        aria-label={card.starred ? 'Unstar' : 'Star'}
        title={card.starred ? 'Unstar' : 'Star'}
        onClick={() => updateCard(card.id, { starred: card.starred ? 0 : 1 })}
      >
        {card.starred ? '★' : '☆'}
      </button>
    </div>
  )
}
