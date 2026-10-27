/**
 * Meeting recorder (Notetaker) — runs in the notepad window.
 *
 * Contract used by the notepad UI. Implementation in progress.
 */
import type { Meeting, MeetingSegment } from '../models/meeting'

export type RecorderStatus = 'idle' | 'starting' | 'recording' | 'paused' | 'stopping'

/** Meeting-audio (other participants) capture state */
export type MeetingAudioState =
  /** Capturing system audio */
  | 'on'
  /** Turned off in settings */
  | 'off'
  /** Not possible on this system (e.g. Linux without a monitor device, macOS < 13) */
  | 'unavailable'
  /** The OS refused (macOS: Screen & System Audio Recording permission) */
  | 'denied'

/** Error codes; the UI maps them to translated messages */
export type RecorderError =
  | 'mic-denied'
  | 'mic-not-found'
  | 'mic-in-use'
  | 'no-api-key'
  | 'transcription-failed'
  | 'start-failed'

export interface MeetingRecorder {
  status: RecorderStatus
  /** The meeting being recorded (null when idle) */
  meeting: Meeting | null
  /** Live transcript, sorted by time */
  segments: MeetingSegment[]
  /** Audio chunks waiting to be transcribed (show "transcribing…" when > 0) */
  pendingChunks: number
  /** Recorded time, pauses excluded */
  elapsedMs: number
  /** Live input levels 0..1 for the two sources */
  levels: { you: number; others: number }
  meetingAudio: MeetingAudioState
  /** Last error (cleared on the next successful action) */
  error: RecorderError | null
  /** Begin a new meeting (no-op if already recording) */
  start: (options?: { appName?: string }) => Promise<void>
  pause: () => void
  resume: () => void
  /**
   * Stop: flush the remaining audio, mark the meeting 'processing', then
   * summarize (if enabled and there's enough speech) and mark it 'done'.
   * Resolves with the meeting id once recording has stopped — summarizing
   * continues in the background (watch `meetings:changed`).
   */
  stop: () => Promise<string | null>
}

export function useMeetingRecorder(): MeetingRecorder {
  return {
    status: 'idle',
    meeting: null,
    segments: [],
    pendingChunks: 0,
    elapsedMs: 0,
    levels: { you: 0, others: 0 },
    meetingAudio: 'off',
    error: null,
    start: async () => {},
    pause: () => {},
    resume: () => {},
    stop: async () => null
  }
}
