export interface Note {
  id: string
  text: string
  createdAt: string
  updatedAt: string
  isVoice: boolean
  audioPath?: string
  tags?: string[]
}

export interface NoteGroup {
  date: string
  label: string
  notes: Note[]
}

export function groupNotesByDate(notes: Note[]): NoteGroup[] {
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
          ? 'Today'
          : date === yesterday
            ? 'Yesterday'
            : new Date(date).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric'
              }),
      notes: notes.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}
