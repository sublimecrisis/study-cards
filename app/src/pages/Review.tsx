import CardTools from '../CardTools'
import HookPanel from '../HookPanel'
import { ChapterChip, useChapter } from '../chapters'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Kbd, SessionBar } from '../components'
import WhyPanel from '../WhyPanel'
import { CardImage, RichText } from '../rich'
import Diagram from '../Diagram'
import { interleave, loadCoursePools, loadScope, readScope } from '../scope'
import { isDue, preview, Rating, rate } from '../srs'
import { getSettings, loadDayStats, saveSettings } from '../stats'
import { makeQuestion, type Question } from '../quizgen'
import QuestionView from '../QuestionView'
import { autoGrade, expectedMs, isStrong, paceFrom, REASON_LABEL } from '../grade'
import type { Card } from '../types'
import type { Grade } from 'ts-fsrs'
import { daysUntil, examBoost } from '../exam'
import { db } from '../db'
import { loadPairs, partnerMap, partnerOf } from '../confusions'

const BUTTONS: { r: Grade; label: string; cls: string }[] = [
  { r: Rating.Again, label: 'Again', cls: 'again' },
  { r: Rating.Hard, label: 'Hard', cls: 'hard' },
  { r: Rating.Good, label: 'Good', cls: 'good' },
  { r: Rating.Easy, label: 'Easy', cls: 'easy' },
]

export function Side({ card, side, revealed }: { card: Card; side: 'term' | 'definition'; revealed?: boolean }) {
  return (
    <div className="face-content">
      <RichText text={side === 'term' ? card.term : card.definition} mark={side === 'definition' ? card.keyword : undefined} />
      {card.occlusion ? (
        <Diagram card={card} revealed={revealed ?? side === 'definition'} />
      ) : (
        <CardImage id={side === 'term' ? card.termImage : card.defImage} className="face-img" />
      )}
      {side === 'definition' && card.notes && <RichText className="notes" text={card.notes} />}
    </div>
  )
}

export default function Review() {
  const [params] = useSearchParams()
  const scope = readScope(params)
  const [queue, setQueue] = useState<Card[] | null>(null)
  const [label, setLabel] = useState('')
  const [boost, setBoost] = useState<{ on: boolean; ids: Set<string> }>({ on: false, ids: new Set() })
  const [shown, setShown] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const started = useRef(Date.now())
  const [style, setStyle] = useState<'flip' | 'mc'>('mc')
  const [poolOf, setPoolOf] = useState<((c: Card) => Card[]) | null>(null)
  const [pace, setPace] = useState(0)
  const [seq, setSeq] = useState(0) // bumps per answer so a re-asked card gets a fresh question
  const [note, setNote] = useState<string | null>(null)
  const [partners, setPartners] = useState<Map<string, string[]>>(new Map())

  useEffect(() => {
    ;(async () => {
      const { cards, label, sets } = await loadScope(scope)
      const [settings, day] = await Promise.all([getSettings(), loadDayStats()])
      const due = cards.filter((c) => isDue(c)).sort((a, b) => a.srs!.due - b.srs!.due)
      // Exam boost: for courses with an upcoming exam, pull forward cards that would fade by exam day.
      const exams = new Map((await db.courses.toArray()).filter((c) => c.examDate && daysUntil(c.examDate) >= 0).map((c) => [c.id, c.examDate!]))
      const setCourse = new Map([...sets.values()].map((s) => [s.id, s.courseId]))
      const boosted: Card[] = []
      if (settings.examBoost) for (const [courseId, exam] of exams) boosted.push(...examBoost(cards.filter((c) => setCourse.get(c.setId) === courseId && !c.occlusion), exam))
      due.push(...boosted.slice(0, 150))
      setBoost({ on: settings.examBoost && exams.size > 0, ids: new Set(boosted.slice(0, 150).map((c) => c.id)) })
      const fresh = interleave(cards.filter((c) => !c.srs || c.srs.state === 0)).slice(0, Math.max(0, settings.newPerDay - day.newToday))
      // Mix new cards in among reviews rather than all at the end.
      const q: Card[] = []
      const step = fresh.length ? Math.max(1, Math.floor(due.length / fresh.length)) : 0
      let n = 0
      due.forEach((c, i) => {
        q.push(c)
        if (step && (i + 1) % step === 0 && n < fresh.length) q.push(fresh[n++])
      })
      q.push(...fresh.slice(n))
      // Multiple choice: wrong options come from the card's whole course (see loadCoursePools).
      const pools = await loadCoursePools()
      setPoolOf(() => pools)
      setPace(paceFrom(await db.reviews.where('at').above(Date.now() - 30 * 86_400_000).toArray()))
      setStyle(settings.reviewStyle)
      setPartners(partnerMap(await loadPairs()))
      if (scope.filter === 'tonight') {
        q.splice(0, q.length, ...cards) // before bed: just these, nothing new or boosted
        setBoost({ on: false, ids: new Set() })
      }
      setQueue(q)
      setTotal(q.length)
      setLabel(label)
      started.current = Date.now()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()])

  const card = queue?.[0]
  const ch = useChapter(card?.setId ?? '')
  const q: Question | null = useMemo(
    () => {
      if (!card || style !== 'mc' || !poolOf) return null
      const pool = poolOf(card)
      return makeQuestion(card, pool, 'mc', 'both', { hard: isStrong(card), partner: partnerOf(card, partners, pool) })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card?.id, seq, style, poolOf],
  )
  const answer = async (r: Grade) => {
    if (!card || !shown) return
    advance(card, await rate(card, r, Date.now() - started.current))
  }
  /** Multiple choice: the app picks the rating (grade.ts), you only answer. */
  const answerMc = async (correct: boolean, guessed = false, ms = 0) => {
    if (!card || !q) return
    const drill = q.type === 'order' || q.type === 'match'
    const chars = drill ? undefined : questionChars(q)
    const g = autoGrade({ correct, guessed, ms, expectedMs: chars ? expectedMs(chars, pace) : undefined })
    const srs = await rate(card, g.rating, ms, { qtype: drill ? (q.type as 'order' | 'match') : 'mc', chars, correct: correct && !guessed })
    setNote(`Next review ${when(srs.due)}: ${REASON_LABEL[g.reason]}.`)
    advance(card, srs)
  }
  const advance = (card: Card, srs: NonNullable<Card['srs']>) => {
    setShown(false)
    setSeq((n) => n + 1)
    started.current = Date.now()
    setQueue((q) => {
      const rest = q!.slice(1)
      // Still in short-term learning (due within ~20 min)? See it again this session.
      if (srs.due < Date.now() + 20 * 60_000) return [...rest, { ...card, srs }]
      setDone((d) => d + 1)
      return rest
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (style === 'mc' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (!shown) setShown(true)
      } else if (shown && ['1', '2', '3', '4'].includes(e.key)) answer(Number(e.key) as Grade)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!queue) return null
  const back = scope.kind === 'set' ? `/set/${scope.id}` : scope.kind === 'course' ? `/course/${scope.id}` : '/'

  if (!card)
    return (
      <div className="study">
        <Link to={back} className="crumb">← Back</Link>
        <div className="done-box">
          <div className="big">✓</div>
          <h1>{total ? 'Review done for today' : 'Nothing due right now'}</h1>
          <p className="muted">
            {total ? `${done} cards reviewed in ${label}.` : `${label}: no cards are due and no new cards are left for today.`} Come back tomorrow — the
            schedule spaces cards out so you see each one just before you'd forget it.
          </p>
          <div className="actions">
            <Link className="btn primary" to={`/quiz?${params}`}>Take a quick quiz</Link>
            <Link className="btn" to={`/study/learn?${params}`}>Learn mode</Link>
          </div>
        </div>
      </div>
    )

  const iv = shown ? preview(card) : null
  return (
    <div className="study">
      <div className="study-head">
        <Link to={back} className="crumb">← {label}</Link>
        <span className="muted small">
          {boost.on && <span className="boost-pill" title="Exam boost is adding cards you'd likely forget by exam day">⚡ Boost on</span>} {queue.length} left
        </span>
      </div>
      <SessionBar done={done} total={total} />
      <div className="chips review-style">
        {(['mc', 'flip'] as const).map((k) => (
          <button
            key={k}
            className={`chip ${style === k ? 'on' : ''}`}
            onClick={() => {
              setStyle(k)
              setShown(false)
              setNote(null)
              void saveSettings({ reviewStyle: k })
            }}
          >
            {k === 'mc' ? 'Multiple choice' : 'Flip cards'}
          </button>
        ))}
      </div>
      {style === 'mc' ? (
        <>
          {note && <p className="muted small review-note">{note}</p>}
          {card.srs ? null : <span className="badge inline">New</span>}
          {boost.ids.has(card.id) && <span className="badge boost inline">⚡ Exam boost</span>}
          {q && <QuestionView key={`${card.id}-${seq}`} q={q} onAnswer={answerMc} />}
        </>
      ) : (
        <>
      <div className={`face ch-stripe ${shown ? 'revealed' : ''}`} style={ch ? { borderLeftColor: `var(--ch-${ch.slot})` } : undefined} onClick={() => setShown(true)}>
        {card.srs ? null : <span className="badge">New</span>}
        {boost.ids.has(card.id) && <span className="badge boost">⚡ Exam boost</span>}
        <div className="face-chapter">
          <ChapterChip setId={card.setId} />
        </div>
        <Side card={card} side="term" revealed={shown} />
        {shown && (
          <>
            <hr />
            {card.occlusion ? <RichText text={card.definition} className="dg-answer" /> : <Side card={card} side="definition" />}
          </>
        )}
      </div>
      <CardTools key={card.id} card={card} />
      {shown && <HookPanel key={`h-${card.id}`} card={card} />}
      {shown && (
        <div onClick={(e) => e.stopPropagation()}>
          <WhyPanel key={card.id} card={card} answerSide="definition" compact />
        </div>
      )}
      {!shown ? (
        <button className="btn primary wide" onClick={() => setShown(true)}>
          Show answer <Kbd>Space</Kbd>
        </button>
      ) : (
        <div className="rate">
          {BUTTONS.map((b, i) => (
            <button key={b.r} className={`rate-btn ${b.cls}`} onClick={() => answer(b.r)}>
              <span>{b.label}</span>
              <small>{iv![b.r]}</small>
              <Kbd>{i + 1}</Kbd>
            </button>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  )
}

/** Characters you read for a multiple-choice question (prompt + options), for the pace model. */
function questionChars(q: Question) {
  const prompt = q.promptSide === 'term' ? q.card.term : q.card.definition
  return prompt.length + (q.options ?? []).reduce((n, o) => n + o.length, 0)
}

function when(due: number) {
  const ms = due - Date.now()
  if (ms < 3_600_000) return `in ${Math.max(1, Math.round(ms / 60_000))} min`
  const days = Math.round(ms / 86_400_000)
  return days < 1 ? `in ${Math.round(ms / 3_600_000)} h` : days === 1 ? 'tomorrow' : `in ${days} days`
}
