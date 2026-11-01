import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import CardRow from '../CardRow'
import { ProgressBar, ScoreChart, StudyLauncher } from '../components'
import type { Scope } from '../scope'
import { breakdown } from '../stats'
import { weakest } from '../exam'
import { db, deleteSet, liveCards, updateSet } from '../db'
import { toCsv } from '../importers'
import { download } from '../util'

type Filter = { kind: 'all' } | { kind: 'starred' } | { kind: 'check' } | { kind: 'weak' } | { kind: 'tag'; tag: string }

export default function SetPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const set = useLiveQuery(() => db.sets.get(id), [id])
  const course = useLiveQuery(() => (set ? db.courses.get(set.courseId) : undefined), [set?.courseId])
  const cards = useLiveQuery(() => liveCards(id), [id])
  const quizzes = useLiveQuery(() => db.quizzes.where('scope').equals(`set:${id}`).sortBy('at'), [id])
  const [filter, setFilter] = useState<Filter>({ kind: 'all' })
  const weakIds = useLiveQuery(async () => {
    const cs = await liveCards(id)
    return new Set(weakest(cs, await db.reviews.where('setId').equals(id).toArray(), 40).map((c) => c.id))
  }, [id])

  // Only offer tags that narrow things down (a tag on every card isn't a useful filter).
  const tags = useMemo(() => {
    if (!cards) return []
    const n = new Map<string, number>()
    for (const c of cards) for (const t of c.tags) n.set(t, (n.get(t) ?? 0) + 1)
    return [...n].filter(([, k]) => k < cards.length).map(([t, k]) => ({ t, k })).sort((a, b) => a.t.localeCompare(b.t))
  }, [cards])

  if (set === undefined || cards === undefined) return null
  if (!set || set.deleted) return <p>Set not found. <Link to="/">Back home</Link></p>

  const shown = cards.filter((c) =>
    filter.kind === 'starred' ? c.starred : filter.kind === 'check' ? c.needsCheck : filter.kind === 'weak' ? weakIds?.has(c.id) : filter.kind === 'tag' ? c.tags.includes(filter.tag) : true,
  )
  const b = breakdown(cards)
  const studyFilter: Scope['filter'] =
    filter.kind === 'starred' ? 'starred' : filter.kind === 'check' ? 'check' : filter.kind === 'weak' ? 'weak' : filter.kind === 'tag' ? `tag:${filter.tag}` : 'all'
  const starred = cards.filter((c) => c.starred).length
  const flagged = cards.filter((c) => c.needsCheck).length
  const chip = (f: Filter, label: string) => (
    <button
      key={JSON.stringify(f)}
      className={`chip ${JSON.stringify(f) === JSON.stringify(filter) ? 'on' : ''}`}
      onClick={() => setFilter(f)}
    >
      {label}
    </button>
  )

  const rename = async () => {
    const n = prompt('Rename set', set.name)
    if (n?.trim()) await updateSet(id, { name: n.trim() })
  }
  const remove = async () => {
    if (!confirm(`Delete "${set.name}" and its ${cards.length} cards?`)) return
    await deleteSet(id)
    nav(`/course/${set.courseId}`)
  }
  const exportCsv = () =>
    download(`${set.name.replace(/[^\w-]+/g, '-').toLowerCase()}.csv`, toCsv(cards, course?.name ?? '', set.name), 'text/csv')

  return (
    <>
      <Link to={`/course/${set.courseId}`} className="crumb">
        ← {course?.name ?? 'Course'}
      </Link>
      <h1>{set.name}</h1>
      <p className="muted">
        {cards.length} cards{starred ? ` · ${starred} starred` : ''}
        {flagged ? ` · ${flagged} need checking` : ''}
      </p>
      <ProgressBar b={b} />
      {cards.length > 0 && (
        <>
          <div className="chips">
            {chip({ kind: 'all' }, `All ${cards.length}`)}
            {starred > 0 && chip({ kind: 'starred' }, `★ Starred ${starred}`)}
            {flagged > 0 && chip({ kind: 'check' }, `⚠ Needs check ${flagged}`)}
            {!!weakIds?.size && chip({ kind: 'weak' }, `⚡ Weakest ${weakIds.size}`)}
            {tags.map(({ t, k }) => chip({ kind: 'tag', tag: t }, `${t} ${k}`))}
          </div>
          <StudyLauncher base={{ kind: 'set', id }} due={filter.kind === 'all' ? b.due : breakdown(shown).due} filter={studyFilter} />
        </>
      )}
      <ScoreChart results={quizzes ?? []} />
      <div className="actions">
        <Link to={`/set/${id}/edit`} className="btn">
          Edit / add cards
        </Link>
        <Link to={`/set/${id}/diagram`} className="btn">
          + Label-the-diagram
        </Link>
        <button className="btn" onClick={rename}>
          Rename
        </button>
        <button className="btn" onClick={exportCsv} disabled={!cards.length}>
          Export CSV
        </button>
        <button className="btn danger" onClick={remove}>
          Delete
        </button>
      </div>
      {cards.length === 0 && (
        <p className="muted">
          This set is empty. <Link to={`/set/${id}/edit`}>Add cards</Link> or <Link to="/import">import some</Link>.
        </p>
      )}
      <div className="cards">
        {shown.map((c) => (
          <CardRow key={c.id} card={c} />
        ))}
      </div>
    </>
  )
}
