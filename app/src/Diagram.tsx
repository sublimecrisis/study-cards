import { useImageUrl } from './rich'
import type { Box, Card } from './types'

const pct = (b: Box) => ({ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` })

/**
 * A "label the diagram" card's image: the part being asked about is covered
 * (or, once revealed, outlined with its label); the other labelled parts stay
 * visible for context, lightly outlined.
 */
export default function Diagram({ card, revealed, className }: { card: Card; revealed?: boolean; className?: string }) {
  const url = useImageUrl(card.termImage)
  const o = card.occlusion
  if (!url || !o) return null
  return (
    <span className={`diagram ${className ?? ''}`}>
      <img src={url} alt="" />
      {o.others.map((b, i) => (
        <span key={i} className="dg-other" style={pct(b)} />
      ))}
      {!revealed && o.same?.map((b, i) => <span key={`s${i}`} className="dg-same" style={pct(b)} />)}
      <span className={`dg-target ${revealed ? 'revealed' : ''}`} style={pct(o.box)}>
        {revealed ? null : '?'}
      </span>
      {revealed && <span className="dg-label">{card.definition}</span>}
    </span>
  )
}
