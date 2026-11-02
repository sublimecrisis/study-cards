import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { activePairs, FIXED_AFTER, loadPairs } from '../confusions'
import { db } from '../db'
import { RichText } from '../rich'

/** Cards you've mixed up, side by side, with a drill that practices exactly these. */
export default function Mixed() {
  const data = useLiveQuery(async () => {
    const pairs = activePairs(await loadPairs())
    const ids = [...new Set(pairs.flatMap((p) => [p.a, p.b]))]
    const cards = new Map((await db.cards.bulkGet(ids)).filter((c) => c && !c.deleted).map((c) => [c!.id, c!]))
    return { pairs: pairs.filter((p) => cards.has(p.a) && cards.has(p.b)), cards }
  })
  if (!data) return null
  const { pairs, cards } = data

  return (
    <div className="mixed-page">
      <h1>Mixed up</h1>
      <p className="muted small">
        Pairs of cards where you picked one's answer for the other. Each pair stays here until you get either card right {FIXED_AFTER} times in a row.
        Until then, the other card is always one of the options when either comes up.
      </p>
      {pairs.length ? (
        <>
          <div className="actions">
            <Link className="btn primary" to="/study/learn?scope=all&filter=mixed">
              {pairs.length === 1 ? 'Drill this pair' : `Drill all ${pairs.length} pairs`}
            </Link>
            <Link className="btn" to="/study/review?scope=all&filter=mixed">
              Review them
            </Link>
          </div>
          <ul className="pair-list">
            {pairs.map((p) => {
              const [x, y] = [cards.get(p.a)!, cards.get(p.b)!]
              return (
                <li key={p.a + p.b} className="panel pair">
                  <div className="pair-meta muted small">
                    Mixed up {p.count}× · {p.streak}/{FIXED_AFTER} right in a row
                  </div>
                  <div className="pair-cols">
                    {[x, y].map((c) => (
                      <div key={c.id} className="pair-card">
                        <div className="pair-term">
                          <RichText text={c.term} />
                        </div>
                        <RichText text={c.definition} />
                      </div>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <p className="panel">Nothing mixed up right now. When you pick another card's answer in a multiple-choice question, the pair shows up here.</p>
      )}
    </div>
  )
}
