import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Clock, Mic, Zap, Type, TrendingUp, ArrowUpRight,
  Activity, Sparkles, Timer, LayoutDashboard, History,
  Copy, Trash2, X, ChevronDown, ChevronUp,
  Search, ChevronLeft, ChevronRight
} from 'lucide-react'
import { useStatsStore, type ActivityEntry } from '../store/stats'
import { useActivityStore, type TranscriptionRecord } from '../store/activity'

// ── Helpers ──────────────────────────────────────────────────────

import { formatDuration, formatTimeAgo, formatDate, formatTime } from '../utils/formatting'
import { renderTextWithCodeBlocks } from '../utils/render-text'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type HomeTab = 'dashboard' | 'activity'

// ── Component ────────────────────────────────────────────────────

export function Home(): JSX.Element {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<HomeTab>('dashboard')

  const {
    isLoaded,
    loadStats,
    voiceSeconds,
    wordCount,
    aiActions,
    voiceTimeSavedSeconds,
    aiTimeSavedSeconds,
    wordsPerMinute,
    dailyStats,
    recentActivity,
    outputChars
  } = useStatsStore()

  const {
    records: activityRecords,
    isLoaded: activityLoaded,
    loadRecords,
    deleteRecord
  } = useActivityStore()

  // Load stats and activity once on mount
  useEffect(() => {
    loadStats()
    loadRecords()
  }, [loadStats, loadRecords])

  const timeSavedMinutes = useMemo(
    () => Math.round((voiceTimeSavedSeconds + aiTimeSavedSeconds) / 60),
    [voiceTimeSavedSeconds, aiTimeSavedSeconds]
  )

  // Compute max value for weekly chart scaling
  const chartMax = useMemo(() => {
    if (!dailyStats) return 1
    const max = Math.max(...dailyStats.map((d) => d.timeSavedSeconds + d.voiceSeconds))
    return max > 0 ? max : 1
  }, [dailyStats])

  // Current day index (Mon=0 ... Sun=6)
  const todayIdx = useMemo(() => {
    const day = new Date().getDay()
    return day === 0 ? 6 : day - 1
  }, [])

  const statCards = useMemo(() => [
    {
      label: t('home.timeSaved'),
      value: timeSavedMinutes > 0 ? `${timeSavedMinutes}m` : '0m',
      subtext: t('home.timeSavedSub', 'vs. manual typing'),
      icon: <Clock className="w-5 h-5" />,
      color: '#4DC778',
      gradient: 'from-green-500/10 to-emerald-500/5'
    },
    {
      label: t('home.voiceInput'),
      value: formatDuration(voiceSeconds),
      subtext: wordsPerMinute > 0
        ? `${wordsPerMinute} ${t('home.wpm', 'WPM')}`
        : t('home.noRecordings', 'No recordings yet'),
      icon: <Mic className="w-5 h-5" />,
      color: '#F04545',
      gradient: 'from-red-500/10 to-rose-500/5'
    },
    {
      label: t('home.aiActions'),
      value: aiActions.toString(),
      subtext: outputChars > 0
        ? `${(outputChars / 1000).toFixed(1)}k ${t('home.charsGenerated', 'chars generated')}`
        : t('home.noActions', 'No actions yet'),
      icon: <Zap className="w-5 h-5" />,
      color: '#7EB6E0',
      gradient: 'from-sky-500/10 to-blue-500/5'
    },
    {
      label: t('home.wordsTyped'),
      value: wordCount > 999
        ? `${(wordCount / 1000).toFixed(1)}k`
        : wordCount.toString(),
      subtext: t('home.wordsTypedSub', 'transcribed by voice'),
      icon: <Type className="w-5 h-5" />,
      color: '#B07CD8',
      gradient: 'from-purple-500/10 to-violet-500/5'
    }
  ], [t, timeSavedMinutes, voiceSeconds, wordsPerMinute, aiActions, outputChars, wordCount])

  if (!isLoaded || !activityLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-theme-border border-t-sky-accent rounded-full animate-spin" />
      </div>
    )
  }

  const hasAnyData = voiceSeconds > 0 || aiActions > 0 || wordCount > 0

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="drag-region mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-theme-text tracking-tight">
              {t('home.welcome')}
            </h1>
            <p className="text-sm text-theme-text-secondary mt-0.5">
              {t('home.subtitle')}
            </p>
          </div>
          {hasAnyData && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-accent/10">
              <TrendingUp className="w-3.5 h-3.5 text-green-accent" />
              <span className="text-xs font-medium text-green-accent">
                {timeSavedMinutes}m {t('home.saved', 'saved')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────── */}
      <div className="flex gap-6 mb-6 border-b border-theme-border/30">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`
            flex items-center gap-2 pb-2.5 text-sm font-medium transition-all border-b-2 -mb-px
            ${activeTab === 'dashboard'
              ? 'border-theme-text text-theme-text'
              : 'border-transparent text-theme-text-secondary hover:text-theme-text'
            }
          `}
        >
          <LayoutDashboard className="w-4 h-4" />
          {t('home.dashboardTab', 'Dashboard')}
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`
            flex items-center gap-2 pb-2.5 text-sm font-medium transition-all border-b-2 -mb-px
            ${activeTab === 'activity'
              ? 'border-theme-text text-theme-text'
              : 'border-transparent text-theme-text-secondary hover:text-theme-text'
            }
          `}
        >
          <History className="w-4 h-4" />
          {t('home.activityTab', 'Activity')}
          {activityRecords.length > 0 && (
            <span className="ml-1 w-5 h-5 flex items-center justify-center text-[10px] font-semibold bg-sky-accent/15 text-sky-accent rounded-full">
              {activityRecords.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'activity' ? (
        <ActivityTab
          records={activityRecords}
          onDelete={deleteRecord}
          t={t}
        />
      ) : (
        <DashboardTab
          statCards={statCards}
          hasAnyData={hasAnyData}
          dailyStats={dailyStats}
          chartMax={chartMax}
          todayIdx={todayIdx}
          recentActivity={recentActivity}
          t={t}
        />
      )}
    </div>
  )
}

// ── Activity Tab Component ────────────────────────────────────────

interface ActivityTabProps {
  records: TranscriptionRecord[]
  onDelete: (id: string) => void
  t: (key: string, fallback?: string) => string
}


function ActivityTab({ records, onDelete, t }: ActivityTabProps): JSX.Element {
  const [selectedRecord, setSelectedRecord] = useState<TranscriptionRecord | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showOriginalInput, setShowOriginalInput] = useState(true)
  const [showLLMResult, setShowLLMResult] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const recordsPerPage = 25

  // Reset collapse states when opening a new record
  const handleSelectRecord = (record: TranscriptionRecord) => {
    setSelectedRecord(record)
    setShowOriginalInput(true)
    setShowLLMResult(true)
  }

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Clipboard API failed
    }
  }

  // Filter records based on search query
  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records

    const query = searchQuery.toLowerCase()
    return records.filter((record) => {
      const searchableText = [
        record.transcription,
        record.llmInput,
        record.llmResult,
        record.llmAction
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchableText.includes(query)
    })
  }, [records, searchQuery])

  // Calculate pagination
  const totalPages = Math.ceil(filteredRecords.length / recordsPerPage)
  const startIndex = (currentPage - 1) * recordsPerPage
  const endIndex = startIndex + recordsPerPage
  const paginatedRecords = filteredRecords.slice(startIndex, endIndex)

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  // Group records by date
  const groupedRecords = useMemo(() => {
    const groups: { date: string; records: TranscriptionRecord[] }[] = []
    let currentDate = ''

    paginatedRecords.forEach((record) => {
      const dateStr = formatDate(record.timestamp)
      if (dateStr !== currentDate) {
        currentDate = dateStr
        groups.push({ date: dateStr, records: [record] })
      } else {
        groups[groups.length - 1].records.push(record)
      }
    })

    return groups
  }, [paginatedRecords])

  return (
    <>
      {/* Search Bar */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('home.searchActivity', 'Search activity...')}
            className="w-full pl-10 pr-4 py-2.5 bg-theme-card rounded-xl border border-theme-border/30 text-sm text-theme-text placeholder-theme-text-muted outline-none focus:ring-2 focus:ring-sky-accent/30 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-text-muted hover:text-theme-text transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {searchQuery && (
          <p className="text-xs text-theme-text-muted mt-2">
            {filteredRecords.length} {filteredRecords.length === 1 ? t('home.result', 'result') : t('home.results', 'results')}
          </p>
        )}
      </div>

      {/* Empty State */}
      {records.length === 0 ? (
        <div
          className="bg-theme-card rounded-3xl p-8 border border-theme-border/20 text-center"
          style={{ animation: 'slide-up 0.4s ease-out backwards' }}
        >
          <div className="w-12 h-12 rounded-xl bg-theme-surface/50 flex items-center justify-center mx-auto mb-4">
            <History className="w-6 h-6 text-theme-text-muted" />
          </div>
          <h3 className="text-sm font-semibold text-theme-text mb-1">
            {t('home.noActivityTitle', 'No activity yet')}
          </h3>
          <p className="text-xs text-theme-text-muted max-w-[240px] mx-auto">
            {t('home.noActivityDesc', 'Your transcriptions and AI actions will appear here')}
          </p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="bg-theme-card rounded-3xl p-8 border border-theme-border/20 text-center">
          <div className="w-12 h-12 rounded-xl bg-theme-surface/50 flex items-center justify-center mx-auto mb-4">
            <Search className="w-6 h-6 text-theme-text-muted" />
          </div>
          <h3 className="text-sm font-semibold text-theme-text mb-1">
            {t('home.noResults', 'No results found')}
          </h3>
          <p className="text-xs text-theme-text-muted max-w-[240px] mx-auto">
            {t('home.noResultsDesc', 'Try adjusting your search query')}
          </p>
        </div>
      ) : (
        <>
      <div className="space-y-4">
        {groupedRecords.map((group, groupIdx) => (
          <div
            key={group.date}
            style={{ animation: `slide-up 0.4s ease-out ${groupIdx * 0.05}s backwards` }}
          >
            {/* Date Header */}
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-xs font-semibold text-theme-text-secondary">
                {group.date}
              </span>
              <div className="flex-1 h-px bg-theme-border/20" />
            </div>

            {/* Records */}
            <div className="space-y-2">
              {group.records.map((record) => {
                const hasLLM = record.type === 'voice-with-llm' && record.llmResult

                return (
                  <div
                    key={record.id}
                    className="bg-theme-card rounded-2xl border border-theme-border/20 transition-all hover:border-theme-border/40 cursor-pointer"
                    onClick={() => handleSelectRecord(record)}
                  >
                    {/* Main Row */}
                    <div className="flex items-start gap-3 p-3">
                      {/* Icon */}
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          hasLLM
                            ? 'bg-purple-500/10 text-purple-400'
                            : 'bg-red-500/10 text-recording-red'
                        }`}
                      >
                        {hasLLM ? (
                          <Sparkles className="w-4 h-4" />
                        ) : (
                          <Mic className="w-4 h-4" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-theme-text-muted">
                            {formatTime(record.timestamp)}
                          </span>
                          {record.durationSeconds > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-theme-surface/50 rounded text-theme-text-muted">
                              {formatDuration(record.durationSeconds)}
                            </span>
                          )}
                          {record.wordCount > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-theme-surface/50 rounded text-theme-text-muted">
                              {record.wordCount} words
                            </span>
                          )}
                          {hasLLM && record.llmAction && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/10 rounded text-purple-400 font-medium">
                              {record.llmAction}
                            </span>
                          )}
                        </div>

                        {/* Transcription Preview */}
                        {record.transcription && (
                          <p className="text-xs text-theme-text line-clamp-2">
                            {record.transcription}
                          </p>
                        )}

                        {/* LLM Input Preview (when no transcription) */}
                        {!record.transcription && record.llmInput && (
                          <p className="text-xs text-theme-text line-clamp-2">
                            {record.llmInput}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-theme-border/20">
          <p className="text-xs text-theme-text-muted">
            {t('home.showing', 'Showing')} {startIndex + 1}-{Math.min(endIndex, filteredRecords.length)} {t('home.of', 'of')} {filteredRecords.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-theme-text-secondary hover:text-theme-text hover:bg-theme-surface/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                // Show first page, last page, current page, and pages around current
                if (
                  page === 1 ||
                  page === totalPages ||
                  (page >= currentPage - 1 && page <= currentPage + 1)
                ) {
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-medium transition-all ${
                        currentPage === page
                          ? 'bg-sky-accent text-white'
                          : 'text-theme-text-secondary hover:text-theme-text hover:bg-theme-surface/50'
                      }`}
                    >
                      {page}
                    </button>
                  )
                } else if (page === currentPage - 2 || page === currentPage + 2) {
                  return (
                    <span key={page} className="text-theme-text-muted px-1">
                      ...
                    </span>
                  )
                }
                return null
              })}
            </div>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-theme-text-secondary hover:text-theme-text hover:bg-theme-surface/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      </>
      )}

      {/* Detail Modal */}
      {selectedRecord && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedRecord(null)}
        >
          <div
            className="bg-theme-card rounded-3xl border border-theme-border/30 max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-theme-border/20 bg-theme-surface/30">
              <div className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                    selectedRecord.type === 'voice-with-llm'
                      ? 'bg-purple-500/15 text-purple-400'
                      : 'bg-red-500/15 text-recording-red'
                  }`}
                >
                  {selectedRecord.type === 'voice-with-llm' ? (
                    <Sparkles className="w-5 h-5" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-theme-text">
                    {selectedRecord.llmAction || t('home.voiceNote', 'Voice Note')}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-theme-text-muted">
                      {formatDate(selectedRecord.timestamp)} • {formatTime(selectedRecord.timestamp)}
                    </span>
                    {selectedRecord.durationSeconds > 0 && (
                      <span className="text-xs text-theme-text-muted">
                        • {formatDuration(selectedRecord.durationSeconds)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-theme-text-muted hover:text-theme-text hover:bg-theme-surface transition-all"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[calc(80vh-180px)] p-4 space-y-3">
              {/* Voice Transcription */}
              {selectedRecord.transcription && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Mic className="w-3.5 h-3.5 text-recording-red" />
                    <span className="text-xs font-medium text-theme-text-secondary uppercase tracking-wide">
                      {t('home.transcription', 'Transcription')}
                    </span>
                  </div>
                  <div className="bg-theme-surface/30 rounded-xl p-3 border border-theme-border/20">
                    <div className="text-sm text-theme-text leading-relaxed">
                      {renderTextWithCodeBlocks(selectedRecord.transcription)}
                    </div>
                  </div>
                </div>
              )}

              {/* Original Input (for LLM actions) - Collapsible */}
              {selectedRecord.llmInput && (
                <div className="border border-sky-accent/20 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowOriginalInput(!showOriginalInput)}
                    className="w-full flex items-center justify-between p-3 bg-sky-accent/8 hover:bg-sky-accent/12 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Type className="w-3.5 h-3.5 text-sky-accent" />
                      <span className="text-xs font-medium text-sky-accent uppercase tracking-wide">
                        {t('home.originalInput', 'Original Text')}
                      </span>
                    </div>
                    {showOriginalInput ? (
                      <ChevronUp className="w-4 h-4 text-sky-accent" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-sky-accent" />
                    )}
                  </button>
                  {showOriginalInput && (
                    <div className="p-3 border-t border-sky-accent/20 bg-sky-accent/8">
                      <div className="text-sm text-theme-text leading-relaxed">
                        {renderTextWithCodeBlocks(selectedRecord.llmInput)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* LLM Result - Collapsible */}
              {selectedRecord.llmResult && (
                <div className="border border-purple-500/20 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowLLMResult(!showLLMResult)}
                    className="w-full flex items-center justify-between p-3 bg-purple-500/8 hover:bg-purple-500/12 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span className="text-xs font-medium text-purple-400 uppercase tracking-wide">
                        {t('home.llmResult', 'AI Result')}
                      </span>
                    </div>
                    {showLLMResult ? (
                      <ChevronUp className="w-4 h-4 text-purple-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-purple-400" />
                    )}
                  </button>
                  {showLLMResult && (
                    <div className="p-3 border-t border-purple-500/20 bg-purple-500/8">
                      <div className="text-sm text-theme-text leading-relaxed">
                        {renderTextWithCodeBlocks(selectedRecord.llmResult)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between gap-2 p-4 border-t border-theme-border/20 bg-theme-surface/30">
              <button
                onClick={() => {
                  handleCopy(
                    selectedRecord.llmResult || selectedRecord.transcription || selectedRecord.llmInput || '',
                    selectedRecord.id
                  )
                }}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-theme-text-secondary hover:text-theme-text bg-theme-card hover:bg-theme-surface rounded-xl transition-colors border border-theme-border/30"
              >
                <Copy className="w-4 h-4" />
                {copiedId === selectedRecord.id ? t('home.copied', 'Copied!') : t('home.copy', 'Copy')}
              </button>
              <button
                onClick={() => {
                  onDelete(selectedRecord.id)
                  setSelectedRecord(null)
                }}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/15 rounded-xl transition-colors border border-red-500/20"
              >
                <Trash2 className="w-4 h-4" />
                {t('home.delete', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Dashboard Tab Component ────────────────────────────────────────

interface DashboardTabProps {
  statCards: {
    label: string
    value: string
    subtext: string
    icon: JSX.Element
    color: string
    gradient: string
  }[]
  hasAnyData: boolean
  dailyStats: { voiceSeconds: number; timeSavedSeconds: number }[] | undefined
  chartMax: number
  todayIdx: number
  recentActivity: ActivityEntry[] | undefined
  t: (key: string, fallback?: string) => string
}

function DashboardTab({
  statCards,
  hasAnyData,
  dailyStats,
  chartMax,
  todayIdx,
  recentActivity,
  t
}: DashboardTabProps): JSX.Element {
  return (
    <>

      {/* ── Stat Cards Grid ────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {statCards.map((card, i) => (
          <div
            key={card.label}
            className={`
              relative overflow-hidden rounded-3xl p-4 border border-theme-border/20
              bg-gradient-to-br ${card.gradient}
              bg-theme-card
              transition-all duration-300 hover:border-theme-border/40 hover:shadow-sm
              group
            `}
            style={{
              animationDelay: `${i * 60}ms`,
              animation: 'slide-up 0.4s ease-out backwards'
            }}
          >
            {/* Icon badge */}
            <div className="flex items-center justify-between mb-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                style={{
                  backgroundColor: `${card.color}15`,
                  color: card.color
                }}
              >
                {card.icon}
              </div>
              {hasAnyData && (
                <ArrowUpRight
                  className="w-3.5 h-3.5 text-theme-text-muted opacity-0 group-hover:opacity-100 transition-opacity"
                />
              )}
            </div>

            {/* Value */}
            <p className="text-2xl font-bold text-theme-text tracking-tight leading-none mb-1">
              {card.value}
            </p>

            {/* Label + subtext */}
            <p className="text-xs font-medium text-theme-text-secondary mb-0.5">
              {card.label}
            </p>
            <p className="text-[10px] text-theme-text-muted leading-tight">
              {card.subtext}
            </p>
          </div>
        ))}
      </div>

      {/* ── Weekly Activity Chart ──────────────────────────── */}
      <div
        className="bg-theme-card rounded-3xl p-5 border border-theme-border/20 mb-5"
        style={{ animation: 'slide-up 0.4s ease-out 0.25s backwards' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-accent" />
            <h2 className="text-sm font-semibold text-theme-text">
              {t('home.thisWeek')}
            </h2>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-theme-text-muted">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-sky-accent inline-block" />
              {t('home.voiceLabel', 'Voice')}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-accent inline-block" />
              {t('home.timeSavedLabel', 'Time Saved')}
            </span>
          </div>
        </div>

        {/* Chart */}
        <div className="flex items-end gap-1.5 h-28">
          {DAY_LABELS.map((day, idx) => {
            const stats = dailyStats?.[idx] || { voiceSeconds: 0, timeSavedSeconds: 0 }
            const voicePct = (stats.voiceSeconds / chartMax) * 100
            const savedPct = (stats.timeSavedSeconds / chartMax) * 100
            const totalPct = Math.max(voicePct + savedPct, 0)
            const isToday = idx === todayIdx

            return (
              <div key={day} className="flex-1 flex flex-col items-center gap-1.5 group/bar">
                <div className="w-full flex flex-col justify-end h-20 relative">
                  {/* Background track */}
                  <div className="absolute inset-0 bg-theme-surface/30 rounded-lg" />

                  {/* Stacked bars */}
                  <div
                    className="relative w-full rounded-lg overflow-hidden transition-all duration-500 ease-out"
                    style={{ height: `${Math.max(totalPct, hasAnyData ? 4 : 0)}%` }}
                  >
                    {/* Time saved portion (bottom) */}
                    <div
                      className="w-full bg-green-accent/60 transition-all duration-500"
                      style={{ height: `${savedPct > 0 ? (savedPct / (totalPct || 1)) * 100 : 0}%` }}
                    />
                    {/* Voice portion (top) */}
                    <div
                      className="w-full bg-sky-accent transition-all duration-500"
                      style={{ height: `${voicePct > 0 ? (voicePct / (totalPct || 1)) * 100 : 0}%` }}
                    />
                  </div>

                  {/* Tooltip on hover */}
                  {(stats.voiceSeconds > 0 || stats.timeSavedSeconds > 0) && (
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none z-10">
                      <div className="bg-theme-text text-theme-bg text-[9px] font-medium px-2 py-1 rounded-md whitespace-nowrap">
                        {formatDuration(stats.voiceSeconds)} voice
                      </div>
                    </div>
                  )}
                </div>

                {/* Day label */}
                <span
                  className={`text-[10px] leading-none transition-colors ${
                    isToday
                      ? 'text-sky-accent font-semibold'
                      : 'text-theme-text-muted'
                  }`}
                >
                  {day}
                </span>

                {/* Today indicator dot */}
                {isToday && (
                  <div className="w-1 h-1 rounded-full bg-sky-accent -mt-1" />
                )}
              </div>
            )
          })}
        </div>

        {/* Empty state */}
        {!hasAnyData && (
          <div className="text-center mt-3">
            <p className="text-xs text-theme-text-muted">
              {t('home.chartEmpty', 'Start recording to see your weekly activity')}
            </p>
          </div>
        )}
      </div>

      {/* ── Recent Activity ────────────────────────────────── */}
      {recentActivity && recentActivity.length > 0 && (
        <div
          className="bg-theme-card rounded-3xl p-5 border border-theme-border/20 mb-5"
          style={{ animation: 'slide-up 0.4s ease-out 0.35s backwards' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Timer className="w-4 h-4 text-theme-text-secondary" />
            <h2 className="text-sm font-semibold text-theme-text">
              {t('home.recentActivity', 'Recent Activity')}
            </h2>
          </div>

          <div className="space-y-1">
            {recentActivity.slice(0, 5).map((entry: ActivityEntry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-theme-surface/30 transition-colors"
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    entry.type === 'voice'
                      ? 'bg-red-500/10 text-recording-red'
                      : 'bg-sky-accent/10 text-sky-accent'
                  }`}
                >
                  {entry.type === 'voice' ? (
                    <Mic className="w-3.5 h-3.5" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs text-theme-text truncate">{entry.description}</p>
                  <p className="text-[10px] text-theme-text-muted">{formatTimeAgo(entry.timestamp)}</p>
                </div>

                {entry.value && (
                  <span className="text-[10px] font-medium text-theme-text-secondary bg-theme-surface/50 px-2 py-0.5 rounded-full shrink-0">
                    {entry.value}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Quick Start (shown when no data, or always at bottom) ── */}
      <div
        className={`rounded-3xl p-5 border border-theme-border/20 ${
          hasAnyData ? 'bg-theme-card' : 'bg-gradient-to-br from-sky-accent/5 to-transparent bg-theme-card'
        }`}
        style={{ animation: 'slide-up 0.4s ease-out 0.45s backwards' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className={`w-4 h-4 ${hasAnyData ? 'text-theme-text-secondary' : 'text-sky-accent'}`} />
          <h2 className="text-sm font-semibold text-theme-text">
            {t('home.quickStart')}
          </h2>
        </div>

        <div className="space-y-0.5">
          {[
            {
              keys: navigator.platform.includes('Mac') ? '⌥ Space' : 'Alt+Space',
              label: t('shortcuts.holdToRecord')
            },
            {
              keys: navigator.platform.includes('Mac') ? '⌥ Space Space' : 'Alt+Space+Space',
              label: t('shortcuts.openPinnedPanel')
            },
            {
              keys: 'Esc',
              label: t('shortcuts.dismiss')
            }
          ].map((shortcut) => (
            <div
              key={shortcut.keys}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-theme-surface/30 transition-colors"
            >
              <kbd className="px-2 py-1 bg-theme-surface/60 rounded-lg text-[10px] text-theme-text-secondary font-mono min-w-[80px] text-center">
                {shortcut.keys}
              </kbd>
              <span className="text-xs text-theme-text-secondary">{shortcut.label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
