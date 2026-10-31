import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addCourse, addSet, db } from '../db'
import { parseCsv, parsePasted, planImport, runImport, type ImportResult, type ParsedRow, type PlannedSet } from '../importers'
import { RichText } from '../rich'

const TERM_SEPS = [
  { v: '\t', label: 'Tab (Quizlet default)' },
  { v: ',', label: 'Comma' },
  { v: ' - ', label: 'Dash ( - )' },
  { v: ':', label: 'Colon' },
  { v: 'custom', label: 'Custom…' },
]
const CARD_SEPS = [
  { v: '\n', label: 'New line (Quizlet default)' },
  { v: ';', label: 'Semicolon' },
  { v: '\n\n', label: 'Blank line' },
  { v: 'custom', label: 'Custom…' },
]

export default function ImportPage() {
  const [mode, setMode] = useState<'paste' | 'files'>('files')
  return (
    <>
      <h1>Import cards</h1>
      <div className="chips">
        <button className={`chip ${mode === 'files' ? 'on' : ''}`} onClick={() => setMode('files')}>
          CSV files / Knowt export
        </button>
        <button className={`chip ${mode === 'paste' ? 'on' : ''}`} onClick={() => setMode('paste')}>
          Paste text (Quizlet, Knowt, notes)
        </button>
      </div>
      {mode === 'files' ? <FileImport /> : <PasteImport />}
    </>
  )
}

function Result({ res }: { res: ImportResult }) {
  return (
    <div className="result">
      <strong>
        Imported {res.cards.toLocaleString()} cards{res.sets ? ` into ${res.sets} new sets` : ''}.
      </strong>
      {res.essentials > 0 && <div>{res.essentials.toLocaleString()} tagged “essentials”.</div>}
      {res.needsCheck > 0 && <div>⚠ {res.needsCheck} flagged to check against your textbook.</div>}
      {res.skipped.length > 0 && (
        <details>
          <summary>{res.skipped.length} sets skipped because they already exist</summary>
          <ul>
            {res.skipped.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </details>
      )}
      <Link to="/" className="btn primary">
        Go to courses
      </Link>
    </div>
  )
}

function Preview({ plan }: { plan: PlannedSet[] }) {
  const cards = plan.flatMap((p) => p.cards)
  const ess = cards.filter((c) => c.tags?.includes('essentials')).length
  const check = cards.filter((c) => c.needsCheck).length
  return (
    <div className="preview-box">
      <div>
        <strong>{cards.length.toLocaleString()} cards</strong> in {plan.length} {plan.length === 1 ? 'set' : 'sets'}
        {ess ? ` · ${ess.toLocaleString()} essentials` : ''}
        {check ? ` · ${check} to check` : ''}
      </div>
      <ul className="plan">
        {plan.map((p) => (
          <li key={p.course + p.set}>
            <span className="muted">{p.course} ›</span> {p.set} <span className="muted">({p.cards.length})</span>
          </li>
        ))}
      </ul>
      {cards.length > 0 && (
        <div className="sample">
          {cards.slice(0, 3).map((c, i) => (
            <div key={i} className="card-row">
              <div className="card-side term">
                <RichText text={c.term} />
              </div>
              <div className="card-side def">
                <RichText text={c.definition} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FileImport() {
  const [rows, setRows] = useState<ParsedRow[] | null>(null)
  const [fileCount, setFileCount] = useState(0)
  const [merge, setMerge] = useState(true)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')

  const plan = useMemo(() => (rows ? planImport(structuredClone(rows), merge) : []), [rows, merge])
  const hasPairs = useMemo(() => {
    const names = new Set(rows?.map((r) => r.set) ?? [])
    return [...names].some((n) => /\(essentials\)\s*$/i.test(n) && names.has(n.replace(/\(essentials\)\s*$/i, '(Full)')))
  }, [rows])

  const read = async (list: FileList | null) => {
    setRes(null)
    setError('')
    const files = [...(list ?? [])].filter((f) => /\.(csv|tsv|txt)$/i.test(f.name))
    if (!files.length) return setError('No .csv files found in that selection.')
    const all: ParsedRow[] = []
    for (const f of files) all.push(...parseCsv(await f.text(), f.webkitRelativePath || f.name))
    setFileCount(files.length)
    setRows(all)
  }

  const go = async () => {
    setBusy(true)
    try {
      setRes(await runImport(plan))
      setRows(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  if (res) return <Result res={res} />
  return (
    <>
      <p className="muted">
        Pick CSV files, or a whole folder (e.g. your Knowt export). Columns: <code>term, definition</code>, optionally{' '}
        <code>course, set, tags, notes</code>. Sets that already exist are skipped, so importing twice is safe.
      </p>
      <div className="actions">
        <span className="btn file-btn">
          Choose files
          <input type="file" accept=".csv,.tsv,.txt,text/csv" multiple onChange={(e) => read(e.target.files)} />
        </span>
        <span className="btn file-btn">
          Choose folder
          <input type="file" {...{ webkitdirectory: '' }} multiple onChange={(e) => read(e.target.files)} data-testid="folder" />
        </span>
      </div>
      {error && <p className="error">{error}</p>}
      {rows && (
        <>
          <p className="muted small">Read {fileCount} files.</p>
          {hasPairs && (
            <label className="check">
              <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} /> Merge “Essentials”
              sets into their “Full” sets (tag those cards <code>essentials</code> instead of duplicating them) — recommended
            </label>
          )}
          <Preview plan={plan} />
          <button className="btn primary" disabled={busy || !plan.length} onClick={go}>
            {busy ? 'Importing…' : `Import ${plan.reduce((n, p) => n + p.cards.length, 0).toLocaleString()} cards`}
          </button>
        </>
      )}
    </>
  )
}

function PasteImport() {
  const courses = useLiveQuery(() => db.courses.filter((c) => !c.deleted).toArray())
  const sets = useLiveQuery(() => db.sets.filter((s) => !s.deleted).toArray())
  const [text, setText] = useState('')
  const [termSep, setTermSep] = useState('\t')
  const [cardSep, setCardSep] = useState('\n')
  const [customTerm, setCustomTerm] = useState('')
  const [customCard, setCustomCard] = useState('')
  const [target, setTarget] = useState('new')
  const [courseId, setCourseId] = useState('new')
  const [courseName, setCourseName] = useState('')
  const [setName, setSetName] = useState('')
  const [res, setRes] = useState<ImportResult | null>(null)

  const ts = termSep === 'custom' ? customTerm : termSep
  const cs = cardSep === 'custom' ? customCard.replace(/\\n/g, '\n') : cardSep
  const cards = useMemo(() => parsePasted(text, ts, cs), [text, ts, cs])

  if (res) return <Result res={res} />
  if (!courses || !sets) return null

  const ready = cards.length > 0 && (target !== 'new' || (setName.trim() && (courseId !== 'new' || courseName.trim())))
  const go = async () => {
    let setId = target
    if (target === 'new') {
      const cid = courseId === 'new' ? await addCourse(courseName) : courseId
      setId = await addSet(cid, setName)
    }
    const r = await runImport([{ course: '', set: '', cards }], { setId })
    setRes({ ...r, sets: target === 'new' ? 1 : 0 })
  }

  return (
    <>
      <p className="muted">
        In Quizlet: open your set → ⋯ → Export → Copy text. In Knowt: open the set, select the terms, copy. Then paste here.
      </p>
      <textarea className="paste" value={text} onChange={(e) => setText(e.target.value)} placeholder={'term\tdefinition\nterm\tdefinition'} />
      <div className="form-grid">
        <label>
          Between term and definition
          <select value={termSep} onChange={(e) => setTermSep(e.target.value)}>
            {TERM_SEPS.map((s) => (
              <option key={s.label} value={s.v}>
                {s.label}
              </option>
            ))}
          </select>
          {termSep === 'custom' && <input value={customTerm} onChange={(e) => setCustomTerm(e.target.value)} placeholder="e.g. =" />}
        </label>
        <label>
          Between cards
          <select value={cardSep} onChange={(e) => setCardSep(e.target.value)}>
            {CARD_SEPS.map((s) => (
              <option key={s.label} value={s.v}>
                {s.label}
              </option>
            ))}
          </select>
          {cardSep === 'custom' && <input value={customCard} onChange={(e) => setCustomCard(e.target.value)} placeholder="e.g. ## (\n = new line)" />}
        </label>
        <label>
          Add to
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="new">A new set…</option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {courses.find((c) => c.id === s.courseId)?.name} › {s.name}
              </option>
            ))}
          </select>
        </label>
        {target === 'new' && (
          <>
            <label>
              Course
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="new">New course…</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {courseId === 'new' && <input value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="Course name" />}
            </label>
            <label>
              Set name
              <input value={setName} onChange={(e) => setSetName(e.target.value)} placeholder="e.g. Chapter 3 vocab" />
            </label>
          </>
        )}
      </div>
      {text.trim() && <Preview plan={[{ course: 'Preview', set: target === 'new' ? setName || 'New set' : 'Existing set', cards }]} />}
      <button className="btn primary" disabled={!ready} onClick={go}>
        Import {cards.length} cards
      </button>
    </>
  )
}
