import { memo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppWindow, Square, Users, X } from 'lucide-react'
import type { MeetingRecorderState } from '../../models/meeting'
import { formatTimestamp } from '../../services/meeting-ai'
import { useElapsedSince } from './recording-status'

interface DetectedMeeting {
  app: string
  key: string
}

function isRecorderState(value: unknown): value is MeetingRecorderState {
  const v = value as MeetingRecorderState
  return !!v && typeof v === 'object' && typeof v.status === 'string'
}

function isDetected(value: unknown): value is DetectedMeeting {
  const v = value as DetectedMeeting
  return !!v && typeof v === 'object' && typeof v.app === 'string' && typeof v.key === 'string'
}

/**
 * Strip across the top of the main window: a meeting is being recorded
 * (back to the notepad / stop), or a call was detected (take notes?).
 */
export function MeetingBanners(): JSX.Element | null {
  const [state, setState] = useState<MeetingRecorderState | null>(null)
  const [detected, setDetected] = useState<DetectedMeeting | null>(null)

  useEffect(() => {
    let cancelled = false
    window.tapwisper.meetings
      .getState()
      .then((s) => !cancelled && setState(s))
      .catch(() => {})
    const offState = window.tapwisper.on('meeting:state', (value: unknown) => {
      if (isRecorderState(value)) setState(value)
    })
    const offDetected = window.tapwisper.on('meeting:detected', (value: unknown) => {
      if (isDetected(value)) setDetected(value)
    })
    return () => {
      cancelled = true
      offState()
      offDetected()
    }
  }, [])

  const recording = !!state && state.status !== 'idle'

  // A detected call is answered once notes start
  useEffect(() => {
    if (recording) setDetected(null)
  }, [recording])

  if (recording && state) return <RecordingBanner state={state} />
  if (detected) return <DetectedBanner meeting={detected} onDismiss={() => setDetected(null)} />
  return null
}

const RecordingBanner = memo(function RecordingBanner({
  state
}: {
  state: MeetingRecorderState
}): JSX.Element {
  const { t } = useTranslation()
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const paused = state.status === 'paused'

  useEffect(() => {
    setStartedAt(null)
    if (!state.meetingId) return
    let cancelled = false
    window.tapwisper.meetings
      .get(state.meetingId)
      .then((m) => !cancelled && setStartedAt(m?.startedAt ?? null))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [state.meetingId])

  const seconds = useElapsedSince(startedAt, !paused)

  return (
    <div
      role="status"
      className="drag-region relative z-20 flex h-9 shrink-0 items-center gap-2 border-b border-ember/20 bg-ember/[0.07] pe-2 ps-4 text-[12.5px]"
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${
          paused ? 'bg-ink-faint' : 'bg-ember motion-safe:animate-live-pulse'
        }`}
      />
      <span className="min-w-0 truncate font-medium text-ink">
        {paused
          ? t('meetings.bannerPaused', 'Meeting notes paused')
          : t('meetings.bannerRecording', 'Recording meeting notes')}
        {state.appName && <span className="font-normal text-ink-muted"> · {state.appName}</span>}
      </span>
      {startedAt && !paused && (
        <span className="text-ink-muted tabular" dir="ltr">
          {formatTimestamp(seconds * 1000)}
        </span>
      )}
      <span className="flex-1" />
      <button
        type="button"
        className="no-drag btn-ghost btn-sm h-6"
        onClick={() => void window.tapwisper.meetings.openNotepad(state.meetingId ?? undefined)}
      >
        <AppWindow className="h-3.5 w-3.5" />
        {t('meetings.showNotepad', 'Show notepad')}
      </button>
      <button
        type="button"
        className="no-drag btn btn-sm h-6 bg-ink px-2.5 text-raised hover:bg-ink/85"
        onClick={() => void window.tapwisper.meetings.stop()}
      >
        <Square className="h-2.5 w-2.5 fill-ember text-ember" />
        {t('notepad.stop', 'Stop')}
      </button>
    </div>
  )
})

function DetectedBanner({
  meeting,
  onDismiss
}: {
  meeting: DetectedMeeting
  onDismiss: () => void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      className="drag-region relative z-20 flex h-9 shrink-0 items-center gap-2 border-b border-signal/20 bg-signal-tint/70 pe-1.5 ps-4 text-[12.5px] animate-slide-down"
    >
      <Users className="h-3.5 w-3.5 shrink-0 text-signal" />
      <span className="min-w-0 truncate text-ink">
        <span className="font-medium">
          {t('meetings.detected', '{{app}} call detected', { app: meeting.app })}
        </span>
        <span className="text-ink-muted"> — {t('meetings.detectedAsk', 'take notes?')}</span>
      </span>
      <span className="flex-1" />
      <button
        type="button"
        className="no-drag btn-signal btn-sm h-6 px-2.5"
        onClick={() => {
          void window.tapwisper.meetings.start(meeting.app)
          onDismiss()
        }}
      >
        {t('notepad.startNotes', 'Start notes')}
      </button>
      <button
        type="button"
        className="no-drag icon-btn h-6 w-6"
        onClick={onDismiss}
        aria-label={t('common.dismiss', 'Dismiss')}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
