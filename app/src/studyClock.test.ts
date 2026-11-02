import { afterEach, describe, expect, it, vi } from 'vitest'
import { activeNow, pauseStudy, resumeStudy } from './studyClock'

describe('study clock', () => {
  afterEach(() => vi.useRealTimers())
  it('time spent paused never counts toward an answer', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const shown = activeNow()
    vi.advanceTimersByTime(5_000) // 5 s reading
    pauseStudy('away') // phone locked
    vi.advanceTimersByTime(10 * 60_000) // 10 min away
    expect(activeNow() - shown).toBe(5_000) // frozen while paused
    resumeStudy()
    vi.advanceTimersByTime(3_000) // 3 s to answer
    expect(activeNow() - shown).toBe(8_000)
  })
})
