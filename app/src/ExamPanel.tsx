import { Link } from 'react-router-dom'
import { updateCourse } from './db'
import { daysUntil, examBoost, newPerDayNeeded, readiness } from './exam'
import { inExamSet, scopeQuery } from './scope'
import { isDue } from './srs'
import { saveSettings, type Settings } from './stats'
import type { Card, CardSet, Course } from './types'

const pct = (x: number) => `${Math.round(x * 100)}%`
const toInput = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const fromInput = (v: string) => {
  const [y, m, d] = v.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

/** Exam countdown + readiness + daily plan for one course. */
export default function ExamPanel({ course, sets, cards, settings }: { course: Course; sets: CardSet[]; cards: Card[]; settings: Settings }) {
  const exam = course.examDate
  const studyable = cards.filter((c) => !c.occlusion) // diagram drills are extra practice, not exam questions
  if (!exam || daysUntil(exam) < 0)
    return (
      <section className="panel exam">
        <h2>Exam date</h2>
        <p className="muted small">Set your exam date to get a countdown, a readiness score, and reviews timed to peak on exam day.</p>
        <input type="date" onChange={(e) => e.target.value && updateCourse(course.id, { examDate: fromInput(e.target.value) })} />
        {exam && <p className="muted small">Your last exam date has passed — set the next one.</p>}
      </section>
    )

  const days = daysUntil(exam)
  const ess = studyable.filter(inExamSet) // Essentials + Exam Prep
  const focus = ess.length ? ess : studyable
  const r = readiness(focus, exam)
  const dueNow = studyable.filter((c) => isDue(c)).length
  const boost = settings.examBoost ? examBoost(studyable, exam).length : 0
  const need = newPerDayNeeded(focus, exam)
  const perSet = sets
    .map((s) => {
      const cs = focus.filter((c) => c.setId === s.id)
      return { s, n: cs.length, r: readiness(cs, exam) }
    })
    .filter((x) => x.n)
    .sort((a, b) => a.s.name.localeCompare(b.s.name, undefined, { numeric: true })) // Ch 1, Ch 2 … Ch 23
  const q = scopeQuery({ kind: 'course', id: course.id, filter: ess.length ? 'exam' : 'all' })

  return (
    <section className="panel exam">
      <div className="exam-head">
        <div>
          <div className="exam-days">
            {days === 0 ? 'Exam today' : `${days} day${days === 1 ? '' : 's'}`}{' '}
            <span className={`boost-pill ${settings.examBoost ? '' : 'off'}`}>{settings.examBoost ? '⚡ Boost on' : 'Boost off'}</span>
          </div>
          <div className="muted small">
            until your exam ·{' '}
            <input
              type="date"
              className="inline-date"
              value={toInput(exam)}
              onChange={(e) => updateCourse(course.id, { examDate: e.target.value ? fromInput(e.target.value) : null })}
            />
          </div>
        </div>
        <div className="exam-ready">
          <div className="exam-pct">{pct(r)}</div>
          <div className="muted small">projected recall on exam day{ess.length ? ' (exam set: Essentials + Exam Prep)' : ''}</div>
        </div>
      </div>
      <div className="goal-bar wide">
        <span style={{ width: pct(r) }} />
      </div>

      <h3>Plan until the exam</h3>
      <ul className="exam-plan">
        <li>
          <b>{dueNow + boost}</b> reviews ready now ({dueNow} due{boost ? ` + ${boost} pulled forward so they're fresh on exam day` : ''})
        </li>
        <li>
          <b>{need}</b> new exam-set cards a day to see them all before the exam
          {need !== settings.newPerDay && (
            <>
              {' '}
              ·{' '}
              <button className="btn link small" onClick={() => saveSettings({ newPerDay: Math.min(500, need) })}>
                set my daily new cards to {Math.min(500, need)} (now {settings.newPerDay})
              </button>
            </>
          )}
        </li>
        <li>Take a practice exam every few days and drill your weakest cards.</li>
      </ul>
      <label className="check small">
        <input type="checkbox" checked={settings.examBoost} onChange={(e) => saveSettings({ examBoost: e.target.checked })} /> Exam boost: add cards
        you'd likely forget by exam day to Review
      </label>
      <div className="actions">
        <Link className="btn primary" to={`/study/review?${q}`}>
          Exam review
        </Link>
        <Link className="btn" to={`/exam?${scopeQuery({ kind: 'course', id: course.id, filter: 'all' })}`}>
          Practice exam
        </Link>
        <Link className="btn" to={`/study/learn?${scopeQuery({ kind: 'course', id: course.id, filter: 'weak' })}`}>
          Drill weakest
        </Link>
      </div>

      <details>
        <summary className="small">Readiness by chapter</summary>
        <ul className="exam-sets">
          {perSet.map(({ s, n, r: sr }) => (
            <li key={s.id}>
              <Link to={`/set/${s.id}`}>{s.name}</Link>
              <span className="mini-bar">
                <span style={{ width: pct(sr), background: sr >= 0.7 ? 'var(--right)' : sr >= 0.4 ? '#ca8a04' : 'var(--wrong)' }} />
              </span>
              <span className="muted small">
                {pct(sr)} · {n}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
