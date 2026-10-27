import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  History as HistoryIcon,
  Pause,
  Play,
  RotateCw,
  Search,
  Sparkles,
  Trash2,
  WandSparkles,
  X
} from 'lucide-react'
import { useStatsStore } from '../store/stats'
import { useActivityStore, type TranscriptionRecord } from '../store/activity'
import { getRecordingUrl, hasRecordings, retranscribeRecord } from '../services/history'
import { formatCompactNumber, formatDate, formatDuration, formatTime } from '../utils/formatting'
import { displayActionName } from '../utils/action-labels'
import { computeStreak, type StreakInfo } from '../utils/streak'
import { useRecordShortcut } from '../hooks/use-record-shortcut'
import { useConfirmDialog } from '../components/confirm-dialog'
import { ShortcutKeys } from '../components/ui/keycap'
import { WaveLine } from '../components/ui/wave'
import { Page, Spinner } from '../components/ui/primitives'

const PAGE_SIZE = 40
const DAY_MS = 24 * 60 * 60 * 1000
/** History window used for the streak (extended when the streak reaches it) */
const STREAK_WINDOW_DAYS = 90
/** Text longer than this is clamped until expanded */
const LONG_TEXT = 260
/** Placeholder used to put a component in the middle of a translated sentence */
const SLOT = '\u0000'

interface AllTimeStats {
  words: number
  seconds: number
}

function isFailed(record: TranscriptionRecord): boolean {
  return record.type === 'voice' && !record.transcription?.trim()
}

/** The text a record produced (AI result for AI actions, else the dictation) */
function primaryText(record: TranscriptionRecord): string {
  if (record.type === 'voice-with-llm' && record.llmResult) return record.llmResult
  return record.transcription || record.llmInput || ''
}

function longDate(lang: string): string {
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }
  try {
    return new Date().toLocaleDateString(lang, options)
  } catch {
    return new Date().toLocaleDateString(undefined, options)
  }
}

function retryErrorMessage(t: TFunction, err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (raw === 'recording-missing') {
    return t(
      'home.recordingMissing',
      'The audio for this dictation was not kept, so it can’t be transcribed again.'
    )
  }
  if (/No API key/i.test(raw)) return raw
  if (/Failed to fetch|NetworkError|network/i.test(raw)) {
    return t('errors.network', 'Network error — check your internet connection.')
  }
  return t('home.retryFailed', 'Transcription failed again: {{error}}', {
    error: raw.length > 140 ? `${raw.slice(0, 137)}…` : raw
  })
}

// ── Page ─────────────────────────────────────────────────────────

export function Home(): JSX.Element {
  const { t, i18n } = useTranslation()
  const { shortcut } = useRecordShortcut()
  const { loadStats, voiceTimeSavedSeconds, aiTimeSavedSeconds } = useStatsStore()
  const { records, totalCount, isLoaded, loadRecords } = useActivityStore()
  const [allTime, setAllTime] = useState<AllTimeStats | null>(null)
  const [streak, setStreak] = useState<StreakInfo>({ streak: 0, lastWeek: Array(7).fill(false) })
  const latestId = records[0]?.id ?? ''

  useEffect(() => {
    loadStats()
    loadRecords()
  }, [loadStats, loadRecords])

  // All-time totals and the day streak, refreshed whenever history changes
  useEffect(() => {
    let cancelled = false
    const now = Date.now()
    const load = async (): Promise<void> => {
      try {
        const totals = (await window.tapwisper.db.activity.getStats(0, now)) as {
          totalWords?: number | null
          totalDuration?: number | null
        } | null
        if (!cancelled) {
          setAllTime({ words: totals?.totalWords ?? 0, seconds: totals?.totalDuration ?? 0 })
        }
      } catch {
        if (!cancelled) setAllTime({ words: 0, seconds: 0 })
      }
      try {
        let windowDays = STREAK_WINDOW_DAYS
        let info: StreakInfo = { streak: 0, lastWeek: Array(7).fill(false) }
        // Widen the window until the streak fits inside it
        for (;;) {
          const rows = ((await window.tapwisper.db.activity.getByDateRange(
            now - windowDays * DAY_MS,
            now
          )) ?? []) as TranscriptionRecord[]
          const stamps = rows
            .filter((r) => r.transcription?.trim() || r.llmResult?.trim())
            .map((r) => r.timestamp)
          info = computeStreak(stamps, now)
          if (info.streak < windowDays - 1 || windowDays >= 3650) break
          windowDays *= 4
        }
        if (!cancelled) setStreak(info)
      } catch {
        // Streak is informational only
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [totalCount, latestId])

  const wpm =
    allTime && allTime.seconds > 0 ? Math.round(allTime.words / (allTime.seconds / 60)) : 0
  const savedSeconds = voiceTimeSavedSeconds + aiTimeSavedSeconds

  const hintParts = t('home.heroHint', 'Hold {{keys}} in any app and start talking.', {
    keys: SLOT
  }).split(SLOT)

  return (
    <Page>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative animate-rise">
        <p className="section-label">{longDate(i18n.language)}</p>
        <h1 className="hero-title mt-3 max-w-[620px] text-balance">
          <Trans i18nKey="home.hero" components={{ em: <em /> }}>
            Say it, and it&apos;s <em>on the page</em>.
          </Trans>
        </h1>
        <p className="mt-5 text-[14.5px] leading-[2] text-ink-muted">
          {hintParts[0]}
          <ShortcutKeys accelerator={shortcut} size="sm" className="-translate-y-px" />
          {hintParts[1]}
        </p>
        <WaveLine
          className="pointer-events-none absolute -top-2 end-0 hidden h-16 w-48 opacity-70 lg:block"
          strokeWidth={1.4}
        />
      </section>

      {/* ── Stats rail ───────────────────────────────────── */}
      <section
        aria-label={t('home.statsLabel', 'Your stats')}
        className="card mt-9 grid grid-cols-2 overflow-hidden md:grid-cols-4 animate-rise [animation-delay:60ms]"
      >
        <Stat
          label={t('home.statWords', 'Words dictated')}
          value={allTime ? formatCompactNumber(allTime.words) : '–'}
          hint={t('home.statWordsHint', 'all time')}
        />
        <Stat
          label={t('home.statPace', 'Average pace')}
          value={wpm > 0 ? String(wpm) : '–'}
          unit={wpm > 0 ? t('home.wpm', 'wpm') : undefined}
          hint={t('home.statPaceHint', 'words per minute')}
        />
        <Stat
          label={t('home.statStreak', 'Day streak')}
          value={String(streak.streak)}
          hint={
            <span className="flex items-center gap-1" aria-hidden="true">
              {streak.lastWeek.map((active, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${
                    active ? (i === 6 ? 'bg-ember' : 'bg-signal') : 'bg-hairline-strong'
                  }`}
                />
              ))}
            </span>
          }
          srHint={t('home.statStreakHint', '{{count}} days in a row', { count: streak.streak })}
        />
        <Stat
          label={t('home.statSaved', 'Time saved')}
          value={formatDuration(savedSeconds)}
          hint={t('home.statSavedHint', 'this week, vs. typing')}
        />
      </section>

      {/* ── History ──────────────────────────────────────── */}
      {!isLoaded ? (
        <div className="flex justify-center py-16 text-ink-faint">
          <Spinner className="h-5 w-5" />
        </div>
      ) : (
        <HistoryList
          totalCount={totalCount}
          refreshToken={`${totalCount}-${latestId}`}
          shortcut={shortcut}
        />
      )}
    </Page>
  )
}

function Stat({
  label,
  value,
  unit,
  hint,
  srHint
}: {
  label: string
  value: string
  unit?: string
  hint: React.ReactNode
  srHint?: string
}): JSX.Element {
  return (
    <div className="border-hairline px-5 py-4 [&:not(:first-child)]:border-s max-md:[&:nth-child(3)]:border-s-0 max-md:[&:nth-child(n+3)]:border-t">
      <p className="section-label">{label}</p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="font-display text-[30px] leading-none text-ink tabular">{value}</span>
        {unit && <span className="text-[12px] text-ink-muted">{unit}</span>}
      </p>
      <div className="mt-2 text-[11.5px] text-ink-soft">{hint}</div>
      {srHint && <span className="sr-only">{srHint}</span>}
    </div>
  )
}

// ── History ──────────────────────────────────────────────────────

interface HistoryListProps {
  totalCount: number
  /** Changes whenever records are added/removed so the list is re-queried */
  refreshToken: string
  shortcut: string
}

interface RetryState {
  busy: boolean
  error?: string
}

function HistoryList({ totalCount, refreshToken, shortcut }: HistoryListProps): JSX.Element {
  const { t } = useTranslation()
  const { confirm, dialog } = useConfirmDialog()
  const { queryRecords, patchRecord, deleteRecord } = useActivityStore()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [items, setItems] = useState<TranscriptionRecord[] | null>(null)
  const [matching, setMatching] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [audio, setAudio] = useState<Record<string, boolean>>({})
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [retry, setRetry] = useState<Record<string, RetryState>>({})
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const checkedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 200)
    return () => clearTimeout(timeout)
  }, [search])

  useEffect(() => setLimit(PAGE_SIZE), [debouncedSearch])

  useEffect(() => {
    let cancelled = false
    queryRecords({ offset: 0, limit, search: debouncedSearch || undefined })
      .then((page) => {
        if (cancelled) return
        setItems(page.records)
        setMatching(page.total)
      })
      .catch(() => {
        if (!cancelled) {
          setItems([])
          setMatching(0)
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMore(false)
      })
    return () => {
      cancelled = true
    }
  }, [queryRecords, limit, debouncedSearch, refreshToken])

  // Which entries still have audio: one batch per newly loaded page
  useEffect(() => {
    if (!items) return
    const unchecked = items.filter((r) => !checkedRef.current.has(r.id)).map((r) => r.id)
    if (unchecked.length === 0) return
    unchecked.forEach((id) => checkedRef.current.add(id))
    let cancelled = false
    let done = false
    hasRecordings(unchecked).then((found) => {
      done = true
      if (!cancelled) setAudio((prev) => ({ ...prev, ...found }))
    })
    return () => {
      cancelled = true
      // Unfinished checks are retried by the next run
      if (!done) unchecked.forEach((id) => checkedRef.current.delete(id))
    }
  }, [items])

  const stopPlayback = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    audioUrlRef.current = null
    setPlayingId(null)
  }, [])

  useEffect(() => stopPlayback, [stopPlayback])

  const togglePlay = async (id: string): Promise<void> => {
    if (playingId === id) {
      stopPlayback()
      return
    }
    stopPlayback()
    try {
      const url = await getRecordingUrl(id)
      if (!url) {
        setAudio((prev) => ({ ...prev, [id]: false }))
        return
      }
      const el = new Audio(url)
      audioRef.current = el
      audioUrlRef.current = url
      el.onended = stopPlayback
      el.onerror = stopPlayback
      setPlayingId(id)
      await el.play()
    } catch {
      stopPlayback()
    }
  }

  const copy = async (record: TranscriptionRecord): Promise<void> => {
    const text = primaryText(record)
    try {
      await window.tapwisper.clipboard.write(text)
    } catch {
      await navigator.clipboard?.writeText(text).catch(() => {})
    }
    setCopiedId(record.id)
    setTimeout(() => setCopiedId((c) => (c === record.id ? null : c)), 1600)
  }

  const runRetry = async (record: TranscriptionRecord): Promise<void> => {
    setRetry((prev) => ({ ...prev, [record.id]: { busy: true } }))
    try {
      const result = await retranscribeRecord(record.id, record.appName)
      const patch: Partial<TranscriptionRecord> = {
        transcription: result.transcription,
        rawTranscription:
          result.rawTranscription !== result.transcription ? result.rawTranscription : null,
        wordCount: result.transcription.split(/\s+/).filter(Boolean).length
      }
      patchRecord(record.id, patch)
      setItems((prev) => prev?.map((r) => (r.id === record.id ? { ...r, ...patch } : r)) ?? prev)
      setRetry((prev) => {
        const next = { ...prev }
        delete next[record.id]
        return next
      })
    } catch (err) {
      if (err instanceof Error && err.message === 'recording-missing') {
        setAudio((prev) => ({ ...prev, [record.id]: false }))
      }
      setRetry((prev) => ({
        ...prev,
        [record.id]: { busy: false, error: retryErrorMessage(t, err) }
      }))
    }
  }

  const remove = async (record: TranscriptionRecord): Promise<void> => {
    const ok = await confirm({
      title: t('home.deleteTitle', 'Delete this entry?'),
      message: t(
        'home.deleteMessage',
        'The text and its saved audio will be removed from this device.'
      )
    })
    if (!ok) return
    if (playingId === record.id) stopPlayback()
    deleteRecord(record.id)
  }

  const groups = useMemo(() => {
    const out: { label: string; records: TranscriptionRecord[] }[] = []
    for (const record of items ?? []) {
      const label = formatDate(record.timestamp)
      if (out.length === 0 || out[out.length - 1].label !== label)
        out.push({ label, records: [record] })
      else out[out.length - 1].records.push(record)
    }
    return out
  }, [items])

  const hintParts = t(
    'home.emptyBody',
    'Hold {{keys}} anywhere and say something. Your dictations will collect here, newest first.',
    {
      keys: SLOT
    }
  ).split(SLOT)

  return (
    <section className="mt-12" aria-labelledby="history-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 id="history-title" className="font-display text-[24px] leading-none text-ink">
            {t('home.historyTitle', 'History')}
          </h2>
          {totalCount > 0 && (
            <span className="text-[12px] text-ink-soft tabular">
              {t('home.activityCount', '{{count}} records', { count: totalCount })}
            </span>
          )}
        </div>
        {totalCount > 0 && (
          <div className="relative w-72 max-w-full">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('home.searchActivity', 'Search history…')}
              aria-label={t('home.searchActivity', 'Search history…')}
              className="field h-9 pe-9 ps-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label={t('home.clearSearch', 'Clear search')}
                className="icon-btn absolute end-1 top-1/2 h-7 w-7 -translate-y-1/2"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {debouncedSearch && items && (
        <p className="mb-3 text-[12.5px] text-ink-muted" aria-live="polite">
          {t('home.resultCount', '{{count}} results', { count: matching })}
        </p>
      )}

      {!items ? (
        <div className="flex justify-center py-12 text-ink-faint">
          <Spinner className="h-5 w-5" />
        </div>
      ) : totalCount === 0 && !debouncedSearch ? (
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-hairline-strong px-8 py-12 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-signal-tint text-signal">
            <HistoryIcon className="h-5 w-5" />
          </span>
          <p className="font-display mt-4 text-[22px] text-ink">
            {t('home.emptyTitle', 'Your history starts with one sentence.')}
          </p>
          <p className="mx-auto mt-3 max-w-[460px] text-[13.5px] leading-[2] text-ink-muted text-balance">
            {hintParts[0]}
            <ShortcutKeys accelerator={shortcut} size="sm" className="-translate-y-px" />
            {hintParts[1]}
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-hairline px-6 py-10 text-center">
          <p className="text-[14px] font-medium text-ink">
            {t('home.noResults', 'No results found')}
          </p>
          <p className="mt-1 text-[12.5px] text-ink-muted">
            {t('home.noResultsDesc', 'Try adjusting your search query')}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.label}>
              <h3 className="section-label mb-2 flex items-center gap-3">
                {group.label}
                <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
              </h3>
              <ul className="-mx-3">
                {group.records.map((record) => (
                  <HistoryRow
                    key={record.id}
                    record={record}
                    hasAudio={audio[record.id] === true}
                    playing={playingId === record.id}
                    copied={copiedId === record.id}
                    retry={retry[record.id]}
                    onPlay={() => togglePlay(record.id)}
                    onCopy={() => copy(record)}
                    onRetry={() => runRetry(record)}
                    onDelete={() => remove(record)}
                  />
                ))}
              </ul>
            </div>
          ))}

          {items.length < matching && (
            <div className="flex justify-center">
              <button
                type="button"
                className="btn-secondary"
                disabled={loadingMore}
                onClick={() => {
                  setLoadingMore(true)
                  setLimit((l) => l + PAGE_SIZE)
                }}
              >
                {loadingMore && <Spinner className="h-3.5 w-3.5" />}
                {t('home.loadMore', 'Show older')}
              </button>
            </div>
          )}
        </div>
      )}
      {dialog}
    </section>
  )
}

// ── Row ──────────────────────────────────────────────────────────

interface HistoryRowProps {
  record: TranscriptionRecord
  hasAudio: boolean
  playing: boolean
  copied: boolean
  retry?: RetryState
  onPlay: () => void
  onCopy: () => void
  onRetry: () => void
  onDelete: () => void
}

function HistoryRow({
  record,
  hasAudio,
  playing,
  copied,
  retry,
  onPlay,
  onCopy,
  onRetry,
  onDelete
}: HistoryRowProps): JSX.Element {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const failed = isFailed(record)
  const isAi = record.type === 'voice-with-llm'
  const text = primaryText(record)
  const long = text.length > LONG_TEXT || text.split('\n').length > 4
  const edited = !!record.rawTranscription && record.rawTranscription !== record.transcription

  return (
    <li className="group relative flex gap-4 rounded-xl px-3 py-3 transition-colors duration-200 hover:bg-panel focus-within:bg-panel">
      <time
        dateTime={new Date(record.timestamp).toISOString()}
        className="w-[60px] shrink-0 pt-[3px] text-[12px] text-ink-soft tabular"
      >
        {formatTime(record.timestamp)}
      </time>

      <div className="min-w-0 flex-1">
        {isAi && (
          <p className="mb-1.5 flex min-w-0 items-center gap-2 text-[12px] text-ink-muted">
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-signal-tint px-1.5 py-0.5 text-[11px] font-medium text-signal">
              <Sparkles className="h-3 w-3" />
              {record.llmAction ? displayActionName(t, record.llmAction) : t('home.aiAction', 'AI')}
            </span>
            {record.transcription && (
              <span className="truncate italic" dir="auto">
                {t('common.quoted', '“{{text}}”', { text: record.transcription })}
              </span>
            )}
          </p>
        )}

        {failed ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 text-[14px] font-medium text-danger">
              <AlertTriangle className="h-4 w-4" />
              {t('home.failedTitle', 'Couldn’t transcribe')}
            </p>
            {hasAudio ? (
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={onRetry}
                disabled={retry?.busy}
              >
                {retry?.busy ? (
                  <Spinner className="h-3 w-3" />
                ) : (
                  <RotateCw className="h-3.5 w-3.5" />
                )}
                {retry?.busy ? t('home.retrying', 'Transcribing…') : t('common.retry', 'Retry')}
              </button>
            ) : (
              <span className="text-[12.5px] text-ink-muted">
                {t('home.failedNoAudio', 'The audio wasn’t kept.')}
              </span>
            )}
          </div>
        ) : (
          <p
            dir="auto"
            className={`whitespace-pre-wrap break-words text-left rtl:text-right text-[14.5px] leading-relaxed text-ink text-pretty ${
              long && !expanded ? 'line-clamp-3' : ''
            }`}
          >
            {text}
          </p>
        )}

        {/* Meta */}
        {(record.appName || edited || long || isAi) && !failed && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {record.appName && (
              <span
                className="chip"
                title={t('home.appChip', 'Dictated into {{app}}', { app: record.appName })}
              >
                {record.appName}
              </span>
            )}
            {edited && (
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                aria-expanded={showRaw}
                className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-ink-soft transition-colors duration-200 hover:bg-hover hover:text-ink"
              >
                <WandSparkles className="h-3 w-3 text-signal" />
                {t('home.edited', 'Polished')}
                <ChevronDown
                  className={`h-3 w-3 transition-transform duration-200 ${showRaw ? 'rotate-180' : ''}`}
                />
              </button>
            )}
            {isAi && record.llmInput && (
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                aria-expanded={showRaw}
                className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-ink-soft transition-colors duration-200 hover:bg-hover hover:text-ink"
              >
                {t('home.originalInput', 'Original text')}
                <ChevronDown
                  className={`h-3 w-3 transition-transform duration-200 ${showRaw ? 'rotate-180' : ''}`}
                />
              </button>
            )}
            {long && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="inline-flex h-6 items-center rounded-md px-1.5 text-[11px] font-medium text-signal hover:bg-signal-tint"
              >
                {expanded ? t('home.showLess', 'Show less') : t('home.showMore', 'Show more')}
              </button>
            )}
          </div>
        )}

        {showRaw && (
          <div className="mt-2 rounded-lg border border-hairline bg-sunken/60 px-3 py-2.5 dark:bg-sunken">
            <p className="section-label mb-1">
              {isAi
                ? t('home.originalInput', 'Original text')
                : t('home.rawTranscript', 'As heard')}
            </p>
            <p
              dir="auto"
              className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-muted"
            >
              {isAi ? record.llmInput : record.rawTranscription}
            </p>
          </div>
        )}

        {retry?.error && (
          <p role="alert" className="mt-2 text-[12.5px] text-danger">
            {retry.error}
          </p>
        )}
      </div>

      {/* Actions: visible on hover and keyboard focus */}
      <div
        className={`flex shrink-0 items-start gap-0.5 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100 ${
          playing ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {hasAudio && (
          <button
            type="button"
            className={`icon-btn ${playing ? '!text-signal' : ''}`}
            onClick={onPlay}
            aria-label={
              playing ? t('home.pause', 'Stop playback') : t('home.play', 'Play recording')
            }
            title={playing ? t('home.pause', 'Stop playback') : t('home.play', 'Play recording')}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
        )}
        {!failed && (
          <button
            type="button"
            className="icon-btn"
            onClick={onCopy}
            aria-label={t('home.copy', 'Copy')}
            title={copied ? t('home.copied', 'Copied!') : t('home.copy', 'Copy')}
          >
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          </button>
        )}
        {hasAudio && !failed && (
          <button
            type="button"
            className="icon-btn"
            onClick={onRetry}
            disabled={retry?.busy}
            aria-label={t('home.retranscribe', 'Transcribe again')}
            title={t('home.retranscribe', 'Transcribe again')}
          >
            {retry?.busy ? <Spinner className="h-3.5 w-3.5" /> : <RotateCw className="h-4 w-4" />}
          </button>
        )}
        <button
          type="button"
          className="icon-btn hover:!text-danger"
          onClick={onDelete}
          aria-label={t('home.delete', 'Delete')}
          title={t('home.delete', 'Delete')}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {copied && (
        <span role="status" className="sr-only">
          {t('home.copied', 'Copied!')}
        </span>
      )}
    </li>
  )
}
