import { memo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import type { MeetingAudioState } from '../../hooks/use-meeting-recorder'
import { formatTimestamp } from '../../services/meeting-ai'

/**
 * Small leaf components for the recorder's fast-changing values (levels and
 * elapsed time tick every 100 ms). Parents pass pre-rounded numbers so these
 * only re-render when what they show actually changes.
 */

/** Level 0..1 → 0..4 lit bars */
export function levelStep(level: number): number {
  return Math.max(0, Math.min(4, Math.round(level * 6)))
}

interface SourceMeterProps {
  kind: 'mic' | 'meeting'
  /** 0..4 (see levelStep) */
  step: number
  /** Meeting audio only: why it isn't captured */
  state?: MeetingAudioState
  paused?: boolean
}

const BAR_HEIGHTS = [4, 6, 8, 10]

export const SourceMeter = memo(function SourceMeter({
  kind,
  step,
  state = 'on',
  paused = false
}: SourceMeterProps): JSX.Element {
  const { t } = useTranslation()
  const active = state === 'on'
  const Icon = kind === 'mic' ? (active ? Mic : MicOff) : active ? Volume2 : VolumeX
  const label =
    kind === 'mic'
      ? t('notepad.sourceMic', 'Your microphone')
      : active
        ? t('notepad.sourceMeeting', 'Meeting audio')
        : state === 'denied'
          ? t('notepad.sourceMeetingDenied', 'Meeting audio: permission needed')
          : state === 'unavailable'
            ? t('notepad.sourceMeetingUnavailable', 'Meeting audio: not available')
            : t('notepad.sourceMeetingOff', 'Meeting audio: off')

  return (
    <span
      className={`flex h-6 items-center gap-1 rounded-md px-1.5 ${
        active ? 'text-ink-muted' : state === 'denied' ? 'text-warning' : 'text-ink-faint'
      }`}
      title={label}
      role="img"
      aria-label={label}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      {active && (
        <span className="flex h-2.5 items-end gap-[2px]" aria-hidden="true">
          {BAR_HEIGHTS.map((h, i) => (
            <span
              key={i}
              className={`w-[3px] rounded-full transition-colors duration-100 ${
                !paused && i < step
                  ? kind === 'mic'
                    ? 'bg-signal'
                    : 'bg-warning'
                  : 'bg-hairline-strong'
              }`}
              style={{ height: h }}
            />
          ))}
        </span>
      )}
    </span>
  )
})

/** Ember dot + recorded time (pauses excluded) */
export const RecordingClock = memo(function RecordingClock({
  seconds,
  paused
}: {
  seconds: number
  paused: boolean
}): JSX.Element {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${
          paused ? 'bg-ink-faint' : 'bg-ember motion-safe:animate-live-pulse'
        }`}
      />
      <time className="text-[12.5px] font-semibold text-ink tabular" dir="ltr">
        {formatTimestamp(seconds * 1000)}
      </time>
    </span>
  )
})

/** Wall-clock time since `startedAt`, ticking once a second (main window banner) */
export function useElapsedSince(startedAt: number | null, running: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt || !running) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [startedAt, running])
  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0
}
