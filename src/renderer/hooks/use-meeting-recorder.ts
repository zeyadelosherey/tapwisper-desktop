/**
 * Meeting recorder (Notetaker) — runs in the notepad window.
 *
 * Records the user's microphone ("You") and the meeting's system audio
 * ("Others") as two independent streams, cuts each into chunks at natural
 * pauses, transcribes them in order with the configured voice provider and
 * saves every segment as soon as it's ready (a crash loses at most the chunk
 * in flight). Having separate streams gives speaker separation for free.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Meeting, MeetingSegment, SegmentSource } from '../models/meeting'
import { applyDictionary, type DictionaryEntry } from '../models/dictionary'
import { transcribeAudio } from '../services/ai-router'
import { LocalEngineError, warmUpLocalModels } from '../services/local-ai'
import { MIN_WORDS_FOR_AUTO_SUMMARY, summarizeMeeting } from '../services/meetings'
import {
  ChunkRecorder,
  openMeetingAudio,
  openMicrophone,
  type CapturedChunk
} from './meeting-capture'
import { containment } from '../utils/text-similarity'
import { translateText } from '../services/translate'

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
  | 'engine-not-ready'
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

// ── Implementation ─────────────────────────────────────────────────

/**
 * How often the timer/meters state updates. Each update re-renders the
 * notepad header; 5Hz keeps meters lively at half the work of 10Hz.
 */
const UI_TICK_MS = 200
/** How often the running duration is persisted (crash recovery) */
const PERSIST_EVERY_MS = 30_000
/** Chunks with less speech than this aren't sent for transcription */
const MIN_VOICED_MS = 400
/** Retries for a chunk whose transcription failed (network blips) */
const MAX_RETRIES = 2
/**
 * Share of the mic text found in overlapping meeting audio above which it is
 * speaker bleed (the mic hearing the call), not the user speaking
 */
const ECHO_CONTAINMENT = 0.7

function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function insertSorted(list: MeetingSegment[], seg: MeetingSegment): MeetingSegment[] {
  const next = [...list, seg]
  next.sort(
    (a, b) => a.startMs - b.startMs || (a.source === b.source ? 0 : a.source === 'you' ? -1 : 1)
  )
  return next
}

function errorCode(err: unknown): RecorderError {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'mic-denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'mic-not-found'
  if (name === 'NotReadableError') return 'mic-in-use'
  return 'start-failed'
}

export function useMeetingRecorder(): MeetingRecorder {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [segments, setSegments] = useState<MeetingSegment[]>([])
  const [pendingChunks, setPendingChunks] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [levels, setLevels] = useState({ you: 0, others: 0 })
  const [meetingAudio, setMeetingAudio] = useState<MeetingAudioState>('off')
  const [error, setError] = useState<RecorderError | null>(null)

  const statusRef = useRef<RecorderStatus>('idle')
  const meetingRef = useRef<Meeting | null>(null)
  const segmentsRef = useRef<MeetingSegment[]>([])
  const recordersRef = useRef<{ you: ChunkRecorder | null; others: ChunkRecorder | null }>({
    you: null,
    others: null
  })
  // Recorded-time clock: accumulated ms + start of the current running span
  const clockRef = useRef({ accumulated: 0, runningSince: 0 })
  // One transcription queue per source keeps each speaker's text in order
  const queuesRef = useRef<{ you: Promise<void>; others: Promise<void> }>({
    you: Promise.resolve(),
    others: Promise.resolve()
  })
  const pendingRef = useRef(0)
  const lastPersistRef = useRef(0)
  const appNameRef = useRef<string | null>(null)
  // Live translation runs on its own queue so it never delays transcription
  const translateQueueRef = useRef<Promise<void>>(Promise.resolve())

  const clock = useCallback((): number => {
    const c = clockRef.current
    return c.accumulated + (c.runningSince ? Date.now() - c.runningSince : 0)
  }, [])

  const setStatusBoth = useCallback((next: RecorderStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const reportState = useCallback((next: 'idle' | 'recording' | 'paused') => {
    void window.tapwisper.meetings
      .setState({
        meetingId: next === 'idle' ? null : (meetingRef.current?.id ?? null),
        status: next,
        appName: appNameRef.current,
        elapsedMs: clockRef.current.accumulated,
        runningSince: next === 'recording' ? clockRef.current.runningSince || Date.now() : null
      })
      .catch(() => {})
  }, [])

  // Translations saved by anyone (live queue below, or a backlog translation
  // started from the UI) update the live transcript
  useEffect(() => {
    return window.tapwisper.on('meetings:segment-translated', (value: unknown) => {
      const updated = value as MeetingSegment | null
      if (!updated || updated.meetingId !== meetingRef.current?.id) return
      segmentsRef.current = segmentsRef.current.map((s) => (s.id === updated.id ? updated : s))
      setSegments(segmentsRef.current)
    })
  }, [])

  // Keep the meeting fresh when the UI edits it (title, notes, speakers…)
  useEffect(() => {
    return window.tapwisper.on('meetings:changed', (value: unknown) => {
      const updated = value as Meeting | { id: string; deleted: true } | null
      if (!updated || !meetingRef.current || updated.id !== meetingRef.current.id) return
      if ('deleted' in updated) return
      meetingRef.current = updated
      setMeeting(updated)
    })
  }, [])

  const transcribeChunk = useCallback(
    async (source: SegmentSource, chunk: CapturedChunk, meetingId: string): Promise<void> => {
      if (chunk.voicedMs < MIN_VOICED_MS) return
      let text = ''
      for (let attempt = 0; ; attempt++) {
        try {
          const result = await transcribeAudio(chunk.blob)
          text = result.text.trim()
          break
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (/No API key/i.test(message)) {
            setError('no-api-key')
            return
          }
          if (err instanceof LocalEngineError && err.needsSetup) {
            setError('engine-not-ready')
            return
          }
          if (attempt >= MAX_RETRIES) {
            setError('transcription-failed')
            return
          }
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
        }
      }
      if (!text) return
      const dictionary = (await window.tapwisper.store.get('dictionary').catch(() => [])) as
        | DictionaryEntry[]
        | undefined
      text = applyDictionary(text, dictionary)

      // Speaker bleed: without headphones the mic hears the call too
      if (source === 'you') {
        const overlapping = segmentsRef.current
          .filter(
            (s) => s.source === 'others' && s.endMs > chunk.startMs && s.startMs < chunk.endMs
          )
          .map((s) => s.text)
          .join(' ')
        if (overlapping && containment(text, overlapping) >= ECHO_CONTAINMENT) return
      }

      const segment: MeetingSegment = {
        id: newId('s'),
        meetingId,
        source,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
        text
      }
      await window.tapwisper.meetings.addSegment(segment).catch(() => {})
      if (meetingRef.current?.id === meetingId) {
        segmentsRef.current = insertSorted(segmentsRef.current, segment)
        setSegments(segmentsRef.current)
        setError((e) => (e === 'transcription-failed' ? null : e))
      }

      // Live translation (setting read per segment so it can be toggled mid-meeting)
      const target = (await window.tapwisper.store.get('meetingTranslateTo').catch(() => '')) as
        | string
        | undefined
      if (target) {
        translateQueueRef.current = translateQueueRef.current
          .then(async () => {
            const translation = await translateText(segment.text, target)
            await window.tapwisper.meetings.setSegmentTranslation(segment.id, translation, target)
          })
          .catch(() => {
            // A failed translation leaves the original text; the UI can retry the backlog
          })
      }
    },
    []
  )

  const enqueue = useCallback(
    (source: SegmentSource, chunk: CapturedChunk) => {
      const meetingId = meetingRef.current?.id
      if (!meetingId) return
      pendingRef.current += 1
      setPendingChunks(pendingRef.current)
      // The mic queue also waits for meeting audio already in flight, so
      // speaker bleed can be compared against it
      const before =
        source === 'you'
          ? Promise.all([queuesRef.current.you, queuesRef.current.others])
          : queuesRef.current.others
      queuesRef.current[source] = before
        .then(() => transcribeChunk(source, chunk, meetingId))
        .catch(() => {})
        .finally(() => {
          pendingRef.current -= 1
          setPendingChunks(pendingRef.current)
        })
    },
    [transcribeChunk]
  )

  // Timer + level meters + periodic duration persistence
  useEffect(() => {
    if (status !== 'recording' && status !== 'paused') return
    const id = setInterval(() => {
      const ms = clock()
      setElapsedMs(ms)
      setLevels({
        you: recordersRef.current.you?.level ?? 0,
        others: recordersRef.current.others?.level ?? 0
      })
      const m = meetingRef.current
      if (m && Date.now() - lastPersistRef.current > PERSIST_EVERY_MS) {
        lastPersistRef.current = Date.now()
        void window.tapwisper.meetings.update(m.id, { durationSeconds: ms / 1000 }).catch(() => {})
      }
    }, UI_TICK_MS)
    return () => clearInterval(id)
  }, [status, clock])

  const start = useCallback(
    async (options?: { appName?: string }) => {
      if (statusRef.current !== 'idle') return
      setStatusBoth('starting')
      setError(null)
      let mic: MediaStream
      try {
        mic = await openMicrophone()
      } catch (err) {
        setError(errorCode(err))
        setStatusBoth('idle')
        return
      }
      // A local speech model loads while the first chunk is being recorded
      void warmUpLocalModels('meeting')
      const audio = await openMeetingAudio()
      setMeetingAudio(audio.state)

      try {
        appNameRef.current = options?.appName ?? null
        const created = await window.tapwisper.meetings.create({
          id: newId('m'),
          startedAt: Date.now(),
          appName: appNameRef.current
        })
        meetingRef.current = created
        segmentsRef.current = []
        setMeeting(created)
        setSegments([])
        pendingRef.current = 0
        setPendingChunks(0)
        clockRef.current = { accumulated: 0, runningSince: Date.now() }
        lastPersistRef.current = Date.now()
        setElapsedMs(0)

        recordersRef.current.you = new ChunkRecorder(mic, clock, (c) => enqueue('you', c))
        recordersRef.current.you.start()
        if (audio.stream) {
          recordersRef.current.others = new ChunkRecorder(audio.stream, clock, (c) =>
            enqueue('others', c)
          )
          recordersRef.current.others.start()
        }
        setStatusBoth('recording')
        reportState('recording')
      } catch {
        mic.getTracks().forEach((t) => t.stop())
        audio.stream?.getTracks().forEach((t) => t.stop())
        recordersRef.current = { you: null, others: null }
        setError('start-failed')
        setStatusBoth('idle')
      }
    },
    [clock, enqueue, reportState, setStatusBoth]
  )

  const pause = useCallback(() => {
    if (statusRef.current !== 'recording') return
    const c = clockRef.current
    clockRef.current = {
      accumulated: c.accumulated + (Date.now() - c.runningSince),
      runningSince: 0
    }
    recordersRef.current.you?.pause()
    recordersRef.current.others?.pause()
    setStatusBoth('paused')
    reportState('paused')
  }, [reportState, setStatusBoth])

  const resume = useCallback(() => {
    if (statusRef.current !== 'paused') return
    clockRef.current = { ...clockRef.current, runningSince: Date.now() }
    recordersRef.current.you?.resume()
    recordersRef.current.others?.resume()
    setStatusBoth('recording')
    reportState('recording')
  }, [reportState, setStatusBoth])

  const stop = useCallback(async (): Promise<string | null> => {
    if (statusRef.current !== 'recording' && statusRef.current !== 'paused') return null
    const m = meetingRef.current
    setStatusBoth('stopping')
    // Freeze the clock, then flush the last chunk of each source
    const c = clockRef.current
    if (c.runningSince) {
      clockRef.current = {
        accumulated: c.accumulated + (Date.now() - c.runningSince),
        runningSince: 0
      }
    }
    const { you, others } = recordersRef.current
    await Promise.all([you?.stop(), others?.stop()])
    recordersRef.current = { you: null, others: null }
    setLevels({ you: 0, others: 0 })
    // Wait until every chunk has been transcribed and saved
    await Promise.all([queuesRef.current.you, queuesRef.current.others])

    const durationMs = clock()
    setElapsedMs(durationMs)
    setStatusBoth('idle')
    reportState('idle')
    if (!m) return null

    await window.tapwisper.meetings
      .update(m.id, {
        endedAt: Date.now(),
        durationSeconds: durationMs / 1000,
        status: 'processing'
      })
      .catch(() => {})

    // Summarize in the background; the UI follows `meetings:changed`
    void (async () => {
      const auto =
        (await window.tapwisper.store.get('autoSummarizeMeetings').catch(() => true)) !== false
      const words = segmentsRef.current.reduce(
        (n, s) => n + s.text.split(/\s+/).filter(Boolean).length,
        0
      )
      if (auto && words >= MIN_WORDS_FOR_AUTO_SUMMARY) {
        try {
          await summarizeMeeting(m.id)
          return
        } catch {
          // Falls through: the meeting stays usable, "Generate summary" is offered
        }
      }
      await window.tapwisper.meetings.update(m.id, { status: 'done' }).catch(() => {})
    })()
    return m.id
  }, [clock, reportState, setStatusBoth])

  // Never leave the mic open if the notepad is torn down mid-meeting
  useEffect(() => {
    return () => {
      const { you, others } = recordersRef.current
      void you?.stop()
      void others?.stop()
      if (statusRef.current !== 'idle') reportState('idle')
    }
  }, [reportState])

  return {
    status,
    meeting,
    segments,
    pendingChunks,
    elapsedMs,
    levels,
    meetingAudio,
    error,
    start,
    pause,
    resume,
    stop
  }
}
