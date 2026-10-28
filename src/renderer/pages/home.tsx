import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  AlertTriangle,
  Check,
  Copy,
  Pause,
  Play,
  Quote,
  RotateCw,
  Sparkles,
  Trash2,
  WandSparkles
} from 'lucide-react'
import { useStatsStore } from '../store/stats'
import { useActivityStore, type TranscriptionRecord } from '../store/activity'
import { getRecordingUrl, hasRecordings, retranscribeRecord } from '../services/history'
import { formatDate, formatTime } from '../utils/formatting'
import { displayActionName } from '../utils/action-labels'
import { computeStreak, type StreakInfo } from '../utils/streak'
import { useRecordShortcut } from '../hooks/use-record-shortcut'
import { FnKeyNotice } from '../components/fn-key-notice'
import { Dashboard } from '../components/home/dashboard'
import type { Navigate } from './main-window'
import { useConfirmDialog } from '../components/confirm-dialog'
import { ShortcutKeys } from '../components/ui/keycap'
import { Page, Spinner } from '../components/ui/primitives'
import { ExpandingSearch } from '../components/ui/expanding-search'

const PAGE_SIZE = 40
const DAY_MS = 24 * 60 * 60 * 1000
/** History window used for the streak (extended when the streak reaches it) */
const STREAK_WINDOW_DAYS = 90
/** Text longer than this is clamped until expanded */
const LONG_TEXT = 260
/** Placeholder used to put a component in the middle of a translated sentence */
const SLOT = '\u0000'
/** With this many entries the history search starts open */
const SEARCH_OPEN_AT = 300

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

/** "Good morning" / "Good afternoon" / "Good evening" by the local time */
function greeting(t: TFunction): string {
  const hour = new Date().getHours()
  if (hour < 5 || hour >= 18) return t('home.greetingEvening', 'Good evening')
  if (hour < 12) return t('home.greetingMorning', 'Good morning')
  return t('home.greetingAfternoon', 'Good afternoon')
}

export function Home({ onNavigate }: { onNavigate?: Navigate }): JSX.Element {
  const { t } = useTranslation()
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

  const savedSeconds = voiceTimeSavedSeconds + aiTimeSavedSeconds

  const hintParts = t('home.heroHint', 'Hold {{keys}} in any app and start talking.', {
    keys: SLOT
  }).split(SLOT)

  return (
    <>
      {/* ── Hero (full-bleed grainy band) ───────────────────── */}
      <section className="grain-hero">
        <div className="mx-auto w-full max-w-[1040px] px-6 pb-6 pt-8 animate-rise">
          <h1 className="hero-title text-[26px] text-balance">{greeting(t)}</h1>
          <p className="mt-1 text-[13px] leading-[1.9] text-ink-muted">
            {hintParts[0]}
            <ShortcutKeys accelerator={shortcut} size="sm" className="-translate-y-px" />
            {hintParts[1]}
          </p>
        </div>
      </section>

      <Page width="wide" className="!pt-0">
        <FnKeyNotice shortcut={shortcut} className="mb-4" />
        <div className="mb-8">
          <Dashboard
            totals={allTime}
            streak={streak}
            savedSeconds={savedSeconds}
            refreshToken={`${totalCount}-${latestId}`}
            onNavigate={onNavigate}
          />
        </div>
        {/* ── History ──────────────────────────────────────── */}
        {!isLoaded ? (
          <div className="flex justify-center py-16 text-ink-faint">
            <Spinner className="h-5 w-5" />
          </div>
        ) : (
          <HistoryList totalCount={totalCount} refreshToken={`${totalCount}-${latestId}`} />
        )}
      </Page>
    </>
  )
}

// ── History ──────────────────────────────────────────────────────

interface HistoryListProps {
  totalCount: number
  /** Changes whenever records are added/removed so the list is re-queried */
  refreshToken: string
}

interface RetryState {
  busy: boolean
  error?: string
}

function HistoryList({ totalCount, refreshToken }: HistoryListProps): JSX.Element {
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

  return (
    <section aria-labelledby="history-title">
      <div className="mb-1 flex min-h-8 items-center justify-between gap-3">
        <h2 id="history-title" className="font-display text-[17px] leading-none text-ink">
          {t('home.historyTitle', 'History')}
        </h2>
        {totalCount > 0 && (
          <ExpandingSearch
            value={search}
            onChange={setSearch}
            label={t('home.searchActivity', 'Search history…')}
            open={totalCount >= SEARCH_OPEN_AT}
          />
        )}
      </div>

      {debouncedSearch && items && (
        <p className="mb-2 text-[12px] text-ink-soft" aria-live="polite">
          {t('home.resultCount', '{{count}} results', { count: matching })}
        </p>
      )}

      {!items ? (
        <div className="flex justify-center py-6 text-ink-faint">
          <Spinner className="h-5 w-5" />
        </div>
      ) : totalCount === 0 && !debouncedSearch ? (
        <div className="py-10 text-center">
          <p className="font-display text-[17px] text-ink">
            {t('home.emptyTitle', 'Your history starts with one sentence.')}
          </p>
          <p className="mt-1 text-[13px] text-ink-soft">
            {t('home.emptyHint', 'Your dictations will collect here, newest first.')}
          </p>
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-ink-muted">
          {t('home.noResults', 'No results found')}
        </p>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            <div key={group.label}>
              <h3 className="px-0 pb-0.5 pt-2 text-[12px] text-ink-soft">{group.label}</h3>
              <ul className="-mx-2">
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
                className="btn-ghost btn-sm"
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

  const toggleLabel = isAi
    ? t('home.originalInput', 'Original text')
    : t('home.rawTranscript', 'As heard')

  return (
    <li className="group relative flex gap-3 rounded-lg px-2 py-1.5 transition-colors duration-200 hover:bg-panel focus-within:bg-panel">
      <time
        dateTime={new Date(record.timestamp).toISOString()}
        title={
          record.appName
            ? t('home.appChip', 'Dictated into {{app}}', { app: record.appName })
            : undefined
        }
        className="w-[60px] shrink-0 whitespace-nowrap pt-[2px] text-[11.5px] text-ink-soft tabular"
      >
        {formatTime(record.timestamp)}
      </time>

      <div className="min-w-0 flex-1">
        {isAi && (
          <p className="mb-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-ink-soft">
            <Sparkles className="h-3 w-3 shrink-0 text-signal" aria-hidden="true" />
            <span className="shrink-0">
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
            <p className="flex items-center gap-1.5 text-[13px] text-danger">
              <AlertTriangle className="h-3.5 w-3.5" />
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
              <span className="text-[12.5px] text-ink-soft">
                {t('home.failedNoAudio', 'The audio wasn’t kept.')}
              </span>
            )}
          </div>
        ) : (
          <p
            dir="auto"
            className={`whitespace-pre-wrap break-words text-left rtl:text-right text-[13px] leading-snug text-ink text-pretty ${
              long && !expanded ? 'line-clamp-3' : ''
            }`}
          >
            {text}
          </p>
        )}

        {long && !failed && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="mt-0.5 rounded text-[12px] text-ink-soft transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
          >
            {expanded ? t('home.showLess', 'Show less') : t('home.showMore', 'Show more')}
          </button>
        )}

        {showRaw && (
          <div className="mt-1 border-s-2 border-hairline-strong ps-2.5">
            <p className="text-[11.5px] text-ink-soft">{toggleLabel}</p>
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
          playing || showRaw ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {record.appName && !failed && (
          <span
            className="me-1 max-w-[120px] truncate pt-[5px] text-[11.5px] text-ink-faint"
            title={t('home.appChip', 'Dictated into {{app}}', { app: record.appName })}
          >
            {record.appName}
          </span>
        )}
        {(edited || (isAi && !!record.llmInput)) && !failed && (
          <button
            type="button"
            className={`icon-btn ${showRaw ? '!text-signal' : ''}`}
            onClick={() => setShowRaw((v) => !v)}
            aria-pressed={showRaw}
            aria-label={toggleLabel}
            title={toggleLabel}
          >
            {isAi ? <Quote className="h-4 w-4" /> : <WandSparkles className="h-4 w-4" />}
          </button>
        )}
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
