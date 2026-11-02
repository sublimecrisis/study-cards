// Study Cards - "Explain why" server function (Supabase Edge Function, Deno).
// Modes: explanation (default), 'scenario' (practice question), 'hook' (memory hook).
// Holds the OpenRouter key server-side so it never ships in the public app.
// Only signed-in users can call it (Supabase verifies the JWT before this runs).
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   OPENROUTER_API_KEY  required
//   OPENROUTER_MODEL    optional, default anthropic/claude-haiku-5.5

const ALLOWED_ORIGINS = ['https://sublimecrisis.github.io', 'http://localhost:5174']

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n)

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get('origin')), 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers })

  const key = Deno.env.get('OPENROUTER_API_KEY')
  if (!key) return new Response(JSON.stringify({ error: 'Explanations are not set up yet (missing OpenRouter key).' }), { status: 503, headers })

  let b: Record<string, unknown>
  try {
    b = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400, headers })
  }

  // Inputs are clipped so a single call can't run up a large bill.
  const course = clip(b.course, 120)
  const term = clip(b.term, 600)
  const definition = clip(b.definition, 1500)
  const notes = clip(b.notes, 600)
  const chosen = clip(b.chosen, 600)
  const chosenMeans = clip(b.chosenMeans, 600)
  const answerSide = b.answerSide === 'term' ? 'term' : 'definition'
  if (!term && !definition) return new Response(JSON.stringify({ error: 'Empty card' }), { status: 400, headers })

  const lines = [
    `Course: ${course || 'unknown'}`,
    `Flashcard term: ${term}`,
    `Flashcard definition: ${definition}`,
    notes && `Card notes: ${notes}`,
    chosen
      ? `The student was asked for the ${answerSide} and answered: "${chosen}"${chosenMeans ? ` - which is actually the ${answerSide === 'term' ? 'term for' : 'definition of'}: "${chosenMeans}"` : ''}.`
      : 'The student got this card wrong (or asked for an explanation).',
  ].filter(Boolean)

  const scenario = b.mode === 'scenario'
  const hook = b.mode === 'hook'
  const related = (Array.isArray(b.related) ? b.related : []).slice(0, 12).map((x) => clip(x, 120))

  const system = hook
    ? [
        'You create memory hooks for flashcards, for a student cramming for a certification exam.',
        'Write ONE short, memorable hook (max 40 words) that links the term to its meaning: an acronym,',
        'a mnemonic phrase, a vivid or funny mental image, or a tiny story. Prefer the keyword method',
        '(a sound-alike word turned into an image) for unfamiliar terms, and acronyms for ordered lists.',
        'It must stay accurate to the flashcard. Also pick the single most important word or short phrase',
        'from the definition to highlight (copy it EXACTLY as it appears in the definition).',
        'Reply with ONLY a JSON object, no markdown: {"hook": string, "kind": "acronym" | "mnemonic" | "image" | "story", "keyword": string}.',
      ].join(' ')
    : scenario
    ? [
        'You write certification exam practice questions.',
        'Given one flashcard, write ONE realistic scenario-based multiple-choice question that tests',
        'APPLYING the concept (a client, situation, or case), not recalling the definition word for word.',
        'Exactly 4 options, exactly one correct; wrong options must be plausible and from the same topic area',
        '(use the related concepts listed when helpful). Stay consistent with the flashcard; do not invent statistics.',
        'Reply with ONLY a JSON object, no markdown: {"question": string, "options": [4 strings],',
        '"correct": index 0-3, "why": one or two plain-text sentences explaining the answer}.',
      ].join(' ')
    : [
    'You are a concise, encouraging study tutor helping a student prepare for certification exams.',
    'Explain in at most 120 words, plain text only (no markdown, no asterisks, no headings):',
    '1) why the correct answer is correct (the underlying idea, not a restatement),',
    "2) if the student's answer is given, how it differs and why it's wrong or easy to confuse,",
    '3) one short memory tip or exam tip.',
    'Use LaTeX in $...$ only for formulas. Do not invent statistics or textbook page facts;',
    'if the flashcard itself looks wrong or outdated, say so briefly.',
  ].join(' ')

  const userText = hook
    ? [`Course: ${course || 'unknown'}`, `Flashcard term: ${term}`, `Flashcard definition: ${definition}`, notes && `Notes: ${notes}`].filter(Boolean).join('\n')
    : scenario
    ? [`Course: ${course || 'unknown'}`, `Flashcard term: ${term}`, `Flashcard definition: ${definition}`, notes && `Notes: ${notes}`, related.length && `Related concepts: ${related.join('; ')}`].filter(Boolean).join('\n')
    : lines.join('\n')

  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://sublimecrisis.github.io/study-cards/',
      'X-Title': 'Study Cards',
    },
    body: JSON.stringify({
      model: Deno.env.get('OPENROUTER_MODEL') || 'anthropic/claude-haiku-5.5',
      max_tokens: 900,
      temperature: scenario || hook ? 0.7 : 0.3,
      // Explanations don't need hidden reasoning; it also ate the output budget and cut answers off.
      reasoning: { enabled: false },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userText },
      ],
    }),
  })
  if (!r.ok) {
    const detail = await r.text()
    console.error('openrouter', r.status, detail.slice(0, 300))
    const msg = r.status === 402 ? 'OpenRouter account is out of credit.' : r.status === 401 ? 'OpenRouter key was rejected.' : 'The AI service had a problem - try again.'
    return new Response(JSON.stringify({ error: msg }), { status: 502, headers })
  }
  const j = await r.json()
  const choice = j?.choices?.[0]
  const text = choice?.message?.content ?? ''
  if (choice?.finish_reason === 'length') console.warn('explanation hit max_tokens')
  if (hook) {
    try {
      const h = JSON.parse(String(text).slice(String(text).indexOf('{'), String(text).lastIndexOf('}') + 1))
      if (typeof h.hook !== 'string' || !h.hook.trim()) throw new Error('shape')
      const kind = ['acronym', 'mnemonic', 'image', 'story'].includes(h.kind) ? h.kind : 'mnemonic'
      // Only keep the keyword if it really appears in the definition, so the app can highlight it.
      const kw = typeof h.keyword === 'string' && h.keyword.trim() && definition.includes(h.keyword.trim()) ? h.keyword.trim() : ''
      return new Response(JSON.stringify({ hook: { text: h.hook.trim(), kind, keyword: kw } }), { headers })
    } catch {
      return new Response(JSON.stringify({ error: 'The AI returned an unusable hook - try again.' }), { status: 502, headers })
    }
  }
  if (scenario) {
    // Pull the JSON object out even if the model wrapped it in prose or a code fence; validate the shape.
    try {
      const q = JSON.parse(String(text).slice(String(text).indexOf('{'), String(text).lastIndexOf('}') + 1))
      const ok = typeof q.question === 'string' && Array.isArray(q.options) && q.options.length === 4 && q.options.every((o: unknown) => typeof o === 'string') && Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4
      if (!ok) throw new Error('shape')
      return new Response(JSON.stringify({ scenario: { question: q.question, options: q.options, correct: q.correct, why: String(q.why ?? '') } }), { headers })
    } catch {
      return new Response(JSON.stringify({ error: 'The AI returned an unusable question - try again.' }), { status: 502, headers })
    }
  }
  return new Response(JSON.stringify({ text }), { headers })
})
