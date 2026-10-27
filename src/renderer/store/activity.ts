import { create } from 'zustand'

export interface TranscriptionRecord {
  id: string
  timestamp: number
  type: 'voice' | 'voice-with-llm'
  // Voice transcription data
  transcription: string
  durationSeconds: number
  wordCount: number
  // LLM action data (if applicable)
  llmAction?: string
  llmInput?: string
  llmResult?: string
}

export interface ActivityQuery {
  offset?: number
  limit?: number
  search?: string
}

export interface ActivityPage {
  records: TranscriptionRecord[]
  /** Total records matching the query (all pages) */
  total: number
}

interface ActivityState {
  /** Most recent records (first RECENT_LIMIT) — use queryRecords for full history */
  records: TranscriptionRecord[]
  /** Total number of records stored in the database */
  totalCount: number
  isLoaded: boolean
  loadRecords: () => Promise<void>
  /** Paged + searchable query against the whole history (database-side) */
  queryRecords: (query: ActivityQuery) => Promise<ActivityPage>
  addTranscription: (data: {
    transcription: string
    durationSeconds: number
    wordCount: number
  }) => void
  addTranscriptionWithLLM: (data: {
    transcription: string
    durationSeconds: number
    wordCount: number
    llmAction: string
    llmInput: string
    llmResult: string
  }) => void
  addLLMAction: (data: {
    llmAction: string
    llmInput: string
    llmResult: string
  }) => void
  deleteRecord: (id: string) => void
  clearAll: () => void
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

const RECENT_LIMIT = 100 // Recent records kept in memory; older ones are queried on demand

export const useActivityStore = create<ActivityState>((set, get) => ({
  records: [],
  totalCount: 0,
  isLoaded: false,

  loadRecords: async () => {
    try {
      const page = await window.tapwisper.db.activity.query({ offset: 0, limit: RECENT_LIMIT })
      if (page && Array.isArray(page.records)) {
        set({
          records: page.records as TranscriptionRecord[],
          totalCount: page.total,
          isLoaded: true
        })
      } else {
        set({ isLoaded: true })
      }
    } catch {
      // Database unavailable — show an empty history rather than spinning
      set({ isLoaded: true })
    }
  },

  queryRecords: async (query) => {
    const page = await window.tapwisper.db.activity.query(query)
    return {
      records: (page?.records ?? []) as TranscriptionRecord[],
      total: page?.total ?? 0
    }
  },

  addTranscription: (data) => {
    const record: TranscriptionRecord = {
      id: generateId(),
      timestamp: Date.now(),
      type: 'voice',
      transcription: data.transcription,
      durationSeconds: data.durationSeconds,
      wordCount: data.wordCount
    }

    window.tapwisper.db.activity.add(record)
    const state = get()
    const records = [record, ...state.records].slice(0, RECENT_LIMIT)
    set({ records, totalCount: state.totalCount + 1 })
  },

  addTranscriptionWithLLM: (data) => {
    const record: TranscriptionRecord = {
      id: generateId(),
      timestamp: Date.now(),
      type: 'voice-with-llm',
      transcription: data.transcription,
      durationSeconds: data.durationSeconds,
      wordCount: data.wordCount,
      llmAction: data.llmAction,
      llmInput: data.llmInput,
      llmResult: data.llmResult
    }

    window.tapwisper.db.activity.add(record)
    const state = get()
    const records = [record, ...state.records].slice(0, RECENT_LIMIT)
    set({ records, totalCount: state.totalCount + 1 })
  },

  addLLMAction: (data) => {
    const record: TranscriptionRecord = {
      id: generateId(),
      timestamp: Date.now(),
      type: 'voice-with-llm',
      transcription: '',
      durationSeconds: 0,
      wordCount: 0,
      llmAction: data.llmAction,
      llmInput: data.llmInput,
      llmResult: data.llmResult
    }

    window.tapwisper.db.activity.add(record)
    const state = get()
    const records = [record, ...state.records].slice(0, RECENT_LIMIT)
    set({ records, totalCount: state.totalCount + 1 })
  },

  deleteRecord: (id) => {
    // Send the delete before updating state: views re-query the database when
    // totalCount changes, and IPC calls are handled in order.
    window.tapwisper.db.activity.delete(id)
    const state = get()
    const records = state.records.filter((r) => r.id !== id)
    set({ records, totalCount: Math.max(0, state.totalCount - 1) })
  },

  clearAll: () => {
    window.tapwisper.db.activity.clearAll()
    set({ records: [], totalCount: 0 })
  }
}))
