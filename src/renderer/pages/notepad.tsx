import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AppWindow,
  ChevronLeft,
  FileText,
  History,
  Mic,
  NotebookPen,
  Pause,
  Play,
  Plus,
  ScrollText,
  Sparkles,
  Square,
  TriangleAlert,
  Volume2,
  X
} from 'lucide-react'
import {
  useMeetingRecorder,
  type MeetingAudioState,
  type MeetingRecorder
} from '../hooks/use-meeting-recorder'
import { useMeeting } from '../hooks/use-meeting'
import { useMeetingAssistant } from '../hooks/use-meeting-assistant'
import type { Meeting, MeetingSegment, SegmentSource } from '../models/meeting'
import { MeetingTabs, type MeetingTab } from '../components/meeting/meeting-tabs'
import { NotesEditor } from '../components/meeting/notes-editor'
import { TranscriptView } from '../components/meeting/transcript-view'
import { SummaryPanel } from '../components/meeting/summary-panel'
import { AskInput, AssistantThread } from '../components/meeting/meeting-assistant'
import { TitleInput } from '../components/meeting/title-input'
import { RecordingClock, SourceMeter, levelStep } from '../components/meeting/recording-status'
import {
  LiveTranslateControl,
  TranslateTranscriptControl,
  useMeetingTranslateTo
} from '../components/meeting/translate-control'
import { Spinner } from '../components/ui/primitives'
import { formatDate, formatDuration, formatTime } from '../utils/formatting'
import { meetingTitle, recorderErrorMessage } from '../utils/meeting'

// ── Recorder source ──────────────────────────────────────────────
// Screenshot builds (`electron-vite build --mode screenshot`) read a mocked
// recorder from the page; in every other build this branch is removed.

function useScreenshotRecorder(): MeetingRecorder {
  const [, rerender] = useState(0)
  useEffect(() => {
    const onChange = (): void => rerender((n) => n + 1)
    window.addEventListener('mock-recorder', onChange)
    return () => window.removeEventListener('mock-recorder', onChange)
  }, [])
  return (window as unknown as { __MOCK_RECORDER__: MeetingRecorder }).__MOCK_RECORDER__
}

const useRecorder: () => MeetingRecorder =
  import.meta.env.MODE === 'screenshot' ? useScreenshotRecorder : useMeetingRecorder

const IS_MAC = window.tapwisper.platform.os === 'darwin'

interface NotepadRequest {
  meetingId?: string
  start?: boolean
  appName?: string
}

function isRequest(value: unknown): value is NotepadRequest {
  return !!value && typeof value === 'object'
}

/** Most common translation language among the segments ('' if none) */
function translatedLanguage(segments: MeetingSegment[]): string {
  const counts = new Map<string, number>()
  for (const s of segments)
    if (s.translatedTo) counts.set(s.translatedTo, (counts.get(s.translatedTo) ?? 0) + 1)
  let best = ''
  let max = 0
  counts.forEach((n, code) => {
    if (n > max) [best, max] = [code, n]
  })
  return best
}

// ── Page ─────────────────────────────────────────────────────────

/**
 * Floating meeting notepad (own window, `#/notepad`). It runs the recorder:
 * live transcript, the user's notes, "What did I miss?", questions, and the
 * summary once the meeting is stopped.
 */
export function Notepad(): JSX.Element {
  const { t } = useTranslation()
  const recorder = useRecorder()
  const recorderRef = useRef(recorder)
  recorderRef.current = recorder

  const [viewId, setViewId] = useState<string | null>(null)
  const [tab, setTab] = useState<MeetingTab>('notes')
  const [translateTo, setTranslateTo] = useMeetingTranslateTo()
  const [viewLang, setViewLang] = useState('')

  const live = recorder.status !== 'idle'
  const stored = useMeeting(live ? null : viewId)
  const meeting: Meeting | null = live ? recorder.meeting : stored.meeting
  const segments = live ? recorder.segments : stored.segments
  const meetingId = meeting?.id ?? null

  // ── Actions ──────────────────────────────────────────────────
  const start = useCallback(async (appName?: string) => {
    setTab('notes')
    setViewId(null)
    await recorderRef.current.start(appName ? { appName } : undefined)
  }, [])

  const stop = useCallback(async () => {
    const id = await recorderRef.current.stop()
    if (id) {
      setViewId(id)
      setTab('summary')
    }
  }, [])

  const openInApp = useCallback((id: string) => {
    void window.tapwisper.window.show('main')
    void window.tapwisper.window.send('main', 'meetings:open', id)
  }, [])

  // Requests from the main process (tray, detection, main window)
  useEffect(() => {
    const offRequest = window.tapwisper.on('notepad:request', (payload: unknown) => {
      if (!isRequest(payload)) return
      const current = recorderRef.current
      if (payload.start) {
        if (current.status === 'idle') void start(payload.appName)
      } else if (payload.meetingId && current.status === 'idle') {
        setViewId(payload.meetingId)
        setTab('summary')
      }
    })
    const offStop = window.tapwisper.on('notepad:stop', () => {
      if (recorderRef.current.status !== 'idle') void stop()
    })
    return () => {
      offRequest()
      offStop()
    }
  }, [start, stop])

  // Show the translation language a saved meeting was translated into
  useEffect(() => {
    if (!live && !stored.loading) setViewLang(translatedLanguage(stored.segments))
    // Only when another meeting loads, not on each translated line
  }, [viewId, stored.loading, live])

  const renameSpeaker = useCallback(
    (source: SegmentSource, name: string) => {
      if (!meeting) return
      void window.tapwisper.meetings.update(meeting.id, {
        speakerNames: { ...meeting.speakerNames, [source]: name }
      })
    },
    [meeting]
  )

  // ── Assistant ("What did I miss?", questions) ────────────────
  const contextRef = useRef({ meeting, segments })
  contextRef.current = { meeting, segments }
  const assistant = useMeetingAssistant(
    meetingId,
    useCallback(() => {
      const { meeting: m, segments: s } = contextRef.current
      if (!m) return null
      return {
        segments: s,
        notes: m.notes,
        speakerNames: m.speakerNames,
        appName: m.appName,
        startedAt: m.startedAt,
        summary: m.summary
      }
    }, [])
  )

  // ── Render ───────────────────────────────────────────────────
  if (!meeting) {
    return (
      <Shell>
        <TopBar>
          <span className="text-[12px] font-medium text-ink-muted">
            {t('notepad.windowTitle', 'Meeting notes')}
          </span>
        </TopBar>
        {live || stored.loading ? (
          <div className="flex flex-1 items-center justify-center text-ink-faint">
            <Spinner className="h-5 w-5" />
          </div>
        ) : (
          <StartScreen
            onStart={() => void start()}
            onOpen={(id) => {
              setViewId(id)
              setTab('summary')
            }}
            error={recorder.error ? recorderErrorMessage(t, recorder.error) : null}
            starting={recorder.status === 'starting'}
          />
        )}
      </Shell>
    )
  }

  const summarizing = meeting.status === 'processing'
  const paused = recorder.status === 'paused'
  const transcriptLang = live ? translateTo : viewLang

  return (
    <Shell>
      <TopBar>
        {live ? (
          <>
            <RecordingClock seconds={Math.floor(recorder.elapsedMs / 1000)} paused={paused} />
            <LiveStatus status={recorder.status} pending={recorder.pendingChunks > 0} />
            <span className="flex-1" />
            <span className="no-drag flex items-center">
              <SourceMeter kind="mic" step={levelStep(recorder.levels.you)} paused={paused} />
              <SourceMeter
                kind="meeting"
                step={levelStep(recorder.levels.others)}
                state={recorder.meetingAudio}
                paused={paused}
              />
            </span>
          </>
        ) : (
          <>
            <button
              type="button"
              className="no-drag icon-btn -ms-1 h-6 w-6"
              onClick={() => setViewId(null)}
              aria-label={t('notepad.backToStart', 'Back to recent meetings')}
              title={t('notepad.backToStart', 'Back to recent meetings')}
            >
              <ChevronLeft className="h-4 w-4 rtl-flip" />
            </button>
            <MeetingMeta meeting={meeting} />
          </>
        )}
      </TopBar>

      {/* Title */}
      <div className="shrink-0 px-2.5 pb-1">
        <TitleInput
          meetingId={meeting.id}
          title={meeting.title}
          className="h-8 px-1.5 text-[18px] [text-align:match-parent]"
        />
      </div>

      <Notices
        live={live}
        meetingId={meeting.id}
        meetingAudio={recorder.meetingAudio}
        error={live && recorder.error ? recorderErrorMessage(t, recorder.error) : null}
      />

      <NotepadTabs value={tab} onChange={setTab} summarizing={summarizing} />

      {/* Tab panels */}
      <div
        id={`notepad-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`notepad-tab-${tab}`}
        className="relative min-h-0 flex-1"
      >
        {tab === 'notes' && <NotesEditor meetingId={meeting.id} notes={meeting.notes} fill />}
        {tab === 'transcript' && (
          <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-center justify-end gap-2 border-b border-hairline/70 px-3 py-1.5">
              {live ? (
                <LiveTranslateControl value={translateTo} onChange={setTranslateTo} />
              ) : (
                <TranslateTranscriptControl
                  meetingId={meeting.id}
                  segments={segments}
                  value={viewLang}
                  onChange={setViewLang}
                />
              )}
            </div>
            <div className="min-h-0 flex-1">
              <TranscriptView
                segments={segments}
                speakerNames={meeting.speakerNames}
                onRenameSpeaker={renameSpeaker}
                translateTo={transcriptLang}
                translating={live}
                live={live}
                pending={live && recorder.pendingChunks > 0}
                className="h-full overflow-y-auto"
              />
            </div>
          </div>
        )}
        {tab === 'summary' && (
          <div className="h-full overflow-y-auto">
            <SummaryPanel meeting={meeting} live={live} dense />
          </div>
        )}
      </div>

      {/* Recap / answers */}
      {assistant.items.length > 0 && (
        <div className="max-h-[42%] shrink-0 overflow-y-auto border-t border-hairline bg-canvas/60 px-2.5 py-2">
          <AssistantThread
            items={assistant.items}
            onDismiss={assistant.dismiss}
            onClear={assistant.clear}
          />
        </div>
      )}

      {/* Footer */}
      <footer className="shrink-0 space-y-2 border-t border-hairline px-2.5 pb-2.5 pt-2">
        <AskInput onAsk={assistant.ask} busy={assistant.busy} />
        {live ? (
          <LiveControls
            paused={paused}
            stopping={recorder.status === 'stopping'}
            canRecap={segments.length > 0}
            onPause={recorder.pause}
            onResume={recorder.resume}
            onRecap={assistant.recap}
            onStop={stop}
          />
        ) : (
          <div className="flex items-center gap-1.5">
            <button type="button" className="btn-secondary btn-sm" onClick={() => void start()}>
              <Plus className="h-3.5 w-3.5" />
              {t('notepad.newMeeting', 'New meeting')}
            </button>
            <span className="flex-1" />
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => openInApp(meeting.id)}
            >
              <AppWindow className="h-3.5 w-3.5" />
              {t('notepad.openInApp', 'Open in TapWisper')}
            </button>
          </div>
        )}
      </footer>
    </Shell>
  )
}

// ── Layout pieces ────────────────────────────────────────────────

function Shell({ children }: { children: ReactNode }): JSX.Element {
  return <div className="flex h-screen flex-col overflow-hidden bg-raised text-ink">{children}</div>
}

/** Window drag area; on macOS it starts after the traffic lights */
function TopBar({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      className={`drag-region flex shrink-0 items-center gap-2 pe-2 ${
        IS_MAC ? 'h-[38px] ps-3' : 'h-9 ps-3'
      }`}
      style={IS_MAC ? { paddingLeft: 78 } : undefined}
    >
      {children}
    </div>
  )
}

const LiveStatus = memo(function LiveStatus({
  status,
  pending
}: {
  status: MeetingRecorder['status']
  pending: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const label =
    status === 'starting'
      ? t('notepad.statusStarting', 'Starting…')
      : status === 'stopping'
        ? t('notepad.statusStopping', 'Finishing…')
        : status === 'paused'
          ? t('notepad.statusPaused', 'Paused')
          : pending
            ? t('notepad.transcribing', 'Transcribing…')
            : t('notepad.statusRecording', 'Recording')
  return (
    <span className="truncate text-[12px] text-ink-muted" role="status">
      {label}
    </span>
  )
})

const MeetingMeta = memo(function MeetingMeta({ meeting }: { meeting: Meeting }): JSX.Element {
  const { t } = useTranslation()
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-muted">
      {meeting.status === 'processing' ? (
        <span className="flex items-center gap-1.5 font-medium text-ink" role="status">
          <Spinner className="h-3 w-3 text-signal" />
          {t('notepad.summarizing', 'Summarizing…')}
        </span>
      ) : (
        <span className="truncate">
          {formatDate(meeting.startedAt)} · {formatTime(meeting.startedAt)}
          {meeting.durationSeconds > 0 && ` · ${formatDuration(meeting.durationSeconds)}`}
        </span>
      )}
      {meeting.status === 'interrupted' && (
        <span className="chip !border-warning/30 !bg-warning-tint !text-warning">
          {t('meetings.statusInterrupted', 'Interrupted')}
        </span>
      )}
    </span>
  )
})

const NotepadTabs = memo(function NotepadTabs({
  value,
  onChange,
  summarizing
}: {
  value: MeetingTab
  onChange: (tab: MeetingTab) => void
  summarizing: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const tabs = useMemo(
    () => [
      { id: 'notes' as const, label: t('notepad.tabNotes', 'My notes'), icon: <NotebookPen /> },
      {
        id: 'transcript' as const,
        label: t('notepad.tabTranscript', 'Transcript'),
        icon: <ScrollText />
      },
      {
        id: 'summary' as const,
        label: t('notepad.tabSummary', 'Summary'),
        icon: <Sparkles />,
        badge: summarizing ? <Spinner className="ms-0.5 h-2.5 w-2.5 text-signal" /> : undefined
      }
    ],
    [t, summarizing]
  )
  return (
    <MeetingTabs
      tabs={tabs}
      value={value}
      onChange={onChange}
      label={t('notepad.tabsLabel', 'Meeting views')}
      idBase="notepad"
      className="shrink-0 px-2"
    />
  )
})

/** Consent reminder, meeting-audio problems and recorder errors */
const Notices = memo(function Notices({
  live,
  meetingId,
  meetingAudio,
  error
}: {
  live: boolean
  meetingId: string
  meetingAudio: MeetingAudioState
  error: string | null
}): JSX.Element | null {
  const { t } = useTranslation()
  const [consentHidden, setConsentHidden] = useState<string | null>(null)
  const [audioHidden, setAudioHidden] = useState<string | null>(null)

  const audioNotice =
    meetingAudio === 'denied'
      ? t(
          'notepad.audioDenied',
          'Only your microphone is recorded. To hear the others, allow TapWisper in System Settings → Privacy & Security → Screen & System Audio Recording, then start again.'
        )
      : meetingAudio === 'unavailable'
        ? t(
            'notepad.audioUnavailable',
            'Microphone only: this computer can’t capture meeting audio. Works for in-person meetings or calls on speakers.'
          )
        : meetingAudio === 'off'
          ? t(
              'notepad.audioOff',
              'Meeting audio is off in Settings, so only your microphone is recorded.'
            )
          : null

  const showConsent = live && consentHidden !== meetingId
  const showAudio = live && !!audioNotice && audioHidden !== meetingId
  if (!error && !showConsent && !showAudio) return null

  return (
    <div className="shrink-0 space-y-1 px-3 pb-1.5">
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-[11.5px] leading-snug text-danger">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
      {showAudio && (
        <NoticeLine
          tone={meetingAudio === 'denied' ? 'warning' : 'muted'}
          icon={<Volume2 className="h-3.5 w-3.5" />}
          onDismiss={() => setAudioHidden(meetingId)}
        >
          {audioNotice}
        </NoticeLine>
      )}
      {showConsent && (
        <NoticeLine
          tone="muted"
          icon={<Mic className="h-3.5 w-3.5" />}
          onDismiss={() => setConsentHidden(meetingId)}
        >
          {t('notepad.consent', 'Let everyone know you’re recording.')}
        </NoticeLine>
      )}
    </div>
  )
})

function NoticeLine({
  tone,
  icon,
  onDismiss,
  children
}: {
  tone: 'warning' | 'muted'
  icon: ReactNode
  onDismiss: () => void
  children: ReactNode
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div
      className={`flex items-start gap-1.5 rounded-lg px-2 py-1 text-[11.5px] leading-snug ${
        tone === 'warning'
          ? 'bg-warning-tint text-ink-muted [&>svg]:text-warning'
          : 'bg-sunken/70 text-ink-muted'
      }`}
    >
      <span className={`mt-px shrink-0 ${tone === 'warning' ? 'text-warning' : 'text-ink-soft'}`}>
        {icon}
      </span>
      <p className="min-w-0 flex-1 text-pretty">{children}</p>
      <button
        type="button"
        className="-me-1 -mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded text-ink-faint hover:text-ink"
        onClick={onDismiss}
        aria-label={t('common.dismiss', 'Dismiss')}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

const LiveControls = memo(function LiveControls({
  paused,
  stopping,
  canRecap,
  onPause,
  onResume,
  onRecap,
  onStop
}: {
  paused: boolean
  stopping: boolean
  canRecap: boolean
  onPause: () => void
  onResume: () => void
  onRecap: () => void
  onStop: () => void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className="btn-secondary btn-sm w-8 px-0"
        onClick={paused ? onResume : onPause}
        disabled={stopping}
        aria-label={paused ? t('notepad.resume', 'Resume') : t('notepad.pause', 'Pause')}
        title={paused ? t('notepad.resume', 'Resume') : t('notepad.pause', 'Pause')}
      >
        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        className="btn-secondary btn-sm min-w-0"
        onClick={onRecap}
        disabled={!canRecap || stopping}
      >
        <History className="h-3.5 w-3.5 shrink-0 text-signal" />
        <span className="truncate">{t('notepad.whatDidIMiss', 'What did I miss?')}</span>
      </button>
      <span className="flex-1" />
      <button
        type="button"
        className="btn btn-sm bg-ink px-3 text-raised hover:bg-ink/85"
        onClick={onStop}
        disabled={stopping}
      >
        {stopping ? (
          <Spinner className="h-3 w-3" />
        ) : (
          <Square className="h-3 w-3 fill-ember text-ember" />
        )}
        {t('notepad.stop', 'Stop')}
      </button>
    </div>
  )
})

// ── Start screen ─────────────────────────────────────────────────

interface Readiness {
  mic: 'ready' | 'denied' | 'unknown'
  meeting: 'ready' | 'permission' | 'monitor' | 'unsupported' | 'off'
}

function StartScreen({
  onStart,
  onOpen,
  error,
  starting
}: {
  onStart: () => void
  onOpen: (id: string) => void
  error: string | null
  starting: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const [recent, setRecent] = useState<Meeting[] | null>(null)
  const [ready, setReady] = useState<Readiness | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      window.tapwisper.meetings
        .list({ limit: 5 })
        .then((r) => !cancelled && setRecent(r.meetings))
        .catch(() => !cancelled && setRecent([]))
    }
    load()
    const off = window.tapwisper.on('meetings:changed', load)
    Promise.all([
      window.tapwisper.permissions.check(),
      window.tapwisper.meetings.systemAudioSupport(),
      window.tapwisper.store.get('captureMeetingAudio')
    ])
      .then(([perms, support, capture]) => {
        if (cancelled) return
        const micStatus = (perms as { microphone?: string } | null)?.microphone
        setReady({
          mic:
            micStatus === 'denied' || micStatus === 'restricted'
              ? 'denied'
              : micStatus
                ? 'ready'
                : 'unknown',
          meeting:
            capture === false
              ? 'off'
              : support.reason === 'permission-needed'
                ? 'permission'
                : support.reason === 'linux-use-monitor'
                  ? 'monitor'
                  : support.supported
                    ? 'ready'
                    : 'unsupported'
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
      off()
    }
  }, [])

  const meetingText: Record<Readiness['meeting'], string> = {
    ready: t('notepad.readyMeeting', 'Ready'),
    permission: t('notepad.readyMeetingPermission', 'Asks for permission on first use'),
    monitor: t('notepad.readyMeetingMonitor', 'Uses a “Monitor of …” input if available'),
    unsupported: t('notepad.readyMeetingUnsupported', 'Not available — mic only'),
    off: t('notepad.readyMeetingOff', 'Off in Settings')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">
      <div className="pt-1">
        <h1 className="font-display text-[20px] leading-tight text-ink">
          {t('notepad.startTitle', 'Take meeting notes')}
        </h1>
        <p className="mt-1 text-[12.5px] leading-snug text-ink-muted text-pretty">
          {t(
            'notepad.startBody',
            'Records your microphone and the meeting’s audio on this computer — no bot joins the call. You get a live transcript and a summary when you stop.'
          )}
        </p>
      </div>

      <button
        type="button"
        className="btn-signal btn-lg mt-3 w-full"
        onClick={onStart}
        disabled={starting}
      >
        {starting ? (
          <Spinner className="h-3.5 w-3.5" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-on-signal" />
        )}
        {t('notepad.startNotes', 'Start notes')}
      </button>
      {error && (
        <p
          role="alert"
          className="mt-2 flex items-start gap-1.5 text-[12px] leading-snug text-danger"
        >
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      <ul className="mt-3 divide-y divide-hairline rounded-xl border border-hairline">
        <ReadyRow
          icon={<Mic className="h-3.5 w-3.5" />}
          label={t('notepad.sourceMic', 'Your microphone')}
          value={
            !ready
              ? '…'
              : ready.mic === 'denied'
                ? t('notepad.readyMicDenied', 'Blocked — allow it in system settings')
                : t('notepad.readyMeeting', 'Ready')
          }
          ok={ready?.mic !== 'denied'}
        />
        <ReadyRow
          icon={<Volume2 className="h-3.5 w-3.5" />}
          label={t('notepad.sourceMeeting', 'Meeting audio')}
          value={ready ? meetingText[ready.meeting] : '…'}
          ok={ready?.meeting === 'ready'}
          warn={ready?.meeting === 'unsupported' || ready?.meeting === 'off'}
        />
      </ul>
      <p className="mt-1.5 text-[11.5px] text-ink-soft">
        {t('notepad.consent', 'Let everyone know you’re recording.')}
      </p>

      <div className="mt-4">
        <h2 className="section-label mb-1">{t('notepad.recent', 'Recent')}</h2>
        {recent === null ? (
          <div className="flex justify-center py-3 text-ink-faint">
            <Spinner className="h-4 w-4" />
          </div>
        ) : recent.length === 0 ? (
          <p className="py-2 text-[12px] text-ink-muted">
            {t('notepad.noRecent', 'Your meetings will show up here.')}
          </p>
        ) : (
          <ul className="-mx-1.5">
            {recent.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onOpen(m.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-start transition-colors duration-150 hover:bg-panel"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-ink">
                      <bdi>{meetingTitle(t, m)}</bdi>
                    </span>
                    <span className="block truncate text-[11px] text-ink-soft">
                      {formatDate(m.startedAt)} · {formatTime(m.startedAt)}
                      {m.durationSeconds > 0 && ` · ${formatDuration(m.durationSeconds)}`}
                    </span>
                  </span>
                  {m.status === 'processing' && <Spinner className="h-3 w-3 text-signal" />}
                  {m.status === 'recording' && (
                    <span className="h-1.5 w-1.5 rounded-full bg-ember" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ReadyRow({
  icon,
  label,
  value,
  ok,
  warn = false
}: {
  icon: ReactNode
  label: string
  value: string
  ok: boolean
  warn?: boolean
}): JSX.Element {
  return (
    <li className="flex items-center gap-2 px-2.5 py-1.5 text-[12px]">
      <span className="text-ink-soft">{icon}</span>
      <span className="font-medium text-ink">{label}</span>
      <span
        className={`ms-auto flex min-w-0 items-center gap-1.5 truncate text-end ${
          warn ? 'text-warning' : 'text-ink-muted'
        }`}
      >
        {ok && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />}
        <span className="truncate">{value}</span>
      </span>
    </li>
  )
}
