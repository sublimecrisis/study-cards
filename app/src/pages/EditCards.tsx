import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { addCards, addImage, db, deleteCard, liveCards, updateCard } from '../db'
import { CardImage, RichText, shrinkImage } from '../rich'
import type { Card, ID } from '../types'

interface Row {
  key: string
  id?: ID
  term: string
  definition: string
  notes: string
  tags: string
  termImage: ID | null
  defImage: ID | null
  open: boolean
  saved: string // snapshot of what's in the DB, to skip no-op writes
}

const snap = (r: Pick<Row, 'term' | 'definition' | 'notes' | 'tags' | 'termImage' | 'defImage'>) =>
  JSON.stringify([r.term, r.definition, r.notes, r.tags, r.termImage, r.defImage])

const fromCard = (c: Card): Row => {
  const r = { key: c.id, id: c.id, term: c.term, definition: c.definition, notes: c.notes, tags: c.tags.join('; '), termImage: c.termImage, defImage: c.defImage, open: false, saved: '' }
  r.saved = snap(r)
  return r
}
let blankN = 0
const blank = (): Row => ({ key: `new-${blankN++}`, term: '', definition: '', notes: '', tags: '', termImage: null, defImage: null, open: false, saved: '' })

/** Textarea that grows with its content. */
function Grow(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { inputRef?: (el: HTMLTextAreaElement | null) => void }) {
  const { inputRef, ...rest } = props
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [props.value])
  return (
    <textarea
      rows={1}
      {...rest}
      ref={(el) => {
        ref.current = el
        inputRef?.(el)
      }}
    />
  )
}

export default function EditCards() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const set = useLiveQuery(() => db.sets.get(id), [id])
  const [rows, setRows] = useState<Row[] | null>(null)
  const rowsRef = useRef<Row[]>([])
  rowsRef.current = rows ?? []
  const focusNext = useRef<string | null>(null)
  const inputs = useRef(new Map<string, HTMLTextAreaElement>())

  useEffect(() => {
    liveCards(id).then((cards) => setRows(cards.length ? [...cards.map(fromCard), blank()] : [blank(), blank(), blank()]))
  }, [id])

  useEffect(() => {
    if (focusNext.current) {
      inputs.current.get(focusNext.current)?.focus()
      focusNext.current = null
    }
  })

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, ...p } : r)))

  // Saves run one at a time, and ids/snapshots are tracked in refs (not just state),
  // so a blur + autosave of the same new row can't create the card twice.
  const queue = useRef(Promise.resolve())
  const ids = useRef(new Map<string, ID>())
  const savedSnap = useRef(new Map<string, string>())
  const timers = useRef(new Map<string, number>())

  const save = (key: string, override?: Partial<Row>) => {
    clearTimeout(timers.current.get(key))
    queue.current = queue.current.then(() => doSave(key, override)).catch((e) => console.error('save failed', e))
    return queue.current
  }
  // Autosave shortly after typing stops, so nothing is lost if the app is closed mid-row.
  const edit = (key: string, p: Partial<Row>) => {
    patch(key, p)
    clearTimeout(timers.current.get(key))
    timers.current.set(key, window.setTimeout(() => save(key), 700))
  }

  const doSave = async (key: string, override?: Partial<Row>) => {
    const found = rowsRef.current.find((x) => x.key === key)
    if (!found) return
    const r = { ...found, ...override }
    const cardId = r.id ?? ids.current.get(key)
    const now = snap(r)
    if (now === (savedSnap.current.get(key) ?? r.saved)) return
    const fields = {
      term: r.term.trim(),
      definition: r.definition.trim(),
      notes: r.notes.trim(),
      tags: r.tags.split(/[;,]/).map((t) => t.trim()).filter(Boolean),
      termImage: r.termImage,
      defImage: r.defImage,
    }
    const empty = !fields.term && !fields.definition && !fields.termImage && !fields.defImage
    if (cardId) {
      await updateCard(cardId, fields)
    } else if (!empty) {
      const [newId] = await addCards(id, [fields])
      if (fields.termImage || fields.defImage) await updateCard(newId, { termImage: fields.termImage, defImage: fields.defImage })
      ids.current.set(key, newId)
      await reorder()
    } else return
    savedSnap.current.set(key, now)
  }

  // New cards are appended at the end; if one was inserted mid-list, renumber to match the editor.
  const reorder = async () => {
    const order = rowsRef.current.map((r) => r.id ?? ids.current.get(r.key)).filter((x): x is ID => !!x)
    const cards = await db.cards.bulkGet(order)
    const changes = cards.flatMap((c, i) => (c && c.position !== i ? [{ key: c.id, changes: { position: i, updatedAt: Date.now(), dirty: 1 as const } }] : []))
    if (changes.length) await db.cards.bulkUpdate(changes)
  }

  const saveAll = async () => {
    for (const r of rowsRef.current) await save(r.key)
  }

  // Leaving the page by any route (tab bar, back button) still saves.
  useEffect(() => () => void saveAll(), [])

  const addRow = (after?: string) => {
    const b = blank()
    focusNext.current = `${b.key}:term`
    setRows((rs) => {
      const i = after ? rs!.findIndex((r) => r.key === after) : rs!.length - 1
      return [...rs!.slice(0, i + 1), b, ...rs!.slice(i + 1)]
    })
  }

  const remove = (r: Row) => {
    clearTimeout(timers.current.get(r.key))
    queue.current = queue.current.then(async () => {
      const cardId = r.id ?? ids.current.get(r.key)
      if (cardId) await deleteCard(cardId)
    })
    setRows((rs) => {
      const left = rs!.filter((x) => x.key !== r.key)
      return left.length ? left : [blank()]
    })
  }

  const pickImage = async (r: Row, side: 'termImage' | 'defImage', file?: File) => {
    if (!file) return
    const imgId = await addImage(await shrinkImage(file))
    patch(r.key, { [side]: imgId })
    await save(r.key, { [side]: imgId })
  }

  if (set === undefined || rows === null) return null
  if (!set || set.deleted) return <p>Set not found.</p>

  const done = async () => {
    await saveAll()
    nav(`/set/${id}`)
  }

  return (
    <>
      <Link to={`/set/${id}`} className="crumb" onClick={(e) => { e.preventDefault(); done() }}>
        ← {set.name}
      </Link>
      <h1>Edit cards</h1>
      <p className="muted small">
        Tab moves to the next box; Tab on the last definition adds a card. Changes save as you go. Formulas: wrap LaTeX in
        $…$, e.g. <code>$E=mc^2$</code>.
      </p>
      <div className="editor">
        {rows.map((r, i) => {
          const last = i === rows.length - 1
          const ref = (k: string) => (el: HTMLTextAreaElement | null) => {
            if (el) inputs.current.set(`${r.key}:${k}`, el)
            else inputs.current.delete(`${r.key}:${k}`)
          }
          return (
            <div key={r.key} className="edit-row" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && save(r.key)}>
              <div className="edit-num">{i + 1}</div>
              <div className="edit-sides">
                <div className="edit-side">
                  <Grow inputRef={ref('term')} value={r.term} placeholder="Term" onChange={(e) => edit(r.key, { term: e.target.value })} />
                  <span className="edit-label">Term</span>
                  <SideImage id={r.termImage} onPick={(f) => pickImage(r, 'termImage', f)} onClear={() => { patch(r.key, { termImage: null }); save(r.key, { termImage: null }) }} />
                </div>
                <div className="edit-side">
                  <Grow
                    inputRef={ref('def')}
                    value={r.definition}
                    placeholder="Definition"
                    onChange={(e) => edit(r.key, { definition: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab' && !e.shiftKey && last && !r.open) {
                        e.preventDefault()
                        addRow()
                      }
                    }}
                  />
                  <span className="edit-label">Definition</span>
                  <SideImage id={r.defImage} onPick={(f) => pickImage(r, 'defImage', f)} onClear={() => { patch(r.key, { defImage: null }); save(r.key, { defImage: null }) }} />
                </div>
                {r.open && (
                  <div className="edit-more">
                    <div className="edit-side">
                      <Grow value={r.notes} placeholder="Notes, mnemonics, formulas" onChange={(e) => edit(r.key, { notes: e.target.value })} />
                      <span className="edit-label">Notes</span>
                    </div>
                    <div className="edit-side">
                      <Grow value={r.tags} placeholder="Tags, separated by ;" onChange={(e) => edit(r.key, { tags: e.target.value })} />
                      <span className="edit-label">Tags</span>
                    </div>
                  </div>
                )}
                {/[$]/.test(r.term + r.definition + r.notes) && (
                  <div className="preview muted small">
                    Preview: <RichText text={r.term} /> — <RichText text={r.definition} /> {r.notes && <RichText text={r.notes} />}
                  </div>
                )}
              </div>
              <div className="edit-tools">
                <button className="btn icon" title="Notes & tags" tabIndex={-1} onClick={() => patch(r.key, { open: !r.open })}>
                  ⋯
                </button>
                <button className="btn icon" title="Insert card below" tabIndex={-1} onClick={() => addRow(r.key)}>
                  +
                </button>
                <button className="btn icon danger" title="Delete card" tabIndex={-1} onClick={() => remove(r)}>
                  ✕
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <div className="actions sticky-actions">
        <button className="btn" onClick={() => addRow()}>
          + Add card
        </button>
        <button className="btn primary" onClick={done}>
          Done
        </button>
      </div>
    </>
  )
}

function SideImage({ id, onPick, onClear }: { id: ID | null; onPick: (f?: File) => void; onClear: () => void }) {
  return (
    <span className="side-image">
      {id ? (
        <>
          <CardImage id={id} className="thumb" />
          <button className="btn link small" tabIndex={-1} onClick={(e) => { e.preventDefault(); onClear() }}>
            Remove image
          </button>
        </>
      ) : (
        <span className="btn link small file-btn">
          🖼 Image
          <input type="file" accept="image/*" tabIndex={-1} onChange={(e) => onPick(e.target.files?.[0])} />
        </span>
      )}
    </span>
  )
}
