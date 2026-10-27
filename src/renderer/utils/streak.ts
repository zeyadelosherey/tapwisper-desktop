/** Local calendar day of a timestamp, e.g. "2026-10-27" */
export function dayKey(timestamp: number): string {
  const d = new Date(timestamp)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftDays(timestamp: number, days: number): number {
  const d = new Date(timestamp)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

export interface StreakInfo {
  /** Consecutive days with at least one dictation, ending today (or yesterday) */
  streak: number
  /** Activity for the last 7 days, oldest first (last entry = today) */
  lastWeek: boolean[]
}

/**
 * A streak stays alive until a whole day passes without dictating, so it
 * counts back from today, or from yesterday when nothing was dictated yet today.
 */
export function computeStreak(timestamps: number[], now = Date.now()): StreakInfo {
  const days = new Set(timestamps.map(dayKey))
  const lastWeek = Array.from({ length: 7 }, (_, i) => days.has(dayKey(shiftDays(now, i - 6))))

  let cursor = days.has(dayKey(now)) ? now : shiftDays(now, -1)
  let streak = 0
  while (days.has(dayKey(cursor))) {
    streak++
    cursor = shiftDays(cursor, -1)
  }
  return { streak, lastWeek }
}
