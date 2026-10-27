import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AppWindow,
  Check,
  ChevronLeft,
  Download,
  Sparkles,
  Trash2,
  TriangleAlert
} from 'lucide-react'
import type { Meeting, SegmentSource } from '../models/meeting'
import { meetingToMarkdown } from '../services/meeting-ai'
import { summarizeMeeting } from '../services/meetings'
import { useMeeting } from '../hooks/use-meeting'
import { useMeetingAssistant } from '../hooks/use-meeting-assistant'
import { useConfirmDialog } from '../components/confirm-dialog'
import { Page, PageHeader, Spinner } from '../components/ui/primitives'
import { ExpandingSearch } from '../components/ui/expanding-search'
import { MeetingTabs, type MeetingTab } from '../components/meeting/meeting-tabs'
import { SummaryPanel } from '../components/meeting/summary-panel'
import { TranscriptView } from '../components/meeting/transcript-view'
import { NotesEditor } from '../components/meeting/notes-editor'
import { TitleInput } from '../components/meeting/title-input'
import { AskInput, AssistantThread } from '../components/meeting/meeting-assistant'
import { TranslateTranscriptControl } from '../components/meeting/translate-control'
import { formatDate, formatDuration, formatTime } from '../utils/formatting'
import { meetingAIErrorMessage, meetingTitle, speakerName } from '../utils/meeting'

const PAGE_SIZE = 60

/** Meetings library: list grouped by day, and an in-page detail view */
export function Meetings({ initialMeetingId }: { initialMeetingId?: string }): JSX.Element {
  const [openId, setOpenId] = useState<string | null>(initialMeetingId ?? null)
  const scrollTop = useRef(0)

  const open = useCallback((id: string) => {
    const scroller = document.getElementById('main-scroll')
    scrollTop.current = scroller?.scrollTop ?? 0
    scroller?.scrollTo(0, 0)
    setOpenId(id)
  }, [])

  const back = useCallback(() => {
    setOpenId(null)
    requestAnimationFrame(() =>
      document.getElementById('main-scroll')?.scrollTo(0, scrollTop.current)
    )
  }, [])

  return openId ? <MeetingDetail id={openId} onBack={back} /> : <MeetingList onOpen={open} />
}

// ── List ─────────────────────────────────────────────────────────

function MeetingList({ onOpen }: { onOpen: (id: string) => void }): JSX.Element {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [data, setData] = useState<{ meetings: Meeting[]; total: number } | null>(null)
  const [everHad, setEverHad] = useState<boolean | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 200)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let cancelled = false
    window.tapwisper.meetings
      .list({ search: query || undefined, limit })
      .then((result) => {
        if (cancelled) return
        setData(result)
        if (!query) setEverHad(result.total > 0)
      })
      .catch(() => !cancelled && setData({ meetings: [], total: 0 }))
    return () => {
      cancelled = true
    }
  }, [query, limit, reload])

  // Live: new, updated and deleted meetings (coalesced)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const off = window.tapwisper.on('meetings:changed', () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setReload((n) => n + 1), 250)
    })
    return () => {
      off()
      if (timer) clearTimeout(timer)
    }
  }, [])

  const groups = useMemo(() => {
    const out: { label: string; meetings: Meeting[] }[] = []
    for (const m of data?.meetings ?? []) {
      const label = formatDate(m.startedAt)
      const last = out[out.length - 1]
      if (last && last.label === label) last.meetings.push(m)
      else out.push({ label, meetings: [m] })
    }
    return out
  }, [data])

  const startNotes = (): void => {
    void window.tapwisper.meetings.start()
  }

  return (
    <Page>
      <PageHeader
        title={t('meetings.title', 'Meetings')}
        actions={
          <>
            {everHad && (
              <ExpandingSearch
                value={search}
                onChange={setSearch}
                label={t('meetings.search', 'Search titles, notes, transcripts…')}
                className="w-64"
              />
            )}
            <button type="button" className="btn-signal" onClick={startNotes}>
              <span className="h-2 w-2 rounded-full bg-on-signal" aria-hidden="true" />
              {t('notepad.startNotes', 'Start notes')}
            </button>
          </>
        }
      />

      {query && data && (
        <p className="mb-2 text-[12px] text-ink-soft" aria-live="polite">
          {t('meetings.resultCount', '{{count}} results', { count: data.total })}
        </p>
      )}

      {data === null || everHad === null ? (
        <div className="flex justify-center py-8 text-ink-faint">
          <Spinner className="h-5 w-5" />
        </div>
      ) : !everHad ? (
        <div className="grain-hero flex flex-col items-center rounded-2xl px-5 pb-10 pt-12 text-center">
          <p className="font-display text-[18px] text-ink">
            {t('meetings.emptyTitle', 'No meetings yet')}
          </p>
          <p className="mt-1 max-w-[420px] text-[13px] leading-snug text-ink-muted text-pretty">
            {t(
              'meetings.emptyBody',
              'Start notes when a call begins — you get a transcript and a summary.'
            )}
          </p>
        </div>
      ) : data.meetings.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-ink-muted">
          {t('home.noResults', 'No results found')}
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.label}>
              <h3 className="pb-0.5 pt-2 text-[12px] text-ink-soft">{group.label}</h3>
              <ul className="-mx-2">
                {group.meetings.map((m) => (
                  <MeetingRow key={m.id} meeting={m} onOpen={onOpen} />
                ))}
              </ul>
            </div>
          ))}
          {data.meetings.length < data.total && (
            <div className="flex justify-center">
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
              >
                {t('home.loadMore', 'Show older')}
              </button>
            </div>
          )}
        </div>
      )}
    </Page>
  )
}

const MeetingRow = memo(function MeetingRow({
  meeting,
  onOpen
}: {
  meeting: Meeting
  onOpen: (id: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await summarizeMeeting(meeting.id)
    } catch (err) {
      setError(meetingAIErrorMessage(t, err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="group relative flex gap-3 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-panel focus-within:bg-panel">
      <time
        dateTime={new Date(meeting.startedAt).toISOString()}
        className="w-[60px] shrink-0 whitespace-nowrap pt-[2px] text-[11.5px] text-ink-soft tabular"
      >
        {formatTime(meeting.startedAt)}
      </time>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpen(meeting.id)}
          title={meeting.appName ?? undefined}
          className="block w-full min-w-0 text-start after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-signal"
        >
          <span
            className={`block truncate text-[13px] ${
              meeting.title.trim() ? 'text-ink' : 'text-ink-muted'
            }`}
          >
            <bdi>{meetingTitle(t, meeting)}</bdi>
          </span>
        </button>
        {meeting.status !== 'done' && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-soft">
            <StatusBadge status={meeting.status} />
            {meeting.status === 'interrupted' && !meeting.summary.trim() && (
              <button
                type="button"
                className="relative z-[1] inline-flex items-center gap-1 rounded-md px-1 text-[11.5px] font-medium text-signal hover:bg-signal-tint disabled:opacity-60"
                onClick={generate}
                disabled={busy}
              >
                {busy ? <Spinner className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                {t('notepad.generateSummary', 'Generate summary')}
              </button>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-1 text-[11.5px] text-danger">
            {error}
          </p>
        )}
      </div>
      {meeting.durationSeconds > 0 && (
        <span className="shrink-0 pt-[2px] text-[11.5px] text-ink-soft tabular">
          {formatDuration(meeting.durationSeconds)}
        </span>
      )}
    </li>
  )
})

/** "Today · 09:30 · 42m · 5,240 words" */
function MetaText({ meeting, withDate }: { meeting: Meeting; withDate: boolean }): JSX.Element {
  const { t } = useTranslation()
  const parts: string[] = []
  if (withDate) parts.push(`${formatDate(meeting.startedAt)} · ${formatTime(meeting.startedAt)}`)
  if (meeting.durationSeconds > 0) parts.push(formatDuration(meeting.durationSeconds))
  if (meeting.wordCount > 0) {
    parts.push(t('meetings.words', '{{count}} words', { count: meeting.wordCount }))
  }
  if (withDate && meeting.appName) parts.push(meeting.appName)
  return <span className="tabular">{parts.join(' · ')}</span>
}

function StatusBadge({ status }: { status: Meeting['status'] }): JSX.Element | null {
  const { t } = useTranslation()
  if (status === 'processing') {
    return (
      <span className="inline-flex items-center gap-1 text-ink-muted">
        <Spinner className="h-3 w-3 text-signal" />
        {t('notepad.summarizing', 'Summarizing…')}
      </span>
    )
  }
  if (status === 'recording') {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-ember">
        <span className="h-1.5 w-1.5 rounded-full bg-ember" aria-hidden="true" />
        {t('notepad.statusRecording', 'Recording')}
      </span>
    )
  }
  if (status === 'interrupted') {
    return (
      <span className="inline-flex items-center gap-1 text-warning">
        <TriangleAlert className="h-3 w-3" />
        {t('meetings.statusInterrupted', 'Interrupted')}
      </span>
    )
  }
  return null
}

// ── Detail ───────────────────────────────────────────────────────

function MeetingDetail({ id, onBack }: { id: string; onBack: () => void }): JSX.Element {
  const { t } = useTranslation()
  const { meeting, segments, loading, deleted } = useMeeting(id)
  const { confirm, dialog } = useConfirmDialog()
  const [tab, setTab] = useState<MeetingTab>('summary')
  const [lang, setLang] = useState('')
  const [exportState, setExportState] = useState<'idle' | 'saved'>('idle')

  // Default to the language the transcript was already translated into
  const langPicked = useRef(false)
  useEffect(() => {
    if (langPicked.current || loading) return
    const found = segments.find((s) => s.translatedTo)?.translatedTo
    if (found) setLang(found)
    langPicked.current = true
  }, [loading, segments])

  useEffect(() => {
    if (deleted) onBack()
  }, [deleted, onBack])

  useEffect(() => {
    if (exportState !== 'saved') return
    const timer = setTimeout(() => setExportState('idle'), 2000)
    return () => clearTimeout(timer)
  }, [exportState])

  const contextRef = useRef({ meeting, segments })
  contextRef.current = { meeting, segments }
  const assistant = useMeetingAssistant(
    meeting ? id : null,
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

  const renameSpeaker = useCallback((source: SegmentSource, name: string) => {
    const current = contextRef.current.meeting
    if (!current) return
    void window.tapwisper.meetings.update(current.id, {
      speakerNames: { ...current.speakerNames, [source]: name }
    })
  }, [])

  const tabs = useMemo(
    () => [
      { id: 'summary' as const, label: t('notepad.tabSummary', 'Summary') },
      { id: 'transcript' as const, label: t('notepad.tabTranscript', 'Transcript') },
      { id: 'notes' as const, label: t('notepad.tabNotes', 'My notes') }
    ],
    [t]
  )

  if (!meeting) {
    return (
      <Page>
        <BackButton onBack={onBack} />
        <div className="flex justify-center py-10 text-ink-faint">
          {loading ? (
            <Spinner className="h-5 w-5" />
          ) : (
            <p className="text-[13px] text-ink-muted">
              {t('meetings.notFound', 'This meeting is no longer available.')}
            </p>
          )}
        </div>
      </Page>
    )
  }

  const exportMarkdown = async (): Promise<void> => {
    const markdown = meetingToMarkdown({
      ...meeting,
      segments,
      labels: {
        summary: t('notepad.tabSummary', 'Summary'),
        notes: t('notepad.tabNotes', 'My notes'),
        transcript: t('notepad.tabTranscript', 'Transcript'),
        untitled: t('notepad.untitled', 'Untitled meeting')
      }
    })
    const result = await window.tapwisper.meetings.exportMarkdown(
      meetingTitle(t, meeting),
      markdown
    )
    if (result.saved) setExportState('saved')
  }

  const remove = async (): Promise<void> => {
    const ok = await confirm({
      title: t('meetings.deleteTitle', 'Delete this meeting?'),
      message: t(
        'meetings.deleteMessage',
        'Its transcript, notes and summary will be removed from this device.'
      )
    })
    if (!ok) return
    await window.tapwisper.meetings.delete(meeting.id)
    onBack()
  }

  const live = meeting.status === 'recording'

  return (
    <Page width="wide">
      <div className="mb-1 flex items-center justify-between gap-2">
        <BackButton onBack={onBack} />
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="icon-btn"
            onClick={() => void window.tapwisper.meetings.openNotepad(meeting.id)}
            aria-label={t('meetings.openNotepad', 'Open in notepad')}
            title={t('meetings.openNotepad', 'Open in notepad')}
          >
            <AppWindow className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={exportMarkdown}
            aria-label={t('meetings.export', 'Export Markdown')}
            title={
              exportState === 'saved'
                ? t('meetings.exported', 'Saved')
                : t('meetings.export', 'Export Markdown')
            }
          >
            {exportState === 'saved' ? (
              <Check className="h-4 w-4 text-success" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </button>
          {exportState === 'saved' && (
            <span role="status" className="sr-only">
              {t('meetings.exported', 'Saved')}
            </span>
          )}
          <button
            type="button"
            className="icon-btn hover:!bg-danger-tint hover:!text-danger"
            onClick={remove}
            aria-label={t('meetings.delete', 'Delete meeting')}
            title={t('meetings.delete', 'Delete meeting')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <header className="mb-3 animate-rise">
        <TitleInput
          meetingId={meeting.id}
          title={meeting.title}
          className="-mx-1.5 h-9 px-1.5 text-[22px] [text-align:match-parent]"
        />
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-soft">
          <MetaText meeting={meeting} withDate />
          <StatusBadge status={meeting.status} />
        </p>
      </header>

      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_248px]">
        <div className="min-w-0">
          <MeetingTabs
            tabs={tabs}
            value={tab}
            onChange={setTab}
            label={t('notepad.tabsLabel', 'Meeting views')}
            idBase="meeting"
            className="mb-3"
          />
          <div id={`meeting-panel-${tab}`} role="tabpanel" aria-labelledby={`meeting-tab-${tab}`}>
            {tab === 'summary' && <SummaryPanel meeting={meeting} live={live} />}
            {tab === 'transcript' && (
              <>
                <div className="mb-2 flex justify-end">
                  <TranslateTranscriptControl
                    meetingId={meeting.id}
                    segments={segments}
                    value={lang}
                    onChange={setLang}
                  />
                </div>
                <TranscriptView
                  segments={segments}
                  speakerNames={meeting.speakerNames}
                  onRenameSpeaker={renameSpeaker}
                  translateTo={lang}
                  padding="py-1"
                />
              </>
            )}
            {tab === 'notes' && <NotesEditor meetingId={meeting.id} notes={meeting.notes} />}
          </div>
        </div>

        <aside className="space-y-6 md:sticky md:top-3">
          <section aria-labelledby="ask-title">
            <h2 id="ask-title" className="section-label mb-2">
              {t('notepad.askLabel', 'Ask about this meeting')}
            </h2>
            <AssistantThread
              items={assistant.items}
              onDismiss={assistant.dismiss}
              className="mb-2 max-h-[340px] overflow-y-auto"
            />
            <AskInput onAsk={assistant.ask} busy={assistant.busy} />
            {assistant.items.length === 0 && (
              <p className="mt-1.5 text-[11.5px] leading-snug text-ink-soft">
                {t('meetings.askHint', 'e.g. “What did we decide about pricing?”')}
              </p>
            )}
          </section>
          <SpeakersCard names={meeting.speakerNames} onRename={renameSpeaker} />
        </aside>
      </div>
      {dialog}
    </Page>
  )
}

function BackButton({ onBack }: { onBack: () => void }): JSX.Element {
  const { t } = useTranslation()
  return (
    <button type="button" className="btn-ghost btn-sm -ms-2.5" onClick={onBack}>
      <ChevronLeft className="h-4 w-4 rtl-flip" />
      {t('meetings.title', 'Meetings')}
    </button>
  )
}

/** Rename "You" / "Others" (used in the transcript, summary and answers) */
const SpeakersCard = memo(function SpeakersCard({
  names,
  onRename
}: {
  names: Partial<Record<SegmentSource, string>>
  onRename: (source: SegmentSource, name: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="speakers-title">
      <h2 id="speakers-title" className="section-label mb-1.5">
        {t('meetings.speakers', 'Speakers')}
      </h2>
      <div className="space-y-1.5">
        {(['you', 'others'] as const).map((source) => (
          <SpeakerField
            key={source}
            source={source}
            value={names[source] ?? ''}
            placeholder={speakerName(t, source)}
            onRename={onRename}
          />
        ))}
      </div>
      <p className="mt-1.5 text-[11.5px] leading-snug text-ink-soft">
        {t('meetings.speakersHint', '“Others” is everyone on the call’s audio.')}
      </p>
    </section>
  )
})

function SpeakerField({
  source,
  value,
  placeholder,
  onRename
}: {
  source: SegmentSource
  value: string
  placeholder: string
  onRename: (source: SegmentSource, name: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = (): void => {
    if (draft.trim() !== value.trim()) onRename(source, draft.trim())
  }
  return (
    <label className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${source === 'you' ? 'bg-signal' : 'bg-warning'}`}
      />
      <span className="sr-only">
        {t('notepad.renameSpeakerNamed', 'Rename speaker {{name}}', { name: placeholder })}
      </span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        placeholder={placeholder}
        maxLength={40}
        dir={draft ? 'auto' : undefined}
        className="field h-7 text-[12.5px]"
      />
    </label>
  )
}
