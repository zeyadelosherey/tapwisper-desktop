/**
 * Shared formatting utilities for dates, durations, and times.
 * All output follows the current UI language (i18n.language).
 */

import i18n from '../i18n'

/** Current UI locale, or undefined (runtime default) when i18next has none yet */
function currentLocale(): string | undefined {
  const lang = i18n.language
  return lang && lang !== 'cimode' ? lang : undefined
}

/** Locale-aware date formatting that tolerates an invalid locale tag */
function toLocaleDate(date: Date, options: Intl.DateTimeFormatOptions): string {
  try {
    return date.toLocaleDateString(currentLocale(), options)
  } catch {
    return date.toLocaleDateString(undefined, options)
  }
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return i18n.t('time.secondsShort', '{{value}}s', { value: Math.round(seconds) })
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return i18n.t('time.minutesShort', '{{value}}m', { value: mins })
  const hrs = Math.floor(mins / 60)
  const remainMins = mins % 60
  return remainMins > 0
    ? i18n.t('time.hoursMinutesShort', '{{hours}}h {{minutes}}m', {
        hours: hrs,
        minutes: remainMins
      })
    : i18n.t('time.hoursShort', '{{value}}h', { value: hrs })
}

export function formatDurationDetailed(seconds: number): string {
  if (seconds < 60) return i18n.t('time.secondsShort', '{{value}}s', { value: Math.round(seconds) })
  return i18n.t('time.minutesSecondsShort', '{{minutes}}m {{seconds}}s', {
    minutes: Math.floor(seconds / 60),
    seconds: Math.round(seconds % 60)
  })
}

export function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return i18n.t('time.justNow', 'just now')
  const hrs = Math.floor(mins / 60)
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] =
    mins < 60 ? [mins, 'minute'] : hrs < 24 ? [hrs, 'hour'] : [Math.floor(hrs / 24), 'day']
  try {
    return new Intl.RelativeTimeFormat(currentLocale(), { style: 'short' }).format(-value, unit)
  } catch {
    return new Intl.RelativeTimeFormat(undefined, { style: 'short' }).format(-value, unit)
  }
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) {
    return i18n.t('time.today', 'Today')
  } else if (date.toDateString() === yesterday.toDateString()) {
    return i18n.t('time.yesterday', 'Yesterday')
  } else {
    return toLocaleDate(date, {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    })
  }
}

export function formatTime(timestamp: number): string {
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  try {
    return new Date(timestamp).toLocaleTimeString(currentLocale(), options)
  } catch {
    return new Date(timestamp).toLocaleTimeString(undefined, options)
  }
}

/** Short weekday names Monday → Sunday in the current UI language */
export function weekdayLabelsMondayFirst(): string[] {
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat(currentLocale(), { weekday: 'short' })
  } catch {
    formatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
  }
  // 2024-01-01 was a Monday
  return Array.from({ length: 7 }, (_, i) => formatter.format(new Date(2024, 0, 1 + i)))
}

/** Compact number in the current UI language, e.g. 1.2K / 1,2 Tsd. */
export function formatCompactNumber(value: number): string {
  const options: Intl.NumberFormatOptions = { notation: 'compact', maximumFractionDigits: 1 }
  try {
    return new Intl.NumberFormat(currentLocale(), options).format(value)
  } catch {
    return new Intl.NumberFormat(undefined, options).format(value)
  }
}
