/**
 * Meeting notes storage (Notetaker). Segments are written as they are
 * transcribed, so a crash mid-meeting loses at most the chunk in flight.
 */

import { getDatabase } from './database'

export type MeetingStatus = 'recording' | 'processing' | 'done' | 'interrupted'

/** Who spoke: the user's microphone, or audio from the meeting app */
export type SegmentSource = 'you' | 'others'

export interface Meeting {
  id: string
  title: string
  startedAt: number
  endedAt: number | null
  /** Seconds actually recorded (pauses excluded) */
  durationSeconds: number
  status: MeetingStatus
  /** Meeting app, when detected (Zoom, Google Meet…) */
  appName: string | null
  /** The user's own notes ("My notes" tab), plain text / markdown */
  notes: string
  /** Generated (and user-editable) summary, markdown */
  summary: string
  /** Display names for sources, e.g. { others: 'Client team' } */
  speakerNames: Partial<Record<SegmentSource, string>>
  /** Total transcript words (for the list) */
  wordCount: number
}

export interface MeetingSegment {
  id: string
  meetingId: string
  source: SegmentSource
  /** Offset from meeting start, ms */
  startMs: number
  endMs: number
  text: string
}

export type MeetingUpdate = Partial<
  Pick<
    Meeting,
    | 'title'
    | 'endedAt'
    | 'durationSeconds'
    | 'status'
    | 'appName'
    | 'notes'
    | 'summary'
    | 'speakerNames'
  >
>

interface MeetingRow extends Omit<Meeting, 'speakerNames'> {
  speakerNames: string
}

export function initMeetingsSchema(): void {
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      startedAt INTEGER NOT NULL,
      endedAt INTEGER,
      durationSeconds REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'recording',
      appName TEXT,
      notes TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      speakerNames TEXT NOT NULL DEFAULT '{}',
      wordCount INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_meetings_started ON meetings(startedAt DESC);

    CREATE TABLE IF NOT EXISTS meeting_segments (
      id TEXT PRIMARY KEY,
      meetingId TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      startMs INTEGER NOT NULL,
      endMs INTEGER NOT NULL,
      text TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_segments_meeting ON meeting_segments(meetingId, startMs);
  `)
}

function fromRow(row: MeetingRow): Meeting {
  let speakerNames: Meeting['speakerNames'] = {}
  try {
    speakerNames = JSON.parse(row.speakerNames || '{}')
  } catch {
    // Corrupt JSON — fall back to default labels
  }
  return { ...row, speakerNames }
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

export function createMeeting(
  meeting: Pick<Meeting, 'id' | 'startedAt'> & { appName?: string | null }
): Meeting {
  getDatabase()
    .prepare('INSERT INTO meetings (id, startedAt, appName, status) VALUES (?, ?, ?, ?)')
    .run(meeting.id, meeting.startedAt, meeting.appName ?? null, 'recording')
  return getMeeting(meeting.id)!
}

export function getMeeting(id: string): Meeting | null {
  const row = getDatabase().prepare('SELECT * FROM meetings WHERE id = ?').get(id) as
    | MeetingRow
    | undefined
  return row ? fromRow(row) : null
}

/** Newest first; `search` matches title, notes, summary and transcript text */
export function listMeetings(query: { search?: string; limit?: number; offset?: number } = {}): {
  meetings: Meeting[]
  total: number
} {
  const db = getDatabase()
  const limit = Math.max(1, Math.min(query.limit ?? 50, 200))
  const offset = Math.max(0, query.offset ?? 0)
  const search = query.search?.trim()
  if (!search) {
    const meetings = (
      db
        .prepare('SELECT * FROM meetings ORDER BY startedAt DESC LIMIT ? OFFSET ?')
        .all(limit, offset) as MeetingRow[]
    ).map(fromRow)
    const total = (db.prepare('SELECT COUNT(*) AS n FROM meetings').get() as { n: number }).n
    return { meetings, total }
  }
  const like = `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
  const where = `WHERE m.title LIKE @q ESCAPE '\\' OR m.notes LIKE @q ESCAPE '\\' OR m.summary LIKE @q ESCAPE '\\'
    OR EXISTS (SELECT 1 FROM meeting_segments s WHERE s.meetingId = m.id AND s.text LIKE @q ESCAPE '\\')`
  const meetings = (
    db
      .prepare(
        `SELECT m.* FROM meetings m ${where} ORDER BY m.startedAt DESC LIMIT @limit OFFSET @offset`
      )
      .all({ q: like, limit, offset }) as MeetingRow[]
  ).map(fromRow)
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM meetings m ${where}`).get({ q: like }) as { n: number }
  ).n
  return { meetings, total }
}

export function updateMeeting(id: string, update: MeetingUpdate): void {
  const allowed: (keyof MeetingUpdate)[] = [
    'title',
    'endedAt',
    'durationSeconds',
    'status',
    'appName',
    'notes',
    'summary',
    'speakerNames'
  ]
  const entries = allowed
    .filter((k) => update[k] !== undefined)
    .map((k) => [k, k === 'speakerNames' ? JSON.stringify(update[k]) : update[k]] as const)
  if (entries.length === 0) return
  getDatabase()
    .prepare(`UPDATE meetings SET ${entries.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...entries.map(([, v]) => v ?? null), id)
}

export function deleteMeeting(id: string): void {
  const db = getDatabase()
  db.transaction(() => {
    db.prepare('DELETE FROM meeting_segments WHERE meetingId = ?').run(id)
    db.prepare('DELETE FROM meetings WHERE id = ?').run(id)
  })()
}

export function addSegment(segment: MeetingSegment): void {
  const db = getDatabase()
  db.transaction(() => {
    db.prepare(
      'INSERT OR REPLACE INTO meeting_segments (id, meetingId, source, startMs, endMs, text) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      segment.id,
      segment.meetingId,
      segment.source,
      segment.startMs,
      segment.endMs,
      segment.text
    )
    db.prepare('UPDATE meetings SET wordCount = wordCount + ? WHERE id = ?').run(
      countWords(segment.text),
      segment.meetingId
    )
  })()
}

export function getSegments(meetingId: string): MeetingSegment[] {
  return getDatabase()
    .prepare('SELECT * FROM meeting_segments WHERE meetingId = ? ORDER BY startMs ASC, source ASC')
    .all(meetingId) as MeetingSegment[]
}

/** Meetings left 'recording' by a crash or force-quit become 'interrupted' */
export function recoverInterruptedMeetings(): void {
  getDatabase()
    .prepare(
      "UPDATE meetings SET status = 'interrupted', endedAt = COALESCE(endedAt, startedAt + CAST(durationSeconds * 1000 AS INTEGER)) WHERE status IN ('recording', 'processing')"
    )
    .run()
}
