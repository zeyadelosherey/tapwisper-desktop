/**
 * A note persisted in electron-store under the `notes` key.
 * Optional fields are absent on notes created by older versions.
 */
export interface Note {
  id: string
  text: string
  title?: string
  createdAt: string
  updatedAt?: string
  isVoice: boolean
  durationSeconds?: number
  audioPath?: string
  tags?: string[]
}

export interface NoteGroup {
  date: string
  label: string
  notes: Note[]
}

/**
 * Format a date with the given locale, falling back to the runtime default
 * when the locale tag is not a valid BCP 47 tag (e.g. i18next's 'cimode').
 */
export function formatLocaleDate(
  date: Date,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions
): string {
  try {
    return date.toLocaleDateString(locale, options)
  } catch {
    return date.toLocaleDateString(undefined, options)
  }
}

export function groupNotesByDate(
  notes: Note[],
  locale?: string,
  labels: { today: string; yesterday: string } = { today: 'Today', yesterday: 'Yesterday' }
): NoteGroup[] {
  const groups = new Map<string, Note[]>()

  for (const note of notes) {
    const date = new Date(note.createdAt).toDateString()
    if (!groups.has(date)) {
      groups.set(date, [])
    }
    groups.get(date)!.push(note)
  }

  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()

  return Array.from(groups.entries())
    .map(([date, notes]) => ({
      date,
      label:
        date === today
          ? labels.today
          : date === yesterday
            ? labels.yesterday
            : formatLocaleDate(new Date(date), locale, {
                month: 'long',
                day: 'numeric'
              }),
      notes: notes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}
