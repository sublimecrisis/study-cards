import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ProgressBar } from '../components'
import { addCourse, db } from '../db'
import { breakdown, estMinutes, getSettings, loadDayStats } from '../stats'
import { daysUntil } from '../exam'
import { bedtimeCards, bedtimeDoneToday, isBedtime } from '../bedtime'
import { startOfDay } from '../srs'
import { scopeQuery } from '../scope'
import type { Card } from '../types'

export default function Home() {
  const data = useLiveQuery(async () => {
    const courses = (await db.courses.toArray()).filter((c) => !c.deleted).sort((a, b) => a.createdAt - b.createdAt)
    const sets = (await db.sets.toArray()).filter((s) => !s.deleted)
    const setCourse = new Map(sets.map((s) => [s.id, s.courseId]))
    const byCourse = new Map<string, Card[]>()
    await db.cards.each((c) => {
      const cid = setCourse.get(c.setId)
      if (c.deleted || !cid) return
      if (!byCourse.has(cid)) byCourse.set(cid, [])
      byCourse.get(cid)!.push(c)
    })
    const rows = courses.map((c) => ({
      ...c,
      sets: sets.filter((s) => s.courseId === c.id).length,
      b: breakdown(byCourse.get(c.id) ?? []),
      essentials: (byCourse.get(c.id) ?? []).some((x) => x.tags.includes('essentials')),
    }))
    const active = rows.filter((c) => !c.archived)
    const [settings, day] = await Promise.all([getSettings(), loadDayStats()])
    const due = active.reduce((n, c) => n + c.b.due, 0)
    const unseen = active.reduce((n, c) => n + c.b.new, 0)
    const freshToday = Math.min(unseen, Math.max(0, settings.newPerDay - day.newToday))
    const exams = rows.filter((c) => c.examDate && daysUntil(c.examDate) >= 0).sort((a, b) => a.examDate! - b.examDate!)
    const activeCards = active.flatMap((c) => byCourse.get(c.id) ?? [])
    const tonight = isBedtime() ? bedtimeCards(activeCards, await db.reviews.where('at').above(startOfDay(Date.now())).toArray()).length : 0
    return { rows, due, freshToday, settings, day, exams, tonight }
  })
  const [name, setName] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  if (!data) return null
  const { rows, due, freshToday, settings, day, exams, tonight } = data
  const visible = rows.filter((c) => showArchived || !c.archived)
  const archivedCount = rows.filter((c) => c.archived).length
  const goalPct = Math.min(100, (day.studiedToday / settings.dailyGoal) * 100)

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await addCourse(name)
    setName('')
  }

  return (
    <>
      {exams.map((c) => {
        const d = daysUntil(c.examDate!)
        return (
          <div key={c.id} className="exam-chip">
            <Link to={`/course/${c.id}`}>
              🎯 <b>{c.name}</b> exam {d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`}
            </Link>
            <span className="exam-chip-actions">
              {/* Same as the course page's Exam review: Essentials only when the course has them. */}
              <Link to={`/study/review?${scopeQuery({ kind: 'course', id: c.id, filter: c.essentials ? 'tag:essentials' : 'all' })}`} className="btn small primary">
                Exam review
              </Link>
              <Link to={`/exam?${scopeQuery({ kind: 'course', id: c.id, filter: 'all' })}`} className="btn small">
                Practice exam
              </Link>
            </span>
          </div>
        )
      })}
      {rows.length > 0 && (
        <section className="today">
          <div className="today-main">
            <div className="muted small">Today</div>
            <div className="today-num">
              {due + freshToday > 0 ? (
                <>
                  {due} due{freshToday ? <span className="muted"> + {freshToday} new</span> : null}
                </>
              ) : (
                'All caught up'
              )}
            </div>
            {due + freshToday > 0 && <div className="muted small">about {estMinutes(due, freshToday)} min</div>}
            {due + freshToday > 0 && (
              <Link to="/study/review?scope=all" className="btn primary">
                Start review
              </Link>
            )}
            {tonight > 0 &&
              (bedtimeDoneToday() ? (
                <span className="bedtime-done muted small">✓ Before bed done</span>
              ) : (
                <Link to="/study/review?scope=all&filter=tonight" className="btn bedtime">
                  🌙 Before bed · {tonight} cards
                </Link>
              ))}
          </div>
          <div className="today-stats">
            <div className="stat">
              <span className="stat-num">🔥 {day.streak}</span>
              <span className="muted small">day streak</span>
            </div>
            <div className="stat goal">
              <span className="stat-num">
                {day.studiedToday}/{settings.dailyGoal}
              </span>
              <span className="muted small">daily goal{day.studiedToday >= settings.dailyGoal ? ' ✓' : ''}</span>
              <span className="goal-bar">
                <span style={{ width: `${goalPct}%` }} />
              </span>
            </div>
            <div className="stat">
              <span className="stat-num">{day.minutesToday}</span>
              <span className="muted small">min today</span>
            </div>
          </div>
        </section>
      )}
      <h1>Your courses</h1>
      {rows.length === 0 && (
        <div className="empty">
          <p>No courses yet. Create one below, or bring in cards you already have.</p>
          <Link to="/import" className="btn primary">
            Import cards
          </Link>
        </div>
      )}
      <div className="grid">
        {visible.map((c) => (
          <Link key={c.id} to={`/course/${c.id}`} className="tile" style={{ borderTopColor: c.color }}>
            <div className="tile-title">{c.name}</div>
            <div className="muted small">
              {c.sets} {c.sets === 1 ? 'set' : 'sets'} · {c.b.total.toLocaleString()} cards
              {c.b.due ? ` · ${c.b.due} due` : ''}
              {c.archived ? ' · archived' : ''}
            </div>
            <ProgressBar b={c.b} compact />
            <div className="muted small">
              {Math.round(((c.b.mastered + c.b.familiar) / Math.max(1, c.b.total)) * 100)}% familiar or better
            </div>
          </Link>
        ))}
      </div>
      <form onSubmit={create} className="row-form">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New course name (e.g. Biology 101)" />
        <button className="btn primary" disabled={!name.trim()}>
          Add course
        </button>
      </form>
      {archivedCount > 0 && (
        <button className="btn link" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? 'Hide' : 'Show'} {archivedCount} archived
        </button>
      )}
    </>
  )
}
