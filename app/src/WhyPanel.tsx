import { useEffect, useRef, useState } from 'react'
import { explain, savedExplanation } from './explain'
import { RichText } from './rich'
import type { Card } from './types'

/**
 * "Why was that wrong?" — an instant, free explanation from the cards themselves
 * (what the picked answer actually describes), plus an on-demand AI explanation.
 */
export default function WhyPanel(props: {
  card: Card
  answerSide: 'term' | 'definition'
  chosen?: string
  chosenCard?: Card // the card a wrong multiple-choice / true-false answer came from
  compact?: boolean // just the AI part (the answer is already on screen)
}) {
  const { card, answerSide, chosen, chosenCard, compact } = props
  const promptSide = answerSide === 'term' ? 'definition' : 'term'
  const chosenMeans = chosenCard && chosenCard.id !== card.id ? (promptSide === 'term' ? chosenCard.term : chosenCard.definition) : undefined
  const [text, setText] = useState<string | undefined>(() => savedExplanation(card, chosen))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const box = useRef<HTMLDivElement>(null)
  // When an explanation arrives, scroll it into view (on phones it lands below the fold).
  const asked = useRef(false)
  useEffect(() => {
    if (text && asked.current) box.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [text])

  const ask = async () => {
    asked.current = true
    setBusy(true)
    setErr('')
    try {
      setText(await explain({ card, chosen, chosenMeans, answerSide }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="why">
      {chosenMeans &&
        (answerSide === 'term' ? (
          <p>
            <b>“{chosen}”</b> means something else: <RichText text={chosenMeans} />
          </p>
        ) : (
          <p>
            <b>The definition you picked</b> belongs to <RichText className="why-term" text={chosenMeans} />
          </p>
        ))}
      {!compact && (
        <>
          <p>
            <b>Correct:</b> <RichText text={card.term} /> — <RichText text={card.definition} />
          </p>
          {card.notes && <RichText className="notes" text={card.notes} />}
        </>
      )}
      {text ? (
        <div className="why-ai" ref={box}>
          <span className="why-label">✨ Explanation</span>
          <RichText text={text} />
        </div>
      ) : (
        <button className="btn small" onClick={ask} disabled={busy}>
          {busy ? 'Thinking…' : '✨ Explain why'}
        </button>
      )}
      {err && <p className="error small">{err}</p>}
    </div>
  )
}
