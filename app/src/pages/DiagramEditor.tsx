import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { addCards, addImage, db, deleteCard, newId, updateCard } from '../db'
import { shrinkImage, useImageUrl } from '../rich'
import type { Box, ID } from '../types'

interface Part {
  key: string
  cardId?: ID
  box: Box
  label: string
}

const clamp = (v: number) => Math.max(0, Math.min(1, v))

/**
 * "Label the diagram" editor: drag boxes over the parts of an image to hide, type
 * what each one is. Every box becomes its own card (with its own review schedule).
 */
export default function DiagramEditor() {
  const { id: setId = '', group: groupParam } = useParams()
  const nav = useNavigate()
  const [group] = useState(groupParam ?? newId())
  const [title, setTitle] = useState('Label the diagram')
  const [imageId, setImageId] = useState<ID | null>(null)
  const [parts, setParts] = useState<Part[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<Box | null>(null)
  const [busy, setBusy] = useState(false)
  const [removed, setRemoved] = useState<ID[]>([])
  const url = useImageUrl(imageId)
  const frame = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const labelInputs = useRef(new Map<string, HTMLInputElement>())

  // Editing an existing diagram: load its cards.
  useEffect(() => {
    if (!groupParam) return
    db.cards
      .where('setId')
      .equals(setId)
      .filter((c) => !c.deleted && c.occlusion?.group === groupParam)
      .toArray()
      .then((cards) => {
        if (!cards.length) return
        setTitle(cards[0].term)
        setImageId(cards[0].termImage)
        setParts(cards.sort((a, b) => a.position - b.position).map((c) => ({ key: c.id, cardId: c.id, box: c.occlusion!.box, label: c.definition })))
      })
  }, [groupParam, setId])

  const point = (e: React.PointerEvent) => {
    const r = frame.current!.getBoundingClientRect()
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) }
  }
  const down = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).dataset.part) return // clicking an existing box selects it instead
    try {
      e.currentTarget.setPointerCapture(e.pointerId) // keep tracking if the finger leaves the image
    } catch {
      /* not supported for this pointer */
    }
    start.current = point(e)
    setDraft({ ...start.current, w: 0, h: 0 })
  }
  const move = (e: React.PointerEvent) => {
    if (!start.current) return
    const p = point(e)
    const s = start.current
    setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
  }
  const up = () => {
    if (draft && draft.w > 0.01 && draft.h > 0.01) {
      const key = newId()
      setParts((ps) => [...ps, { key, box: draft, label: '' }])
      setSelected(key)
      setTimeout(() => labelInputs.current.get(key)?.focus(), 0)
    }
    start.current = null
    setDraft(null)
  }

  const pick = async (file?: File) => {
    if (!file) return
    setImageId(await addImage(await shrinkImage(file)))
  }

  const remove = (p: Part) => {
    if (p.cardId) setRemoved((r) => [...r, p.cardId!])
    setParts((ps) => ps.filter((x) => x.key !== p.key))
  }

  const ready = imageId && parts.length > 0 && parts.every((p) => p.label.trim())
  const save = async () => {
    if (!ready) return
    setBusy(true)
    const all = parts.map((p) => p.box)
    const norm = (t: string) => t.trim().toLowerCase()
    for (const cardId of removed) await deleteCard(cardId)
    for (const [i, p] of parts.entries()) {
      const same = parts.filter((q, k) => k !== i && norm(q.label) === norm(p.label)).map((q) => q.box)
      const occlusion = { group, box: p.box, others: all.filter((_, k) => k !== i), same }
      if (p.cardId) await updateCard(p.cardId, { term: title.trim(), definition: p.label.trim(), termImage: imageId, occlusion })
      else await addCards(setId, [{ term: title.trim(), definition: p.label.trim(), termImage: imageId, occlusion, tags: ['diagram'] }])
    }
    nav(`/set/${setId}`)
  }

  const pct = (b: Box) => ({ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` })

  return (
    <div className="study">
      <Link to={`/set/${setId}`} className="crumb">
        ← Back to set
      </Link>
      <h1>{groupParam ? 'Edit diagram' : 'New diagram'}</h1>
      <p className="muted small">
        Drag a box over each part you want to be quizzed on (cover its label), then type what it is. Each box becomes its own card.
      </p>
      <input className="search" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Diagram title, e.g. Label the heart" />
      {!url ? (
        <span className="btn primary file-btn">
          🖼 Choose image
          <input type="file" accept="image/*" onChange={(e) => pick(e.target.files?.[0])} />
        </span>
      ) : (
        <div className="dg-editor" ref={frame} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
          <img src={url} alt="" draggable={false} />
          {parts.map((p, i) => (
            <span
              key={p.key}
              data-part="1"
              className={`dg-box ${selected === p.key ? 'sel' : ''}`}
              style={pct(p.box)}
              onPointerDown={() => (setSelected(p.key), labelInputs.current.get(p.key)?.focus())}
            >
              {i + 1}
            </span>
          ))}
          {draft && <span className="dg-box drafting" style={pct(draft)} />}
        </div>
      )}
      {parts.length > 0 && (
        <ol className="dg-parts">
          {parts.map((p) => (
            <li key={p.key} className={selected === p.key ? 'sel' : ''}>
              <input
                ref={(el) => {
                  if (el) labelInputs.current.set(p.key, el)
                  else labelInputs.current.delete(p.key)
                }}
                value={p.label}
                placeholder="What is this part?"
                onFocus={() => setSelected(p.key)}
                onChange={(e) => setParts((ps) => ps.map((x) => (x.key === p.key ? { ...x, label: e.target.value } : x)))}
              />
              <button className="btn icon danger" title="Remove box" onClick={() => remove(p)}>
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="actions">
        {url && (
          <span className="btn file-btn">
            Replace image
            <input type="file" accept="image/*" onChange={(e) => pick(e.target.files?.[0])} />
          </span>
        )}
        <button className="btn primary" disabled={!ready || busy} onClick={save}>
          {busy ? 'Saving…' : `Save ${parts.length || ''} ${parts.length === 1 ? 'card' : 'cards'}`}
        </button>
      </div>
    </div>
  )
}
