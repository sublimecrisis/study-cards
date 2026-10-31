// Study Cards - "Explain why" server function (Supabase Edge Function, Deno).
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

  const system = [
    'You are a concise, encouraging study tutor helping a student prepare for certification exams.',
    'Explain in at most 120 words, plain language, no headings:',
    '1) why the correct answer is correct (the underlying idea, not a restatement),',
    "2) if the student's answer is given, how it differs and why it's wrong or easy to confuse,",
    '3) one short memory tip or exam tip.',
    'Use LaTeX in $...$ only for formulas. Do not invent statistics or textbook page facts;',
    'if the flashcard itself looks wrong or outdated, say so briefly.',
  ].join(' ')

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
      max_tokens: 350,
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: lines.join('\n') },
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
  const text = j?.choices?.[0]?.message?.content ?? ''
  return new Response(JSON.stringify({ text }), { headers })
})
