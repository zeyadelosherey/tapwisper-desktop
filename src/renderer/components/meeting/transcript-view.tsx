import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, AudioLines, ChevronUp } from 'lucide-react'
import type { MeetingSegment, SegmentSource } from '../../models/meeting'
import { formatTimestamp } from '../../services/meeting-ai'
import { speakerName } from '../../utils/meeting'
import { SpeakerName } from './speaker-name'

interface Turn {
  key: string
  source: SegmentSource
  startMs: number
  segments: MeetingSegment[]
}

/** Consecutive segments of the same speaker form one turn */
function groupTurns(segments: MeetingSegment[]): Turn[] {
  const turns: Turn[] = []
  for (const seg of segments) {
    if (!seg.text.trim()) continue
    const last = turns[turns.length - 1]
    if (last && last.source === seg.source) last.segments.push(seg)
    else turns.push({ key: seg.id, source: seg.source, startMs: seg.startMs, segments: [seg] })
  }
  return turns
}

/** Turns rendered at first, and added per "Show earlier" (long meetings) */
const TURN_WINDOW = 120

interface TranscriptViewProps {
  segments: MeetingSegment[]
  speakerNames?: Partial<Record<SegmentSource, string>>
  onRenameSpeaker?: (source: SegmentSource, name: string) => void
  /** Show translations into this language ('' = off) */
  translateTo?: string
  /** Lines not yet translated show a "translating…" note (live translation) */
  translating?: boolean
  /** Recording: follow new lines and show the listening state */
  live?: boolean
  /** Audio is waiting to be transcribed */
  pending?: boolean
  /** Scroll container classes (live transcripts scroll on their own) */
  className?: string
  /** Inner padding classes */
  padding?: string
}

/**
 * Transcript grouped into turns. While live it sticks to the newest line;
 * scrolling up pauses that and offers a "Jump to live" pill. Only the last
 * TURN_WINDOW turns are rendered until the user asks for earlier ones, and
 * rows are memoized so a new line re-renders only the last turn.
 */
export const TranscriptView = memo(function TranscriptView({
  segments,
  speakerNames,
  onRenameSpeaker,
  translateTo = '',
  translating = false,
  live = false,
  pending = false,
  className = '',
  padding = 'px-3.5 py-3'
}: TranscriptViewProps): JSX.Element {
  const { t } = useTranslation()
  const turns = useMemo(() => groupTurns(segments), [segments])
  const [shown, setShown] = useState(TURN_WINDOW)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const frameRef = useRef(0)
  const [detached, setDetached] = useState(false)
  const [unseen, setUnseen] = useState(false)

  const youLabel = speakerName(t, 'you', speakerNames)
  const othersLabel = speakerName(t, 'others', speakerNames)

  /** One scrollTop write per frame, after layout */
  const scrollToEnd = useCallback((smooth: boolean) => {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      const el = scrollRef.current
      if (!el) return
      if (smooth) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      else el.scrollTop = el.scrollHeight
    })
  }, [])

  // Follow new lines while stuck to the bottom
  useLayoutEffect(() => {
    if (!live) return
    if (stickRef.current) scrollToEnd(false)
    else setUnseen(true)
  }, [live, segments.length, pending, scrollToEnd])

  useLayoutEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  // Stay at the newest line when the view shrinks (e.g. a recap card opens)
  useEffect(() => {
    const el = scrollRef.current
    if (!live || !el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (stickRef.current) scrollToEnd(false)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [live, scrollToEnd])

  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el || !live) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32
    if (atBottom === stickRef.current) return
    stickRef.current = atBottom
    setDetached(!atBottom)
    if (atBottom) setUnseen(false)
  }

  const jumpToLive = (): void => {
    stickRef.current = true
    setDetached(false)
    setUnseen(false)
    scrollToEnd(true)
  }

  const showEarlier = (): void => {
    // Keep the reading position while older turns are added above
    const el = scrollRef.current
    const before = el ? el.scrollHeight - el.scrollTop : 0
    setShown((n) => n + TURN_WINDOW)
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - before
    })
  }

  const empty = turns.length === 0
  const hidden = Math.max(0, turns.length - shown)
  const visible = hidden ? turns.slice(hidden) : turns

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={scrollRef}
        onScroll={live ? onScroll : undefined}
        className={className}
        role="log"
        aria-live={live ? 'polite' : undefined}
        aria-relevant="additions"
        aria-label={t('notepad.tabTranscript', 'Transcript')}
      >
        <div className={padding}>
          {empty ? (
            <div className="flex flex-col items-center px-4 py-6 text-center">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  live ? 'bg-signal-tint text-signal' : 'bg-sunken text-ink-soft'
                }`}
              >
                <AudioLines className="h-4 w-4" />
              </span>
              <p className="mt-2 text-[12.5px] font-medium text-ink">
                {live
                  ? t('notepad.transcriptListening', 'Listening…')
                  : t('notepad.transcriptEmpty', 'No transcript')}
              </p>
              {live && (
                <p className="mt-0.5 max-w-[260px] text-[12px] leading-snug text-ink-muted text-pretty">
                  {t(
                    'notepad.transcriptListeningHint',
                    'Lines appear here every few seconds as people speak.'
                  )}
                </p>
              )}
            </div>
          ) : (
            <>
              {hidden > 0 && (
                <div className="mb-2.5 flex justify-center">
                  <button type="button" className="btn-ghost btn-sm" onClick={showEarlier}>
                    <ChevronUp className="h-3.5 w-3.5" />
                    {t('notepad.showEarlier', 'Show earlier ({{count}})', { count: hidden })}
                  </button>
                </div>
              )}
              <ol className="space-y-2.5">
                {visible.map((turn) => (
                  <TurnRow
                    key={turn.key}
                    turn={turn}
                    label={turn.source === 'you' ? youLabel : othersLabel}
                    onRename={onRenameSpeaker}
                    translateTo={translateTo}
                    translating={translating}
                  />
                ))}
              </ol>
            </>
          )}
          {live && pending && !empty && (
            <p className="mt-2 flex items-center gap-1.5 ps-3.5 text-[11.5px] text-ink-soft">
              <span className="flex gap-0.5" aria-hidden="true">
                <span className="h-1 w-1 rounded-full bg-ink-faint" />
                <span className="h-1 w-1 rounded-full bg-ink-faint/70" />
                <span className="h-1 w-1 rounded-full bg-ink-faint/40" />
              </span>
              {t('notepad.transcribing', 'Transcribing…')}
            </p>
          )}
        </div>
      </div>

      {live && detached && (
        <button
          type="button"
          onClick={jumpToLive}
          className="absolute bottom-3 left-1/2 inline-flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-full border border-hairline bg-raised px-3 text-[12px] font-medium text-ink shadow-[0_2px_8px_rgb(27_26_23/0.14)] hover:bg-panel"
        >
          {unseen && <span className="h-1.5 w-1.5 rounded-full bg-ember" aria-hidden="true" />}
          <ArrowDown className="h-3.5 w-3.5 text-signal" />
          {t('notepad.jumpToLive', 'Jump to live')}
        </button>
      )}
    </div>
  )
})

// ── Turn ─────────────────────────────────────────────────────────

interface TurnRowProps {
  turn: Turn
  label: string
  onRename?: (source: SegmentSource, name: string) => void
  translateTo: string
  translating: boolean
}

/** Same segments (by identity) → no re-render, although the Turn object is new */
function sameTurn(a: TurnRowProps, b: TurnRowProps): boolean {
  if (
    a.label !== b.label ||
    a.onRename !== b.onRename ||
    a.translateTo !== b.translateTo ||
    a.translating !== b.translating ||
    a.turn.segments.length !== b.turn.segments.length
  ) {
    return false
  }
  return a.turn.segments.every((seg, i) => seg === b.turn.segments[i])
}

const TurnRow = memo(function TurnRow({
  turn,
  label,
  onRename,
  translateTo,
  translating
}: TurnRowProps): JSX.Element {
  const { t } = useTranslation()
  const you = turn.source === 'you'
  return (
    <li className="min-w-0">
      <div className="mb-0.5 flex items-baseline gap-2 text-[11.5px]">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full ${
            you ? 'bg-signal' : 'bg-warning'
          }`}
        />
        <SpeakerName
          source={turn.source}
          label={label}
          onRename={onRename}
          className={`font-semibold ${you ? 'text-signal' : 'text-ink'}`}
        />
        <time className="text-[11px] text-ink-faint tabular" dir="ltr">
          {formatTimestamp(turn.startMs)}
        </time>
      </div>
      <div className="space-y-1 ps-3.5">
        {turn.segments.map((seg) => {
          const translated =
            translateTo && seg.translatedTo === translateTo && seg.translation?.trim()
              ? seg.translation.trim()
              : ''
          return (
            <div key={seg.id}>
              <p dir="auto" className="text-[13px] leading-relaxed text-ink text-pretty">
                {seg.text.trim()}
              </p>
              {translated && translated !== seg.text.trim() ? (
                <p
                  dir="auto"
                  lang={translateTo}
                  className="mt-0.5 border-s-2 border-signal/35 ps-2 text-[12.5px] leading-relaxed text-ink-muted text-pretty"
                >
                  {translated}
                </p>
              ) : (
                translateTo &&
                translating &&
                !translated && (
                  <p className="mt-0.5 border-s-2 border-hairline ps-2 text-[11.5px] italic text-ink-faint">
                    {t('notepad.translatingLine', 'translating…')}
                  </p>
                )
              )}
            </div>
          )
        })}
      </div>
    </li>
  )
}, sameTurn)
