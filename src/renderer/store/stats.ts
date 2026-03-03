import { create } from 'zustand'

// Debounce database writes to prevent excessive I/O
let dbWriteTimeout: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 500 // Write to DB at most once per 500ms

function debouncedDBWrite(writeFunction: () => void): void {
  if (dbWriteTimeout) {
    clearTimeout(dbWriteTimeout)
  }
  dbWriteTimeout = setTimeout(() => {
    writeFunction()
    dbWriteTimeout = null
  }, DEBOUNCE_MS)
}

interface DailyStats {
  voiceSeconds: number
  aiActions: number
  wordCount: number
  timeSavedSeconds: number
}

interface UsageStats {
  // Voice stats
  voiceSeconds: number
  transcribedChars: number
  wordCount: number
  wordsPerMinute: number

  // AI stats
  aiActions: number
  aiActionsByCategory: Record<string, number>
  outputChars: number

  // Time savings
  voiceTimeSavedSeconds: number
  aiTimeSavedSeconds: number

  // Week tracking
  weekStartDate: string // ISO date string of Monday

  // Daily breakdown for weekly chart (Mon=0 ... Sun=6)
  dailyStats: DailyStats[]

  // Recent activity log
  recentActivity: ActivityEntry[]
}

export interface ActivityEntry {
  id: string
  type: 'voice' | 'ai'
  description: string
  timestamp: number // Date.now()
  value?: string // e.g. "45s", "Rephrase"
}

interface StatsState extends UsageStats {
  isLoaded: boolean
  loadStats: () => Promise<void>
  addVoiceRecording: (seconds: number, chars: number, words: number) => void
  addAIAction: (category: string, outputChars: number) => void
  getTimeSavedMinutes: () => number
  resetWeekly: () => void
}

function getMonday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}

function getDayIndex(): number {
  const day = new Date().getDay()
  // Convert: Sunday=0 → 6, Monday=1 → 0, etc.
  return day === 0 ? 6 : day - 1
}

function patchDailyStats(
  dailyStats: DailyStats[],
  dayIdx: number,
  patch: Partial<DailyStats>
): DailyStats[] {
  const updated = [...dailyStats]
  if (!updated[dayIdx]) {
    updated[dayIdx] = { voiceSeconds: 0, aiActions: 0, wordCount: 0, timeSavedSeconds: 0 }
  }
  updated[dayIdx] = { ...updated[dayIdx], ...patch }
  return updated
}

function emptyDailyStats(): DailyStats[] {
  return Array.from({ length: 7 }, () => ({
    voiceSeconds: 0,
    aiActions: 0,
    wordCount: 0,
    timeSavedSeconds: 0
  }))
}

const defaultStats: UsageStats = {
  voiceSeconds: 0,
  transcribedChars: 0,
  wordCount: 0,
  wordsPerMinute: 0,
  aiActions: 0,
  aiActionsByCategory: {},
  outputChars: 0,
  voiceTimeSavedSeconds: 0,
  aiTimeSavedSeconds: 0,
  weekStartDate: getMonday(),
  dailyStats: emptyDailyStats(),
  recentActivity: []
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export const useStatsStore = create<StatsState>((set, get) => ({
  ...defaultStats,
  isLoaded: false,

  loadStats: async () => {
    try {
      // Use activity_records as source of truth for accurate dashboard data
      const stats = await window.tapwisper.db.stats.getFromActivity()
      if (stats && (stats.voiceSeconds > 0 || stats.aiActions > 0 || stats.wordCount > 0)) {
        set({
          voiceSeconds: stats.voiceSeconds,
          transcribedChars: stats.transcribedChars,
          wordCount: stats.wordCount,
          wordsPerMinute: stats.wordsPerMinute,
          aiActions: stats.aiActions,
          aiActionsByCategory: stats.aiActionsByCategory || {},
          outputChars: stats.outputChars,
          voiceTimeSavedSeconds: stats.voiceTimeSavedSeconds,
          aiTimeSavedSeconds: stats.aiTimeSavedSeconds,
          weekStartDate: stats.weekStartDate,
          dailyStats: stats.dailyStats?.length > 0 ? stats.dailyStats : emptyDailyStats(),
          recentActivity: stats.recentActivity || [],
          isLoaded: true
        })
      } else {
        // Fallback: activity_records empty or week-filtered — use stats table
        const dbStats = await window.tapwisper.db.stats.get()
        if (dbStats) {
          const aiActionsByCategory = JSON.parse(dbStats.aiActionsByCategory || '{}')
          const dailyStats = JSON.parse(dbStats.dailyStats || '[]')
          const recentActivity = JSON.parse(dbStats.recentActivity || '[]')
          set({
            voiceSeconds: dbStats.voiceSeconds,
            transcribedChars: dbStats.transcribedChars,
            wordCount: dbStats.wordCount,
            wordsPerMinute: dbStats.wordsPerMinute,
            aiActions: dbStats.aiActions,
            aiActionsByCategory,
            outputChars: dbStats.outputChars,
            voiceTimeSavedSeconds: dbStats.voiceTimeSavedSeconds,
            aiTimeSavedSeconds: dbStats.aiTimeSavedSeconds,
            weekStartDate: dbStats.weekStartDate,
            dailyStats: dailyStats?.length > 0 ? dailyStats : emptyDailyStats(),
            recentActivity: recentActivity || [],
            isLoaded: true
          })
        } else {
          set({ isLoaded: true })
        }
      }
    } catch (err) {
      console.error('[StatsStore] Failed to load stats:', err)
      set({ isLoaded: true })
    }
  },

  addVoiceRecording: (seconds, chars, words) => {
    const state = get()
    // Estimate typing time: average 40 WPM, voice is 3x faster
    const typingSeconds = (words / 40) * 60
    const timeSaved = Math.max(0, typingSeconds - seconds)

    const dayIdx = getDayIndex()
    const prev = state.dailyStats[dayIdx] || { voiceSeconds: 0, aiActions: 0, wordCount: 0, timeSavedSeconds: 0 }
    const dailyStats = patchDailyStats(state.dailyStats, dayIdx, {
      voiceSeconds: prev.voiceSeconds + seconds,
      wordCount: prev.wordCount + words,
      timeSavedSeconds: prev.timeSavedSeconds + timeSaved
    })

    // Add activity entry
    const activity: ActivityEntry = {
      id: generateId(),
      type: 'voice',
      description: `Transcribed ${words} words`,
      timestamp: Date.now(),
      value: `${Math.round(seconds)}s`
    }
    const recentActivity = [activity, ...state.recentActivity].slice(0, 20)

    const updated = {
      voiceSeconds: state.voiceSeconds + seconds,
      transcribedChars: state.transcribedChars + chars,
      wordCount: state.wordCount + words,
      wordsPerMinute: seconds > 0 ? Math.round((words / seconds) * 60) : state.wordsPerMinute,
      voiceTimeSavedSeconds: state.voiceTimeSavedSeconds + timeSaved,
      dailyStats,
      recentActivity
    }

    set(updated)
    // Persist to database (debounced for performance)
    debouncedDBWrite(() => {
      const full = get()
      window.tapwisper.db.stats.update({
        voiceSeconds: full.voiceSeconds,
        transcribedChars: full.transcribedChars,
        wordCount: full.wordCount,
        wordsPerMinute: full.wordsPerMinute,
        voiceTimeSavedSeconds: full.voiceTimeSavedSeconds,
        dailyStats: JSON.stringify(full.dailyStats),
        recentActivity: JSON.stringify(full.recentActivity)
      })
    })
  },

  addAIAction: (category, outputChars) => {
    const state = get()
    const byCategory = { ...state.aiActionsByCategory }
    byCategory[category] = (byCategory[category] || 0) + 1

    // Estimate time saved: average 15 seconds per AI action manually
    const timeSaved = 15

    const dayIdx = getDayIndex()
    const prev = state.dailyStats[dayIdx] || { voiceSeconds: 0, aiActions: 0, wordCount: 0, timeSavedSeconds: 0 }
    const dailyStats = patchDailyStats(state.dailyStats, dayIdx, {
      aiActions: prev.aiActions + 1,
      timeSavedSeconds: prev.timeSavedSeconds + timeSaved
    })

    // Add activity entry
    const prettyCategory = category.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
    const activity: ActivityEntry = {
      id: generateId(),
      type: 'ai',
      description: `AI Action: ${prettyCategory}`,
      timestamp: Date.now(),
      value: `${outputChars} chars`
    }
    const recentActivity = [activity, ...state.recentActivity].slice(0, 20)

    const updated = {
      aiActions: state.aiActions + 1,
      aiActionsByCategory: byCategory,
      outputChars: state.outputChars + outputChars,
      aiTimeSavedSeconds: state.aiTimeSavedSeconds + timeSaved,
      dailyStats,
      recentActivity
    }

    set(updated)
    // Persist to database (debounced for performance)
    debouncedDBWrite(() => {
      const full = get()
      window.tapwisper.db.stats.update({
        aiActions: full.aiActions,
        aiActionsByCategory: JSON.stringify(full.aiActionsByCategory),
        outputChars: full.outputChars,
        aiTimeSavedSeconds: full.aiTimeSavedSeconds,
        dailyStats: JSON.stringify(full.dailyStats),
        recentActivity: JSON.stringify(full.recentActivity)
      })
    })
  },

  getTimeSavedMinutes: () => {
    const state = get()
    return Math.round(
      (state.voiceTimeSavedSeconds + state.aiTimeSavedSeconds) / 60
    )
  },

  resetWeekly: () => {
    const fresh = { ...defaultStats, weekStartDate: getMonday() }
    set(fresh)
    window.tapwisper.db.stats.resetWeekly()
  }
}))
