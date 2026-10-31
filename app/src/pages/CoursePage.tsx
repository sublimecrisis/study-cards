import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ProgressBar, ScoreChart, StudyLauncher } from '../components'
import { addSet, db, deleteCourse, liveSets, updateCourse } from '../db'
import type { Scope } from '../scope'
import { breakdown } from '../stats'

export default function CoursePage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const course = useLiveQuery(() => db.courses.get(id), [id])
  const data = useLiveQuery(async () => {
    const list = await liveSets(id)
    const ids = new Set(list.map((s) => s.id))
    const cards = (await db.cards.toArray()).filter((c) => !c.deleted && ids.has(c.setId))
    const sets = list.map((s) => ({ ...s, b: breakdown(cards.filter((c) => c.setId === s.id)) }))
    // Study filters: starred / needs-check if any, plus tags that split the course meaningfully (e.g. essentials).
    const tagN = new Map<string, number>()
    for (const c of cards) for (const t of c.tags) tagN.set(t, (tagN.get(t) ?? 0) + 1)
    const filters: { f: Scope['filter']; label: string }[] = [{ f: 'all', label: `All ${cards.length}` }]
    const starred = cards.filter((c) => c.starred).length
    const check = cards.filter((c) => c.needsCheck).length
    if (starred) filters.push({ f: 'starred', label: `★ Starred ${starred}` })
    for (const [t, n] of [...tagN].filter(([, n]) => n >= cards.length * 0.2 && n < cards.length).sort((a, b) => b[1] - a[1]).slice(0, 3))
      filters.push({ f: `tag:${t}`, label: `${t[0].toUpperCase()}${t.slice(1)} ${n}` })
    if (check) filters.push({ f: 'check', label: `⚠ Needs check ${check}` })
    const quizzes = await db.quizzes.where('scope').equals(`course:${id}`).sortBy('at')
    return { sets, b: breakdown(cards), filters, quizzes }
  }, [id])
  const [name, setName] = useState('')

  if (course === undefined || data === undefined) return null
  if (!course || course.deleted) return <p>Course not found. <Link to="/">Back home</Link></p>
  const { sets, b, filters, quizzes } = data

  const rename = async () => {
    const n = prompt('Rename course', course.name)
    if (n?.trim()) await updateCourse(id, { name: n.trim() })
  }
  const remove = async () => {
    if (!confirm(`Delete "${course.name}" and all ${sets.length} sets in it?`)) return
    await deleteCourse(id)
    nav('/')
  }
  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const setId = await addSet(id, name)
    nav(`/set/${setId}/edit`)
  }

  return (
    <>
      <Link to="/" className="crumb">
        ← Courses
      </Link>
      <h1>{course.name}</h1>
      <ProgressBar b={b} />
      {b.total > 0 && <StudyLauncher base={{ kind: 'course', id }} due={b.due} filters={filters} />}
      <ScoreChart results={quizzes} />
      <h2 className="section-title">Sets</h2>
      {sets.length === 0 && <p className="muted">No sets yet.</p>}
      <ul className="list">
        {sets.map((s) => (
          <li key={s.id}>
            <Link to={`/set/${s.id}`} className="list-item set-item">
              <span className="set-name">{s.name}</span>
              <span className="muted small">
                {s.b.total} cards{s.b.due ? ` · ${s.b.due} due` : ''}
              </span>
              <ProgressBar b={s.b} compact />
            </Link>
          </li>
        ))}
      </ul>
      <form onSubmit={create} className="row-form">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New set name (e.g. Chapter 4)" />
        <button className="btn primary" disabled={!name.trim()}>
          Add set
        </button>
      </form>
      <div className="actions">
        <button className="btn" onClick={rename}>
          Rename course
        </button>
        <button className="btn" onClick={() => updateCourse(id, { archived: course.archived ? 0 : 1 })}>
          {course.archived ? 'Unarchive' : 'Archive'}
        </button>
        <button className="btn danger" onClick={remove}>
          Delete
        </button>
      </div>
    </>
  )
}
