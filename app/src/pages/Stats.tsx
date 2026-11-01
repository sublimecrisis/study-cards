import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ColumnChart, ScoreChart, type Col } from '../components'
import { db } from '../db'
import { startOfDay, statusOf } from '../srs'

const DAY = 86_400_000
const short = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const pct = (x: number) => `${Math.round(x * 100)}%`

/** Progress over time: study time, upcoming reviews, accuracy by chapter, practice exams. */
export default function Stats() {
  const [courseId, setCourseId] = useState<string>('all')
  const data = useLiveQuery(async () => {
    const [courses, sets, cards, reviews, quizzes] = await Promise.all([
      db.courses.filter((c) => !c.deleted).toArray(),
      db.sets.filter((s) => !s.deleted).toArray(),
      db.cards.filter((c) => !c.deleted).toArray(),
      db.reviews.where('at').above(Date.now() - 60 * DAY).toArray(),
      db.quizzes.orderBy('at').toArray(),
    ])
    return { courses, sets, cards, reviews, quizzes }
  })
  if (!data) return null

  const { courses, sets } = data
  const today = startOfDay(Date.now())
  const setCourse = new Map(sets.map((s) => [s.id, s.courseId]))
  const inCourse = (setId: string) => courseId === 'all' || setCourse.get(setId) === courseId
  const cards = data.cards.filter((c) => inCourse(c.setId))
  const reviews = data.reviews.filter((r) => inCourse(r.setId))
  const courseSetIds = new Set(sets.filter((s) => inCourse(s.id)).map((s) => s.id))
  const exams = data.quizzes.filter((q) => q.label.startsWith('Practice exam') && (courseId === 'all' || q.scope.includes(courseId)))

  // Headline numbers: last 7 days
  const week = reviews.filter((r) => r.at >= today - 6 * DAY)
  const weekMin = Math.round(week.reduce((n, r) => n + r.ms, 0) / 60_000)
  const weekAcc = week.length ? week.filter((r) => r.correct).length / week.length : 0
  const activeDays = new Set(week.map((r) => startOfDay(r.at))).size

  // Minutes studied per day, last 14 days
  const minutes: Col[] = Array.from({ length: 14 }, (_, k) => {
    const d = today - (13 - k) * DAY
    const day = reviews.filter((r) => r.at >= d && r.at < d + DAY)
    const m = Math.round(day.reduce((n, r) => n + r.ms, 0) / 60_000)
    return {
      key: String(d),
      tick: k === 13 ? 'Today' : short(d),
      value: m,
      tip: (
        <>
          {short(d)} · <b>{m} min</b> · {day.length} answers
        </>
      ),
    }
  })

  // Reviews coming due, next 30 days (today includes anything overdue)
  const due = new Array(30).fill(0)
  for (const c of cards) {
    if (statusOf(c) === 'new' || c.occlusion) continue
    const k = Math.max(0, Math.floor((startOfDay(c.srs!.due) - today) / DAY))
    if (k < 30) due[k]++
  }
  const forecast: Col[] = due.map((n, k) => ({
    key: String(k),
    tick: k === 0 ? 'Today' : short(today + k * DAY),
    value: n,
    tip: (
      <>
        {k === 0 ? 'Today (incl. overdue)' : short(today + k * DAY)} · <b>{n}</b> reviews due
      </>
    ),
  }))

  // Accuracy by chapter: last 14 days vs the 14 before
  const recent = today - 13 * DAY
  const before = recent - 14 * DAY
  const chapters = sets
    .filter((s) => courseSetIds.has(s.id))
    .map((s) => {
      const rs = reviews.filter((r) => r.setId === s.id && r.mode !== 'flashcards')
      const now = rs.filter((r) => r.at >= recent)
      const then = rs.filter((r) => r.at >= before && r.at < recent)
      const acc = (xs: typeof rs) => (xs.length ? xs.filter((r) => r.correct).length / xs.length : null)
      return { s, n: now.length, acc: acc(now), prev: acc(then) }
    })
    .sort((a, b) => a.s.name.localeCompare(b.s.name, undefined, { numeric: true }))
  const tried = chapters.filter((c) => c.acc !== null)

  return (
    <div className="stats-page">
      <h1>Stats</h1>
      <div className="chips">
        <button className={`chip ${courseId === 'all' ? 'on' : ''}`} onClick={() => setCourseId('all')}>
          All courses
        </button>
        {courses.map((c) => (
          <button key={c.id} className={`chip ${courseId === c.id ? 'on' : ''}`} onClick={() => setCourseId(c.id)}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="stat-tiles">
        <div className="stat-tile">
          <div className="stat-num">{weekMin} min</div>
          <div className="muted small">studied, last 7 days</div>
        </div>
        <div className="stat-tile">
          <div className="stat-num">{week.length ? pct(weekAcc) : '—'}</div>
          <div className="muted small">accuracy, {week.length} answers</div>
        </div>
        <div className="stat-tile">
          <div className="stat-num">{activeDays} / 7</div>
          <div className="muted small">days studied</div>
        </div>
      </div>

      <ColumnChart title="Time studied" sub="minutes per day, last 14 days" cols={minutes} fmt={(v) => `${Math.round(v)}`} table={['Day', 'Minutes']} />
      <ColumnChart title="Reviews coming up" sub="cards due per day, next 30 days" cols={forecast} fmt={(v) => `${Math.round(v)}`} table={['Day', 'Due']} />

      <section className="chart">
        <strong>Accuracy by chapter</strong> <span className="muted small">last 14 days · change vs the 14 before</span>
        {tried.length ? (
          <ul className="exam-sets acc-sets">
            {tried.map(({ s, n, acc, prev }) => {
              const delta = prev === null ? null : Math.round((acc! - prev) * 100)
              return (
                <li key={s.id}>
                  <Link to={`/set/${s.id}`}>{s.name}</Link>
                  <span className="mini-bar">
                    <span style={{ width: pct(acc!) }} />
                  </span>
                  <span className="small">
                    <b>{pct(acc!)}</b>{' '}
                    <span className="muted">
                      · {n}
                      {delta !== null && delta !== 0 && <> · {delta > 0 ? `▲ ${delta}` : `▼ ${-delta}`}</>}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="muted small">No answers in the last 14 days yet.</p>
        )}
        {chapters.length > tried.length && <p className="muted small">{chapters.length - tried.length} chapters not studied in the last 14 days.</p>}
      </section>

      {exams.length ? (
        <ScoreChart results={exams} title="Practice exam scores" />
      ) : (
        <section className="chart">
          <strong>Practice exam scores</strong>
          <p className="muted small">Take a practice exam from a course page to start your score trend.</p>
        </section>
      )}
    </div>
  )
}
