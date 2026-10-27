import { describe, expect, it } from 'vitest'
import { computeStreak } from '../streak'

const at = (y: number, m: number, d: number, h = 12): number => new Date(y, m - 1, d, h).getTime()

describe('computeStreak', () => {
  const now = at(2026, 10, 27, 15)

  it('counts consecutive days ending today', () => {
    const stamps = [at(2026, 10, 27, 9), at(2026, 10, 26), at(2026, 10, 25), at(2026, 10, 23)]
    expect(computeStreak(stamps, now).streak).toBe(3)
  })

  it('keeps the streak alive until a full day is missed', () => {
    const stamps = [at(2026, 10, 26), at(2026, 10, 25)]
    expect(computeStreak(stamps, now).streak).toBe(2)
  })

  it('is zero after a missed day', () => {
    expect(computeStreak([at(2026, 10, 24)], now).streak).toBe(0)
    expect(computeStreak([], now).streak).toBe(0)
  })

  it('reports the last seven days, oldest first', () => {
    const { lastWeek } = computeStreak([at(2026, 10, 27), at(2026, 10, 21)], now)
    expect(lastWeek).toEqual([true, false, false, false, false, false, true])
  })

  it('crosses month boundaries', () => {
    const stamps = [at(2026, 11, 1), at(2026, 10, 31), at(2026, 10, 30)]
    expect(computeStreak(stamps, at(2026, 11, 1, 20)).streak).toBe(3)
  })
})
