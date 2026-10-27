/**
 * Small helpers shared by the notepad window and the Meetings page.
 */
import type { TFunction } from 'i18next'
import type { Meeting, MeetingSegment, SegmentSource } from '../models/meeting'
import type { RecorderError } from '../hooks/use-meeting-recorder'
import { LocalEngineError } from '../services/local-ai'

/** `meetings:changed` payload for a deleted meeting */
export interface DeletedMeeting {
  id: string
  deleted: true
}

export function isMeeting(value: unknown): value is Meeting {
  const v = value as Meeting
  return (
    !!v &&
    typeof v === 'object' &&
    typeof v.id === 'string' &&
    typeof v.startedAt === 'number' &&
    typeof v.status === 'string'
  )
}

export function isDeletedMeeting(value: unknown): value is DeletedMeeting {
  const v = value as DeletedMeeting
  return !!v && typeof v === 'object' && typeof v.id === 'string' && v.deleted === true
}

export function isSegment(value: unknown): value is MeetingSegment {
  const v = value as MeetingSegment
  return (
    !!v &&
    typeof v === 'object' &&
    typeof v.id === 'string' &&
    typeof v.meetingId === 'string' &&
    typeof v.text === 'string' &&
    typeof v.startMs === 'number'
  )
}

/** Insert or replace a segment, keeping the list sorted by time */
export function mergeSegment(list: MeetingSegment[], segment: MeetingSegment): MeetingSegment[] {
  const next = list.filter((s) => s.id !== segment.id)
  next.push(segment)
  next.sort((a, b) => a.startMs - b.startMs)
  return next
}

/** Translated speaker label; a name the user gave wins */
export function speakerName(
  t: TFunction,
  source: SegmentSource,
  names?: Partial<Record<SegmentSource, string>>
): string {
  const custom = names?.[source]?.trim()
  if (custom) return custom
  return source === 'you' ? t('notepad.speakerYou', 'You') : t('notepad.speakerOthers', 'Others')
}

export function meetingTitle(t: TFunction, meeting: Pick<Meeting, 'title'> | null): string {
  return meeting?.title.trim() || t('notepad.untitled', 'Untitled meeting')
}

/** Message for an error thrown by the meeting AI (summary, recap, questions) */
export function meetingAIErrorMessage(t: TFunction, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? '')
  if (message === 'empty-meeting') {
    return t('notepad.errorEmpty', 'Nothing was said yet, so there is nothing to work with.')
  }
  if (message === 'meeting-recording') {
    return t(
      'notepad.errorStillRecording',
      'This meeting is still being recorded — the summary is made when you stop.'
    )
  }
  // Already translated, and its wording may mention API keys that aren't the cloud kind
  if (err instanceof LocalEngineError) return message
  if (/api key/i.test(message)) {
    return t(
      'notepad.errorNoKey',
      'Add an API key for your AI provider in Settings → AI Provider first.'
    )
  }
  return message || t('common.unknownError', 'Unknown error')
}

export function recorderErrorMessage(t: TFunction, error: RecorderError): string {
  switch (error) {
    case 'mic-denied':
      return t(
        'notepad.errorMicDenied',
        'TapWisper can’t use the microphone. Allow it in your system privacy settings.'
      )
    case 'mic-not-found':
      return t('notepad.errorMicNotFound', 'No microphone found. Connect one and try again.')
    case 'mic-in-use':
      return t('notepad.errorMicInUse', 'The microphone is busy in another app.')
    case 'no-api-key':
      return t(
        'notepad.errorNoVoiceKey',
        'Add an API key for your voice provider in Settings → AI Provider to transcribe meetings.'
      )
    case 'engine-not-ready':
      return t(
        'notepad.errorEngineNotReady',
        'Finish setting up Speech-to-Text in Settings to transcribe meetings.'
      )
    case 'transcription-failed':
      return t(
        'notepad.errorTranscription',
        'Part of the audio couldn’t be transcribed. Recording continues.'
      )
    case 'start-failed':
    default:
      return t('notepad.errorStart', 'Couldn’t start recording. Try again.')
  }
}

/** Copy to the system clipboard through the main process */
export async function copyText(text: string): Promise<void> {
  await window.tapwisper.clipboard.write(text)
}

/** Words in a list of segments */
export function countWords(segments: MeetingSegment[]): number {
  let words = 0
  for (const s of segments) words += s.text.split(/\s+/).filter(Boolean).length
  return words
}
