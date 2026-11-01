import { useEffect, useRef, useState } from 'react'
import { Kbd } from './components'
import { gradeWritten, type Question } from './quizgen'
import { CardImage, RichText } from './rich'
import WhyPanel from './WhyPanel'
import Diagram from './Diagram'
import DrillQuestion from './DrillQuestion'

const SIDE_LABEL = { term: 'Term', definition: 'Definition' }

/**
 * One question with instant feedback. Calls onAnswer(correct) once the student
 * moves on (so "I was right" can still flip a written answer before it counts).
 */
export default function QuestionView({ q, onAnswer }: { q: Question; onAnswer: (correct: boolean) => void }) {
  if (q.type === 'order' || q.type === 'match') return <DrillQuestion q={q} onAnswer={onAnswer} />
  return <StandardQuestion q={q} onAnswer={onAnswer} />
}

function StandardQuestion({ q, onAnswer }: { q: Question; onAnswer: (correct: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null) // mc index, or tf 1=true 0=false
  const [typed, setTyped] = useState('')
  const [result, setResult] = useState<boolean | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const next = useRef<HTMLButtonElement>(null)

  const answerText = q.scenario ? q.options![q.correctIndex!] : q.answerSide === 'term' ? q.card.term : q.card.definition
  const promptText = q.scenario ? q.scenario.question : q.promptSide === 'term' ? q.card.term : q.card.definition
  const promptImg = q.promptSide === 'term' ? q.card.termImage : q.card.defImage

  useEffect(() => {
    if (q.type === 'written') input.current?.focus()
  }, [q])
  useEffect(() => {
    if (result !== null) next.current?.focus()
  }, [result])

  const choose = (i: number) => {
    if (result !== null) return
    setPicked(i)
    setResult(q.type === 'mc' || q.type === 'scenario' ? i === q.correctIndex : (i === 1) === q.tfTrue)
  }
  const submitWritten = (dontKnow = false) => {
    if (result !== null) return
    setResult(dontKnow ? false : gradeWritten(typed, answerText))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (result !== null || e.target instanceof HTMLInputElement) return
      const n = Number(e.key)
      if ((q.type === 'mc' || q.type === 'scenario') && n >= 1 && n <= (q.options?.length ?? 0)) choose(n - 1)
      if (q.type === 'tf' && (e.key === 't' || e.key === '1')) choose(1)
      if (q.type === 'tf' && (e.key === 'f' || e.key === '2')) choose(0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="question">
      <div className="q-prompt">
        <span className="q-label">{q.scenario ? 'Scenario' : SIDE_LABEL[q.promptSide]}</span>
        <RichText text={promptText} />
        {q.scenario ? null : q.card.occlusion ? <Diagram card={q.card} revealed={result !== null} /> : <CardImage id={promptImg} className="face-img" />}
      </div>

      {(q.type === 'mc' || q.type === 'scenario') && (
        <>
          <div className="q-ask muted small">{q.scenario ? 'Choose the best answer' : `Choose the matching ${SIDE_LABEL[q.answerSide].toLowerCase()}`}</div>
          <div className="options">
            {q.options!.map((o, i) => {
              const state = result === null ? '' : i === q.correctIndex ? 'right' : i === picked ? 'wrong' : 'dim'
              return (
                <button key={i} className={`option ${state}`} onClick={() => choose(i)} disabled={result !== null}>
                  <Kbd>{i + 1}</Kbd>
                  <RichText text={o} />
                </button>
              )
            })}
          </div>
        </>
      )}

      {q.type === 'tf' && (
        <>
          <div className="q-ask muted small">Is this the right {SIDE_LABEL[q.answerSide].toLowerCase()}?</div>
          <div className="q-shown">
            <RichText text={q.shown!} />
          </div>
          <div className="options two">
            {[1, 0].map((v) => {
              const right = (v === 1) === q.tfTrue
              const state = result === null ? '' : right ? 'right' : v === picked ? 'wrong' : 'dim'
              return (
                <button key={v} className={`option ${state}`} onClick={() => choose(v)} disabled={result !== null}>
                  <Kbd>{v ? 'T' : 'F'}</Kbd> {v ? 'True' : 'False'}
                </button>
              )
            })}
          </div>
          {result !== null && !q.tfTrue && (
            <div className="q-correct">
              Correct {SIDE_LABEL[q.answerSide].toLowerCase()}: <RichText text={answerText} />
            </div>
          )}
        </>
      )}

      {q.type === 'written' && (
        <form
          className="written"
          onSubmit={(e) => {
            e.preventDefault()
            submitWritten()
          }}
        >
          <label className="q-ask muted small" htmlFor="ans">
            Type the {SIDE_LABEL[q.answerSide].toLowerCase()}
          </label>
          <input
            id="ans"
            ref={input}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={result !== null}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className={result === null ? '' : result ? 'right' : 'wrong'}
          />
          {result === null && (
            <div className="actions">
              <button className="btn primary" disabled={!typed.trim()}>
                Check <Kbd>Enter</Kbd>
              </button>
              <button type="button" className="btn" onClick={() => submitWritten(true)}>
                Don't know
              </button>
            </div>
          )}
          {result !== null && (
            <div className="q-correct">
              {result ? 'Correct' : 'Answer'}: <RichText text={answerText} />
              {!result && typed.trim() && (
                <button type="button" className="btn link small" onClick={() => setResult(true)}>
                  I was right
                </button>
              )}
            </div>
          )}
        </form>
      )}

      {q.scenario && result !== null && (
        <div className="why">
          <p>
            <b>Why:</b> <RichText text={q.scenario.why} />
          </p>
          <p className="muted small">
            Card: <RichText text={q.card.term} /> — <RichText text={q.card.definition} />
          </p>
        </div>
      )}

      {result === false && !q.scenario && (
        <WhyPanel
          card={q.card}
          answerSide={q.answerSide}
          chosen={
            q.type === 'mc' ? q.options![picked!] : q.type === 'tf' ? (picked === 1 && !q.tfTrue ? q.shown : undefined) : typed.trim() || undefined
          }
          chosenCard={q.type === 'mc' ? q.optionCards?.[picked!] : q.type === 'tf' && picked === 1 && !q.tfTrue ? q.shownCard : undefined}
        />
      )}

      {result !== null && (
        <div className={`feedback ${result ? 'right' : 'wrong'}`}>
          <span>{result ? '✓ Correct' : '✕ Not quite'}</span>
          <button ref={next} className="btn primary" onClick={() => onAnswer(result)}>
            Continue <Kbd>Enter</Kbd>
          </button>
        </div>
      )}
    </div>
  )
}
