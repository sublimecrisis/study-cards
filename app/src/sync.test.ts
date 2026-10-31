import { describe, expect, it } from 'vitest'
import { parseSignInLink } from './cloud'
import { shouldApply, toRemote, type Remote } from './sync'

describe('pasted sign-in link', () => {
  it('extracts the token and type from a Supabase confirm link, even with text around it', () => {
    expect(parseSignInLink('Confirm: https://x.supabase.co/auth/v1/verify?token=abc123&type=signup&redirect_to=http://localhost:5174/ thanks')).toEqual({ tokenHash: 'abc123', type: 'signup' })
  })
  it('treats a plain code as not-a-link', () => expect(parseSignInLink('123456')).toBeNull())
})

const remote = (updated_at: number): Remote => ({ kind: 'card', id: 'c1', updated_at, deleted: false, data: {} })

describe('sync conflict rule', () => {
  it('takes remote rows we do not have', () => expect(shouldApply(undefined, remote(5))).toBe(true))
  it('takes a newer remote edit', () => expect(shouldApply({ updatedAt: 4, dirty: 0 }, remote(5))).toBe(true))
  it('ignores an older remote edit', () => expect(shouldApply({ updatedAt: 6, dirty: 0 }, remote(5))).toBe(false))
  it('never overwrites a newer unsynced local edit', () => expect(shouldApply({ updatedAt: 6, dirty: 1 }, remote(5))).toBe(false))
  it('keeps an unsynced local edit that ties (our own echo)', () => expect(shouldApply({ updatedAt: 5, dirty: 1 }, remote(5))).toBe(false))
  it('lets a newer remote edit beat an older unsynced local one', () => expect(shouldApply({ updatedAt: 4, dirty: 1 }, remote(5))).toBe(true))
  it('uses `at` for review logs', () => expect(shouldApply({ at: 9, dirty: 0 }, remote(5))).toBe(false))
})

describe('record → row', () => {
  it('maps a card, dropping the local-only dirty flag', () => {
    const r = toRemote('card', { id: 'c1', updatedAt: 7, deleted: 1, dirty: 1, term: 'x' } as never)
    expect(r).toMatchObject({ kind: 'card', id: 'c1', updated_at: 7, deleted: true })
    expect(r.data).not.toHaveProperty('dirty')
    expect(r.data).toHaveProperty('term', 'x')
  })
  it('keys settings by name', () => {
    expect(toRemote('meta', { key: 'settings', value: { dailyGoal: 30 }, updatedAt: 3, dirty: 1 })).toMatchObject({ id: 'settings', updated_at: 3 })
  })
  it('review logs use their timestamp', () => {
    expect(toRemote('review', { id: 'r', at: 11, dirty: 1 } as never)).toMatchObject({ updated_at: 11, deleted: false })
  })
})
