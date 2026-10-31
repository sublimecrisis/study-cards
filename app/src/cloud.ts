import { createClient } from '@supabase/supabase-js'

// The publishable key is designed to ship inside web apps; row-level security on
// the server (supabase/setup.sql) is what keeps each user's data private.
const URL = 'https://pgqhdiyyildcodkxqxuf.supabase.co'
const KEY = 'sb_publishable_K9NaAsdMVOWAOf0vxx6LeA_y4fd92_u'

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

/** Emails a 6-digit sign-in code (typed into the app, so it works inside the iPhone home-screen app too). */
export async function sendCode(email: string) {
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } })
  if (error) throw error
}

type LinkType = 'signup' | 'magiclink' | 'recovery' | 'invite' | 'email_change' | 'email'

/** Pull the one-time token out of a pasted sign-in link (…/auth/v1/verify?token=…&type=…). */
export function parseSignInLink(text: string): { tokenHash: string; type: LinkType } | null {
  const m = text.trim().match(/https?:\/\/\S+/)
  if (!m) return null
  try {
    const u = new globalThis.URL(m[0])
    const token = u.searchParams.get('token') ?? u.searchParams.get('token_hash')
    const type = (u.searchParams.get('type') ?? 'magiclink') as LinkType
    return token ? { tokenHash: token, type } : null
  } catch {
    return null
  }
}

/**
 * Accepts either the code from the email or the whole sign-in link copied from it.
 * (Supabase's free email only contains a link, and tapping it would open Safari
 * instead of the installed iPhone app — so the link gets pasted in instead.)
 */
export async function verifyCode(email: string, codeOrLink: string) {
  const link = parseSignInLink(codeOrLink)
  const { error } = link
    ? await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type })
    : await supabase.auth.verifyOtp({ email: email.trim(), token: codeOrLink.trim(), type: 'email' })
  if (error) throw error
}

export const signOut = () => supabase.auth.signOut()
