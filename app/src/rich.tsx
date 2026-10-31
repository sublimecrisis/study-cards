import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { ID } from './types'

export interface Segment {
  math: boolean
  display: boolean
  text: string
}

// $$display$$ or $inline$. Inline must not start/end with a space and the closing $
// must not be followed by a digit, so prices like "$5 and $10" stay plain text.
const MATH = /\$\$([^$]+?)\$\$|\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\d)/g

export function splitMath(s: string): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const m of s.matchAll(MATH)) {
    if (m.index > last) out.push({ math: false, display: false, text: s.slice(last, m.index) })
    out.push({ math: true, display: m[1] !== undefined, text: m[1] ?? m[2] })
    last = m.index + m[0].length
  }
  if (last < s.length) out.push({ math: false, display: false, text: s.slice(last) })
  return out
}

/** Card text with $LaTeX$ formulas rendered. */
export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={`rich ${className ?? ''}`}>
      {splitMath(text).map((seg, i) =>
        seg.math ? (
          <span
            key={i}
            // katex escapes its input; trust is off by default.
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(seg.text, { throwOnError: false, displayMode: seg.display }),
            }}
          />
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  )
}

export function useImageUrl(id: ID | null) {
  const rec = useLiveQuery(() => (id ? db.images.get(id) : undefined), [id])
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!rec) return setUrl(undefined)
    const u = URL.createObjectURL(rec.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [rec])
  return url
}

export function CardImage({ id, className }: { id: ID | null; className?: string }) {
  const url = useImageUrl(id)
  return url ? <img src={url} alt="" className={className ?? 'card-img'} /> : null
}

/** Shrink photos (iPhone photos are 4–12 MB) to ≤1600px JPEG before storing. */
export async function shrinkImage(file: File, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return new Promise((ok, fail) =>
    canvas.toBlob((b) => (b ? ok(b) : fail(new Error('Could not read image'))), 'image/jpeg', 0.85),
  )
}
