/**
 * AI features of the Notetaker: summary + title, "What did I miss?" recaps and
 * questions about a meeting. All of them run on the user's configured AI
 * provider (processText) over the transcript and the user's own notes.
 */
import type { MeetingSegment as MeetingSegmentDTO, SegmentSource } from '../models/meeting'
import { getMaxInputChars, processText } from './ai-router'

export interface MeetingContext {
  segments: MeetingSegmentDTO[]
  /** The user's own notes ("My notes") — they mark what mattered */
  notes?: string
  speakerNames?: Partial<Record<SegmentSource, string>>
  appName?: string | null
  startedAt?: number
}

/** Default speaker labels; the UI shows translated versions */
const DEFAULT_SPEAKERS: Record<SegmentSource, string> = { you: 'You', others: 'Others' }

/** Transcript characters summarized per request; smaller when the model's context is */
const MAX_CHUNK_CHARS = 60_000

/** Rounds of condensing a very long meeting into notes before the final summary */
const MAX_CONDENSE_ROUNDS = 3

export function speakerLabel(
  source: SegmentSource,
  names?: Partial<Record<SegmentSource, string>>
): string {
  return names?.[source]?.trim() || DEFAULT_SPEAKERS[source]
}

export function formatTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(h ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** "[12:03] You: …" lines, consecutive turns of the same speaker merged */
export function transcriptToText(
  segments: MeetingSegmentDTO[],
  names?: Partial<Record<SegmentSource, string>>
): string {
  const sorted = [...segments].sort((a, b) => a.startMs - b.startMs)
  const lines: string[] = []
  let last: { source: SegmentSource; index: number } | null = null
  for (const seg of sorted) {
    const text = seg.text.trim()
    if (!text) continue
    if (last && last.source === seg.source) {
      lines[last.index] += ` ${text}`
    } else {
      lines.push(`[${formatTimestamp(seg.startMs)}] ${speakerLabel(seg.source, names)}: ${text}`)
      last = { source: seg.source, index: lines.length - 1 }
    }
  }
  return lines.join('\n')
}

function speakerNote(names?: Partial<Record<SegmentSource, string>>): string {
  return [
    `"${speakerLabel('you', names)}" is the person who took these notes (their microphone).`,
    `"${speakerLabel('others', names)}" is everyone else on the call (the meeting audio) — it may be several people; infer individual names from context when they are clear, otherwise don't invent them.`
  ].join(' ')
}

const SUMMARY_FORMAT = `Write the summary in Markdown using exactly this structure:

TITLE: <a specific 3–8 word title for the meeting>

<one or two sentences: what the meeting was about and the outcome>

## <Topic 1>
- short, concrete bullet points (facts, numbers, names, dates)

## <Topic 2>
- …

## Decisions
- … (omit this section if nothing was decided)

## Next steps
- [ ] <owner if known>: <action> <deadline if mentioned>
(omit this section if there are none)

Rules:
- Topics follow the conversation, ordered by importance; 2–6 topics.
- Short lines. No filler, no meta commentary ("the speakers discussed…").
- Use the language the meeting was held in. If it mixed languages, use the main one and keep names and technical terms as spoken.
- Give extra weight to anything the note-taker wrote in their own notes.
- Never invent facts that are not in the transcript or notes.`

function parseTitle(output: string): { title: string; summary: string } {
  const match = output.match(/^\s*(?:\*\*)?TITLE:?(?:\*\*)?\s*(.+)$/im)
  if (!match) return { title: '', summary: output.trim() }
  const title = match[1].replace(/^[#*\s"]+|[*\s"]+$/g, '').trim()
  const summary = output.replace(match[0], '').trim()
  return { title, summary }
}

/** Split a long transcript on line boundaries */
export function chunkTranscript(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]
  const chunks: string[] = []
  let current = ''
  for (const line of text.split('\n')) {
    if (current.length + line.length > maxChars && current) {
      chunks.push(current)
      current = ''
    }
    current += (current ? '\n' : '') + line
  }
  if (current) chunks.push(current)
  return chunks
}

/**
 * Summary + title for a finished meeting. Long meetings are summarized in
 * parts first (map), then combined (reduce).
 */
export async function generateMeetingSummary(
  ctx: MeetingContext
): Promise<{ title: string; summary: string }> {
  const transcript = transcriptToText(ctx.segments, ctx.speakerNames)
  if (!transcript.trim() && !ctx.notes?.trim()) {
    throw new Error('empty-meeting')
  }

  const header = [
    ctx.appName ? `Meeting app: ${ctx.appName}.` : '',
    ctx.startedAt ? `Date: ${new Date(ctx.startedAt).toISOString().slice(0, 10)}.` : '',
    speakerNote(ctx.speakerNames)
  ]
    .filter(Boolean)
    .join(' ')
  const notesBlock = ctx.notes?.trim() ? `\n\nNOTE-TAKER'S OWN NOTES:\n${ctx.notes.trim()}` : ''

  // Map: condense parts into dense notes (keeping timestamps for ordering) until
  // everything fits in one request — local models may need more than one round
  const maxChars = Math.min(MAX_CHUNK_CHARS, await getMaxInputChars())
  let material = transcript
  let condensed = false
  for (let round = 0; material.length > maxChars && round < MAX_CONDENSE_ROUNDS; round++) {
    const chunks = chunkTranscript(material, maxChars)
    const partials: string[] = []
    for (let i = 0; i < chunks.length; i++) {
      const part = await processText({
        prompt: `This is part ${i + 1} of ${chunks.length} of a meeting ${condensed ? 'notes' : 'transcript'}. Write dense, factual notes of everything important in this part (topics, facts, numbers, decisions, action items with owners). ${speakerNote(ctx.speakerNames)}`,
        text: chunks[i],
        systemInstruction: 'You take precise meeting notes. Output only the notes.',
        maxTokens: 3000,
        temperature: 0.2
      })
      partials.push(`PART ${i + 1}:\n${part.result}`)
    }
    material = partials.join('\n\n')
    condensed = true
  }

  const response = await processText({
    prompt: `${header}\n\n${SUMMARY_FORMAT}`,
    text: `${condensed ? 'NOTES FROM EACH PART OF THE MEETING' : 'TRANSCRIPT'}:\n${material}${notesBlock}`,
    systemInstruction:
      'You write meeting summaries people actually read: skimmable, specific and accurate.',
    maxTokens: 4096,
    temperature: 0.3
  })
  return parseTitle(response.result)
}

/** "What did I miss?" — a quick recap of the last few minutes */
export async function recapRecent(ctx: MeetingContext, minutes = 5): Promise<string> {
  const sorted = [...ctx.segments].sort((a, b) => a.startMs - b.startMs)
  const lastMs = sorted.length ? sorted[sorted.length - 1].endMs : 0
  const recent = sorted.filter((s) => s.endMs >= lastMs - minutes * 60_000)
  const text = transcriptToText(recent, ctx.speakerNames)
  if (!text.trim()) throw new Error('empty-meeting')
  const response = await processText({
    prompt: `I stepped away from a meeting. Here are the last ${minutes} minutes. In 3–6 short bullet points, tell me what I missed: what was said, anything decided, and anything asked of me. ${speakerNote(ctx.speakerNames)} Answer in the language of the transcript.`,
    text,
    systemInstruction: 'You brief busy people. Be brief and concrete. Output only the bullets.',
    maxTokens: 800,
    temperature: 0.2
  })
  return response.result.trim()
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/** Answer a question about one meeting (transcript + notes + summary) */
export async function askMeeting(
  question: string,
  ctx: MeetingContext & { summary?: string },
  history: ChatTurn[] = []
): Promise<string> {
  const transcript = transcriptToText(ctx.segments, ctx.speakerNames)
  // Most recent part wins when the meeting is longer than the model can read
  const room =
    (await getMaxInputChars()) - (ctx.summary?.length ?? 0) - (ctx.notes?.length ?? 0) - 2000
  const clipped = transcript.length > room ? transcript.slice(-Math.max(room, 0)) : transcript
  const context = [
    ctx.summary?.trim() ? `SUMMARY:\n${ctx.summary.trim()}` : '',
    ctx.notes?.trim() ? `NOTE-TAKER'S NOTES:\n${ctx.notes.trim()}` : '',
    `TRANSCRIPT:\n${clipped}`
  ]
    .filter(Boolean)
    .join('\n\n')
  const conversation = history
    .slice(-6)
    .map((t) => `${t.role === 'user' ? 'Q' : 'A'}: ${t.content}`)
    .join('\n')

  const response = await processText({
    prompt: `${conversation ? `Earlier in this conversation:\n${conversation}\n\n` : ''}Question: ${question}\n\nAnswer from the meeting material only. Quote timestamps like [12:03] when useful. If the answer isn't in the material, say so. ${speakerNote(ctx.speakerNames)} Answer in the language of the question.`,
    text: context,
    systemInstruction: 'You answer questions about a meeting precisely and briefly.',
    maxTokens: 1200,
    temperature: 0.2
  })
  return response.result.trim()
}

/** Plain-Markdown export of a meeting (summary, notes, transcript) */
export function meetingToMarkdown(meeting: {
  title: string
  startedAt: number
  durationSeconds: number
  appName: string | null
  summary: string
  notes: string
  segments: MeetingSegmentDTO[]
  speakerNames?: Partial<Record<SegmentSource, string>>
  labels: { summary: string; notes: string; transcript: string; untitled: string }
}): string {
  const date = new Date(meeting.startedAt).toLocaleString()
  const minutes = Math.max(1, Math.round(meeting.durationSeconds / 60))
  const parts = [
    `# ${meeting.title || meeting.labels.untitled}`,
    `${date} · ${minutes} min${meeting.appName ? ` · ${meeting.appName}` : ''}`
  ]
  if (meeting.summary.trim())
    parts.push(`## ${meeting.labels.summary}\n\n${meeting.summary.trim()}`)
  if (meeting.notes.trim()) parts.push(`## ${meeting.labels.notes}\n\n${meeting.notes.trim()}`)
  const transcript = transcriptToText(meeting.segments, meeting.speakerNames)
  if (transcript) parts.push(`## ${meeting.labels.transcript}\n\n${transcript}`)
  return parts.join('\n\n') + '\n'
}
