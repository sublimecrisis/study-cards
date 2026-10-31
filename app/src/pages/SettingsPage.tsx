import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { exportBackup, restoreBackup } from '../backup'
import { db } from '../db'
import { getSettings, saveSettings } from '../stats'
import { sendCode, signOut, verifyCode } from '../cloud'
import { resetCursors, syncNow, useSyncStatus } from '../sync'
import { download } from '../util'

function CloudSync() {
  const s = useSyncStatus()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const run = async (f: () => Promise<void>) => {
    setBusy(true)
    setErr('')
    try {
      await f()
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setErr(
        /expired|invalid/i.test(m)
          ? 'That link or code has expired or was already used (each one works once). Tap "Send a new sign-in email" and use the newest email.'
          : /rate|security purposes|seconds/i.test(m)
            ? `${m} — Supabase limits how often emails can be sent; wait a minute and try again.`
            : m,
      )
    } finally {
      setBusy(false)
    }
  }

  if (s.state !== 'signed-out')
    return (
      <section className="panel">
        <h2>Cloud sync</h2>
        <p>
          Signed in as <b>{s.email}</b>
        </p>
        <p className="muted small">
          {s.state === 'syncing'
            ? 'Syncing…'
            : s.state === 'error'
              ? `⚠ ${s.message}`
              : s.lastSync
                ? `Last synced ${new Date(s.lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${s.pushed || s.pulled ? ` · sent ${s.pushed}, received ${s.pulled}` : ''}`
                : 'Waiting to sync'}
        </p>
        <p className="muted small">Syncs automatically when you make changes, open the app, or come back online.</p>
        <div className="actions">
          <button className="btn primary" onClick={() => syncNow()} disabled={s.state === 'syncing'}>
            Sync now
          </button>
          <button className="btn" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </section>
    )

  return (
    <section className="panel">
      <h2>Cloud sync</h2>
      <p className="muted">Sign in to keep your cards and progress in sync between your iPhone and computer.</p>
      {step === 'email' && (
        <button className="btn link small" onClick={() => setStep('code')}>
          Already have a sign-in email? Paste its link
        </button>
      )}
      {step === 'email' ? (
        <form className="row-form" onSubmit={(e) => (e.preventDefault(), run(async () => (await sendCode(email), setStep('code'))))}>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" required />
          <button className="btn primary" disabled={busy || !email.includes('@')}>
            {busy ? 'Sending…' : 'Email me a code'}
          </button>
        </form>
      ) : (
        <>
          <p className="small">
            We emailed <b>{email}</b> (it may land in Gmail's Updates or Spam). <b>Don't tap the link</b> — copy it instead
            (right-click or long-press → Copy link) and paste it here. If the email shows a code, type that instead.
          </p>
          <form className="row-form" onSubmit={(e) => (e.preventDefault(), run(() => verifyCode(email, code)))}>
            <input autoComplete="one-time-code" autoCapitalize="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste the link (or code)" />
            <button className="btn primary" disabled={busy || code.trim().length < 6}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
          </form>
          <button className="btn link small" onClick={() => (setStep('email'), setCode(''), setErr(''))}>
            Send a new sign-in email
          </button>
        </>
      )}
      {err && <p className="error small">{err}</p>}
    </section>
  )
}

function StudySettings() {
  const s = useLiveQuery(getSettings)
  if (!s) return null
  const num = (v: string) => Math.max(1, Math.min(500, Math.round(Number(v) || 1)))
  return (
    <section className="panel">
      <h2>Study</h2>
      <div className="form-grid">
        <label>
          Daily goal (cards per day)
          <input type="number" min={1} max={500} defaultValue={s.dailyGoal} onBlur={(e) => saveSettings({ dailyGoal: num(e.target.value) })} />
        </label>
        <label>
          New cards per day in Review
          <input type="number" min={1} max={500} defaultValue={s.newPerDay} onBlur={(e) => saveSettings({ newPerDay: num(e.target.value) })} />
        </label>
      </div>
      <p className="muted small">
        Review mixes due cards with up to this many never-studied cards each day. Learn mode and quizzes aren't limited.
      </p>
    </section>
  )
}

export default function SettingsPage() {
  const [usage, setUsage] = useState('')
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1e6).toFixed(1)} MB used`))
    navigator.storage?.persisted?.().then(setPersisted)
  }, [])

  const backup = async () => {
    const day = new Date().toISOString().slice(0, 10)
    download(`study-cards-backup-${day}.json`, await exportBackup(), 'application/json')
    setMsg('Backup downloaded.')
  }
  const restore = async (file?: File) => {
    if (!file) return
    try {
      const n = await restoreBackup(await file.text())
      setMsg(`Restored: ${n} records added or updated (newer copies on this device were kept).`)
    } catch (e) {
      setMsg(String(e instanceof Error ? e.message : e))
    }
  }
  const wipe = async () => {
    if (prompt('This deletes every course, set and card on THIS device (your cloud copy is kept, and comes back if you sign in again). Type DELETE to confirm.') !== 'DELETE') return
    await db.delete()
    resetCursors()
    location.reload()
  }

  return (
    <>
      <h1>Settings</h1>

      <StudySettings />

      <CloudSync />

      <section className="panel">
        <h2>Backup</h2>
        <p className="muted">One file with all courses, sets, cards and images. Restoring merges — it never overwrites newer edits.</p>
        <div className="actions">
          <button className="btn primary" onClick={backup}>
            Download backup
          </button>
          <span className="btn file-btn">
            Restore from backup
            <input type="file" accept="application/json,.json" onChange={(e) => restore(e.target.files?.[0])} />
          </span>
        </div>
        {msg && <p className="result">{msg}</p>}
      </section>

      <section className="panel">
        <h2>Storage</h2>
        <p className="muted">
          {usage || 'Usage unknown'} ·{' '}
          {persisted === null ? '' : persisted ? 'protected from automatic cleanup' : 'not yet protected from automatic cleanup'}
        </p>
        {persisted === false && (
          <button className="btn" onClick={() => navigator.storage.persist().then(setPersisted)}>
            Protect my data
          </button>
        )}
        <p className="muted small">On iPhone, add the app to your Home Screen (Share → Add to Home Screen) so iOS keeps its data.</p>
      </section>

      <section className="panel">
        <h2>Danger zone</h2>
        <button className="btn danger" onClick={wipe}>
          Delete everything on this device
        </button>
      </section>
    </>
  )
}
