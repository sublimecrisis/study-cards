import { useLiveQuery } from 'dexie-react-hooks'
import { useDeferredValue, useState } from 'react'
import { Link } from 'react-router-dom'
import CardRow from '../CardRow'
import { db } from '../db'

const LIMIT = 100

export default function SearchPage() {
  const [q, setQ] = useState('')
  const query = useDeferredValue(q.trim().toLowerCase())
  const result = useLiveQuery(async () => {
    if (query.length < 2) return null
    const sets = new Map((await db.sets.toArray()).filter((s) => !s.deleted).map((s) => [s.id, s]))
    const courses = new Map((await db.courses.toArray()).map((c) => [c.id, c]))
    const hits = await db.cards
      .filter(
        (c) =>
          !c.deleted &&
          sets.has(c.setId) &&
          (c.term.toLowerCase().includes(query) || c.definition.toLowerCase().includes(query) || c.notes.toLowerCase().includes(query)),
      )
      .toArray()
    return { hits, sets, courses }
  }, [query])

  return (
    <>
      <h1>Search</h1>
      <input className="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every card…" type="search" />
      {result && (
        <p className="muted">
          {result.hits.length === 0 ? 'No matches.' : `${result.hits.length} matches${result.hits.length > LIMIT ? ` (showing ${LIMIT})` : ''}`}
        </p>
      )}
      <div className="cards">
        {result?.hits.slice(0, LIMIT).map((c) => {
          const s = result.sets.get(c.setId)!
          return (
            <CardRow
              key={c.id}
              card={c}
              context={
                <Link to={`/set/${s.id}`}>
                  {result.courses.get(s.courseId)?.name} › {s.name}
                </Link>
              }
            />
          )
        })}
      </div>
    </>
  )
}
