import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Check, Flame, Gauge, Hourglass, Type, X } from 'lucide-react'
import type { TranscriptionRecord } from '../../store/activity'
import type { Navigate } from '../../pages/main-window'
import { dayKey, type StreakInfo } from '../../utils/streak'
import { formatCompactNumber, formatDuration } from '../../utils/formatting'

const DAY_MS = 24 * 60 * 60 * 1000
/** Days shown in the activity chart */
const CHART_DAYS = 14
/** Days counted for "Top apps" */
const APPS_DAYS = 30
const TOP_APPS = 5
/** Average typing speed used for the "faster than typing" comparison */
const TYPING_WPM = 40
const CHECKLIST_DISMISSED_KEY = 'tapwisper.dashboard.checklistDismissed'

const VOICE_KEY_ID: Record<string, string> = {
  whisper: 'together',
  'openai-whisper': 'openai',
  soniox: 'soniox'
}

export interface DashboardTotals {
  words: number
  seconds: number
}

interface DayBucket {
  key: string
  date: Date
  words: number
  count: number
}

interface AppShare {
  name: string
  words: number
}

function hasText(r: TranscriptionRecord): boolean {
  return !!(r.transcription?.trim() || r.llmResult?.trim())
}

/** Local midnight `days` days before today */
function startOfDay(daysAgo: number, now: number): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - daysAgo)
  return d
}

/** Dictations from the last 30 days, re-read whenever history changes */
function useRecentRecords(refreshToken: string): TranscriptionRecord[] | null {
  const [rows, setRows] = useState<TranscriptionRecord[] | null>(null)
  useEffect(() => {
    let cancelled = false
    const now = Date.now()
    window.tapwisper.db.activity
      .getByDateRange(startOfDay(APPS_DAYS - 1, now).getTime(), now)
      .then((r) => !cancelled && setRows(((r ?? []) as TranscriptionRecord[]).filter(hasText)))
      .catch(() => !cancelled && setRows([]))
    return () => {
      cancelled = true
    }
  }, [refreshToken])
  return rows
}

// ── Dashboard ────────────────────────────────────────────────────

/**
 * The top of Home: headline stats, words per day, where you dictate, and a
 * getting-started checklist until the basics are done.
 */
export function Dashboard({
  totals,
  streak,
  savedSeconds,
  refreshToken,
  onNavigate
}: {
  totals: DashboardTotals | null
  streak: StreakInfo
  savedSeconds: number
  refreshToken: string
  onNavigate?: Navigate
}): JSX.Element {
  const recent = useRecentRecords(refreshToken)

  const { days, weekWords, apps } = useMemo(() => {
    const now = Date.now()
    const buckets: DayBucket[] = Array.from({ length: CHART_DAYS }, (_, i) => {
      const date = startOfDay(CHART_DAYS - 1 - i, now)
      return { key: dayKey(date.getTime()), date, words: 0, count: 0 }
    })
    const byKey = new Map(buckets.map((b) => [b.key, b]))
    const weekStart = startOfDay(6, now).getTime()
    const appWords = new Map<string, number>()
    let week = 0
    for (const r of recent ?? []) {
      const words = r.wordCount || 0
      const bucket = byKey.get(dayKey(r.timestamp))
      if (bucket) {
        bucket.words += words
        bucket.count += 1
      }
      if (r.timestamp >= weekStart) week += words
      if (r.appName) appWords.set(r.appName, (appWords.get(r.appName) ?? 0) + words)
    }
    const sorted: AppShare[] = [...appWords.entries()]
      .map(([name, w]) => ({ name, words: w }))
      .filter((a) => a.words > 0)
      .sort((a, b) => b.words - a.words)
    return { days: buckets, weekWords: week, apps: sorted }
  }, [recent])

  const hasActivity = (totals?.words ?? 0) > 0

  return (
    <div className="space-y-4">
      <GettingStarted recent={recent} hasDictated={hasActivity} onNavigate={onNavigate} />
      {/* Numbers only mean something once there is a first dictation */}
      {hasActivity && (
        <>
          <StatTiles
            totals={totals}
            weekWords={weekWords}
            streak={streak}
            savedSeconds={savedSeconds}
          />
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <ActivityChart days={days} weekWords={weekWords} />
            <TopApps apps={apps} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Stat tiles ───────────────────────────────────────────────────

function Tile({
  icon,
  label,
  value,
  unit,
  footer
}: {
  icon: ReactNode
  label: string
  value: string
  unit?: string
  footer: ReactNode
}): JSX.Element {
  return (
    <div className="card flex min-w-0 flex-col p-4">
      <div className="flex items-center gap-1.5 text-[12px] text-ink-soft">
        <span className="text-ink-faint [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
        {label}
      </div>
      <p className="mt-2 flex items-baseline gap-1 tabular">
        <span className="font-display text-[28px] leading-none text-ink">{value}</span>
        {unit && <span className="text-[13px] text-ink-muted">{unit}</span>}
      </p>
      <div className="mt-2 min-h-[18px] text-[12px] text-ink-soft">{footer}</div>
    </div>
  )
}

function StatTiles({
  totals,
  weekWords,
  streak,
  savedSeconds
}: {
  totals: DashboardTotals | null
  weekWords: number
  streak: StreakInfo
  savedSeconds: number
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const words = totals?.words ?? 0
  const wpm = totals && totals.seconds > 0 ? Math.round(words / (totals.seconds / 60)) : 0
  const faster = wpm > 0 ? wpm / TYPING_WPM : 0
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' })
    const now = Date.now()
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(now - (6 - i) * DAY_MS)))
  }, [i18n.language])

  return (
    <section
      aria-label={t('home.statsLabel', 'Your stats')}
      className="grid grid-cols-2 gap-3 md:grid-cols-4"
    >
      <Tile
        icon={<Type />}
        label={t('home.statWords', 'Words dictated')}
        value={formatCompactNumber(words)}
        footer={
          weekWords > 0
            ? t('home.statWordsWeek', '+{{value}} this week', {
                value: formatCompactNumber(weekWords)
              })
            : t('home.statWordsHint', 'all time')
        }
      />
      <Tile
        icon={<Gauge />}
        label={t('home.statPace', 'Average pace')}
        value={wpm > 0 ? String(wpm) : '—'}
        unit={wpm > 0 ? t('home.wpm', 'wpm') : undefined}
        footer={
          faster >= 1.2
            ? t('home.statPaceFaster', '{{value}}× faster than typing', {
                value: faster.toFixed(1)
              })
            : t('home.statPaceHint', 'Typing averages ~{{value}} wpm', { value: TYPING_WPM })
        }
      />
      <Tile
        icon={<Hourglass />}
        label={t('home.statSaved', 'Time saved')}
        value={savedSeconds > 0 ? formatDuration(savedSeconds) : '—'}
        footer={t('home.statSavedHint', 'this week, vs. typing')}
      />
      <Tile
        icon={<Flame />}
        label={t('home.statStreak', 'Day streak')}
        value={String(streak.streak)}
        unit={t('home.statStreakUnit', 'days', { count: streak.streak })}
        footer={
          <ol
            className="flex items-center gap-1"
            aria-label={t('home.statStreakWeek', 'Last 7 days')}
          >
            {streak.lastWeek.map((active, i) => (
              <li
                key={i}
                className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9.5px] font-medium ${
                  active ? 'bg-signal text-on-signal' : 'bg-sunken text-ink-faint'
                }`}
              >
                {weekdays[i]}
              </li>
            ))}
          </ol>
        }
      />
    </section>
  )
}

// ── Words per day ────────────────────────────────────────────────

function ActivityChart({ days, weekWords }: { days: DayBucket[]; weekWords: number }): JSX.Element {
  const { t, i18n } = useTranslation()
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...days.map((d) => d.words))
  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, { weekday: 'short', month: 'short', day: 'numeric' }),
    [i18n.language]
  )
  const tickFmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' }),
    [i18n.language]
  )
  const shown = hover !== null ? days[hover] : null

  return (
    <section className="card flex flex-col p-4" aria-labelledby="activity-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="activity-title" className="text-[13px] font-medium text-ink">
            {t('home.activityTitle', 'Words per day')}
          </h2>
          <p className="mt-0.5 text-[12px] text-ink-soft">
            {t('home.activitySubtitle', 'Last {{count}} days', { count: CHART_DAYS })}
          </p>
        </div>
        <p className="text-end text-[12px] text-ink-soft" aria-live="polite">
          {shown ? (
            <>
              <span className="block font-medium text-ink tabular">
                {t('home.activityWords', '{{value}} words', {
                  value: shown.words.toLocaleString(i18n.language)
                })}
              </span>
              {dateFmt.format(shown.date)}
            </>
          ) : (
            <>
              <span className="block font-medium text-ink tabular">
                {t('home.activityWords', '{{value}} words', {
                  value: weekWords.toLocaleString(i18n.language)
                })}
              </span>
              {t('home.activityThisWeek', 'last 7 days')}
            </>
          )}
        </p>
      </div>

      <div
        className="mt-4 flex min-h-[132px] flex-1 items-end gap-[2px] border-b border-hairline"
        onMouseLeave={() => setHover(null)}
      >
        {days.map((d, i) => {
          const pct = d.words > 0 ? Math.max(4, Math.round((d.words / max) * 100)) : 0
          const label = `${dateFmt.format(d.date)}: ${t('home.activityWords', '{{value}} words', {
            value: d.words.toLocaleString(i18n.language)
          })}`
          return (
            <button
              key={d.key}
              type="button"
              aria-label={label}
              title={label}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="group flex h-full min-w-0 flex-1 items-end focus-visible:outline-none"
            >
              <span
                className={`block w-full rounded-t-[4px] transition-colors duration-150 ${
                  d.words === 0
                    ? 'h-[2px] bg-hairline'
                    : hover === i
                      ? 'bg-signal-strong'
                      : 'bg-signal group-focus-visible:bg-signal-strong'
                }`}
                style={d.words > 0 ? { height: `${pct}%` } : undefined}
              />
            </button>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-faint tabular">
        <span>{tickFmt.format(days[0].date)}</span>
        <span>{tickFmt.format(days[Math.floor(days.length / 2)].date)}</span>
        <span>{t('home.today', 'Today')}</span>
      </div>
    </section>
  )
}

// ── Where you dictate ────────────────────────────────────────────

function TopApps({ apps }: { apps: AppShare[] }): JSX.Element {
  const { t, i18n } = useTranslation()
  const total = apps.reduce((sum, a) => sum + a.words, 0)
  const top = apps.slice(0, TOP_APPS)
  const otherWords = apps.slice(TOP_APPS).reduce((sum, a) => sum + a.words, 0)
  const rows = otherWords > 0 ? [...top, { name: '', words: otherWords }] : top
  const max = Math.max(1, ...rows.map((r) => r.words))

  return (
    <section className="card p-4" aria-labelledby="apps-title">
      <h2 id="apps-title" className="text-[13px] font-medium text-ink">
        {t('home.appsTitle', 'Where you dictate')}
      </h2>
      <p className="mt-0.5 text-[12px] text-ink-soft">
        {t('home.activitySubtitle', 'Last {{count}} days', { count: APPS_DAYS })}
      </p>
      {rows.length === 0 ? (
        <p className="mt-6 text-[12.5px] text-ink-muted">
          {t('home.appsEmpty', 'Apps you dictate into will show up here.')}
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((app) => {
            const share = total > 0 ? Math.round((app.words / total) * 100) : 0
            return (
              <li
                key={app.name || '__other'}
                title={t('home.activityWords', '{{value}} words', {
                  value: app.words.toLocaleString(i18n.language)
                })}
              >
                <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                  <span className="truncate text-ink">
                    {app.name ? <bdi>{app.name}</bdi> : t('home.appsOther', 'Other')}
                  </span>
                  <span className="shrink-0 text-ink-soft tabular">{share}%</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-sunken">
                  <div
                    className="h-full rounded-full bg-signal"
                    style={{ width: `${Math.max(3, (app.words / max) * 100)}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ── Getting started ──────────────────────────────────────────────

interface ChecklistState {
  speech: boolean
  dictionary: boolean
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(CHECKLIST_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/** Setup steps that make dictation work well; hides once done or dismissed */
function GettingStarted({
  recent,
  hasDictated,
  onNavigate
}: {
  recent: TranscriptionRecord[] | null
  hasDictated: boolean
  onNavigate?: Navigate
}): JSX.Element | null {
  const { t } = useTranslation()
  const [state, setState] = useState<ChecklistState | null>(null)
  const [dismissed, setDismissed] = useState(readDismissed)

  useEffect(() => {
    if (dismissed) return
    let cancelled = false
    Promise.all([
      window.tapwisper.store.get('speechEngine'),
      window.tapwisper.store.get('voiceProvider'),
      window.tapwisper.store.get('apiKeys'),
      window.tapwisper.store.get('dictionary')
    ])
      .then(([engine, provider, keys, dictionary]) => {
        if (cancelled) return
        const keyId = VOICE_KEY_ID[String(provider)] ?? 'together'
        const key = (keys as Record<string, string> | undefined)?.[keyId] ?? ''
        setState({
          speech: (engine !== undefined && engine !== 'cloud') || key.trim().length > 0,
          dictionary: Array.isArray(dictionary) && dictionary.length > 0
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [dismissed])

  if (dismissed || !state) return null

  const usedVoiceCommand = (recent ?? []).some((r) => r.type === 'voice-with-llm')
  const items: { id: string; done: boolean; title: string; body: string; action?: () => void }[] = [
    {
      id: 'speech',
      done: state.speech,
      title: t('home.checkSpeech', 'Connect a speech engine'),
      body: t('home.checkSpeechBody', 'Add an API key or pick a local model.'),
      action: () => onNavigate?.('settings', 'speech-to-text')
    },
    {
      id: 'dictate',
      done: hasDictated,
      title: t('home.checkDictate', 'Dictate your first sentence'),
      body: t('home.checkDictateBody', 'Hold your key in any text field and talk.')
    },
    {
      id: 'command',
      done: usedVoiceCommand,
      title: t('home.checkCommand', 'Edit text by voice'),
      body: t(
        'home.checkCommandBody',
        'Select some text, hold your key and say “make this more formal”.'
      )
    },
    {
      id: 'dictionary',
      done: state.dictionary,
      title: t('home.checkDictionary', 'Teach it your words'),
      body: t('home.checkDictionaryBody', 'Names and terms it should always spell right.'),
      action: () => onNavigate?.('dictionary')
    }
  ]
  const doneCount = items.filter((i) => i.done).length
  if (doneCount === items.length) return null

  const dismiss = (): void => {
    setDismissed(true)
    try {
      localStorage.setItem(CHECKLIST_DISMISSED_KEY, '1')
    } catch {
      // Hidden for this session only
    }
  }

  return (
    <section className="card p-4" aria-labelledby="checklist-title">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="checklist-title" className="text-[13px] font-medium text-ink">
            {t('home.checklistTitle', 'Get the most out of TapWisper')}
          </h2>
          <p className="mt-0.5 text-[12px] text-ink-soft tabular">
            {t('home.checklistProgress', '{{done}} of {{total}} done', {
              done: doneCount,
              total: items.length
            })}
          </p>
        </div>
        <div className="h-1.5 w-24 rounded-full bg-sunken" aria-hidden="true">
          <div
            className="h-full rounded-full bg-signal transition-[width] duration-300"
            style={{ width: `${(doneCount / items.length) * 100}%` }}
          />
        </div>
        <button
          type="button"
          className="icon-btn h-7 w-7"
          onClick={dismiss}
          aria-label={t('common.dismiss', 'Dismiss')}
          title={t('common.dismiss', 'Dismiss')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.id}
            className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
              item.done ? 'border-transparent bg-sunken/60' : 'border-hairline bg-raised'
            }`}
          >
            <span
              className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                item.done ? 'bg-signal text-on-signal' : 'border border-hairline-strong'
              }`}
            >
              {item.done && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-[13px] ${item.done ? 'text-ink-soft line-through' : 'text-ink'}`}>
                {item.title}
              </p>
              {!item.done && (
                <p className="mt-0.5 text-[12px] leading-snug text-ink-soft">{item.body}</p>
              )}
            </div>
            {!item.done && item.action && onNavigate && (
              <button
                type="button"
                className="icon-btn h-7 w-7 shrink-0"
                onClick={item.action}
                aria-label={item.title}
                title={item.title}
              >
                <ArrowRight className="h-3.5 w-3.5 rtl-flip" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
