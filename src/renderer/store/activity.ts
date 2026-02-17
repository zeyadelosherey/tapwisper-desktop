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

interface ActivityState {
  records: TranscriptionRecord[]
  isLoaded: boolean
  loadRecords: () => Promise<void>
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

const MAX_RECORDS = 100 // Keep last 100 records

export const useActivityStore = create<ActivityState>((set, get) => ({
  records: [],
  isLoaded: false,

  loadRecords: async () => {
    try {
      const records = await window.tapwisper.db.activity.getAll(100)
      if (records && Array.isArray(records)) {
        set({ records: records as TranscriptionRecord[], isLoaded: true })
      } else {
        set({ isLoaded: true })
      }
    } catch (err) {
      console.error('[ActivityStore] Failed to load records:', err)
      set({ isLoaded: true })
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

    const state = get()
    const records = [record, ...state.records].slice(0, MAX_RECORDS)
    set({ records })
    window.tapwisper.db.activity.add(record)
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

    const state = get()
    const records = [record, ...state.records].slice(0, MAX_RECORDS)
    set({ records })
    window.tapwisper.db.activity.add(record)
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

    const state = get()
    const records = [record, ...state.records].slice(0, MAX_RECORDS)
    set({ records })
    window.tapwisper.db.activity.add(record)
  },

  deleteRecord: (id) => {
    const state = get()
    const records = state.records.filter((r) => r.id !== id)
    set({ records })
    window.tapwisper.db.activity.delete(id)
  },

  clearAll: () => {
    set({ records: [] })
    window.tapwisper.db.activity.clearAll()
  }
}))
