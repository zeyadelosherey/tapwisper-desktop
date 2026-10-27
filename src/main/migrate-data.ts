/**
 * Data migration utility
 * Migrates data from electron-store to SQLite database
 */

import { getStore, migrateApiKeysToSafeStorage } from './store'

/** Untyped view of the store for keys that predate the current AppConfig schema */
// Legacy JSON shapes are loosely typed; numbers/strings are coerced below
/* eslint-disable @typescript-eslint/no-explicit-any */
type LegacyRecord = Record<string, any>
/* eslint-enable @typescript-eslint/no-explicit-any */

function legacyStore(): {
  get: (key: string) => unknown
  delete: (key: string) => void
} {
  return getStore() as unknown as {
    get: (key: string) => unknown
    delete: (key: string) => void
  }
}
import * as db from './database'

/**
 * Migrate stats data from electron-store to database
 */
function migrateStats(): void {
  const legacy = legacyStore()
  const oldStats = legacy.get('stats') as LegacyRecord | undefined
  
  if (!oldStats) {
    return
  }

  try {
    db.updateStats({
      voiceSeconds: oldStats.voiceSeconds || 0,
      transcribedChars: oldStats.transcribedChars || 0,
      wordCount: oldStats.wordCount || 0,
      wordsPerMinute: oldStats.wordsPerMinute || 0,
      aiActions: oldStats.aiActions || 0,
      aiActionsByCategory: JSON.stringify(oldStats.aiActionsByCategory || {}),
      outputChars: oldStats.outputChars || 0,
      voiceTimeSavedSeconds: oldStats.voiceTimeSavedSeconds || 0,
      aiTimeSavedSeconds: oldStats.aiTimeSavedSeconds || 0,
      weekStartDate: oldStats.weekStartDate || new Date().toISOString().split('T')[0],
      dailyStats: JSON.stringify(oldStats.dailyStats || []),
      recentActivity: JSON.stringify(oldStats.recentActivity || [])
    })
    
    // Remove old data to avoid re-migration
    legacy.delete('stats')
  } catch {
    // Migration failure is non-fatal — old data stays in electron-store
  }
}

/**
 * Migrate activity records from electron-store to database
 */
function migrateActivityRecords(): void {
  const legacy = legacyStore()
  const oldRecords = legacy.get('activityRecords')
  
  if (!oldRecords || !Array.isArray(oldRecords)) {
    return
  }

  try {
    for (const record of oldRecords) {
      try {
        db.addActivityRecord({
          id: record.id,
          timestamp: record.timestamp,
          type: record.type || 'voice',
          transcription: record.transcription || '',
          durationSeconds: record.durationSeconds || 0,
          wordCount: record.wordCount || 0,
          llmAction: record.llmAction,
          llmInput: record.llmInput,
          llmResult: record.llmResult
        })
      } catch {
        // Skip records that fail (e.g. duplicate IDs)
      }
    }
    
    // Remove old data to avoid re-migration
    legacy.delete('activityRecords')
  } catch {
    // Migration failure is non-fatal — old data stays in electron-store
  }
}

/**
 * Older builds stored a display id ("soniox-stt-async-v3") instead of a real
 * Soniox model id — replace it so the API accepts it and Settings highlights it.
 */
function migrateSonioxModel(): void {
  const store = getStore()
  const voiceModels = store.get('voiceModels')
  if (voiceModels && !voiceModels.soniox?.startsWith('stt-')) {
    store.set('voiceModels', { ...voiceModels, soniox: 'stt-async-v4' })
  }
}

/**
 * v1.2: single speechLanguage → speechLanguages[], free-text vocabulary →
 * dictionary entries.
 */
function migrateSpeechSettings(): void {
  const legacy = legacyStore()
  const store = getStore()

  const oldLanguage = legacy.get('speechLanguage')
  if (typeof oldLanguage === 'string') {
    if (oldLanguage && oldLanguage !== 'auto' && store.get('speechLanguages').length === 0) {
      store.set('speechLanguages', [oldLanguage])
    }
    legacy.delete('speechLanguage')
  }

  const oldVocabulary = legacy.get('speechVocabulary')
  if (typeof oldVocabulary === 'string') {
    const existing = store.get('dictionary')
    const known = new Set(existing.map((e) => e.term.toLowerCase()))
    const added = oldVocabulary
      .split(/[\n,]+/)
      .map((t) => t.trim())
      .filter((t) => t && !known.has(t.toLowerCase()))
      .map((term, i) => ({ id: `migrated-${Date.now()}-${i}`, term, aliases: [], createdAt: Date.now() }))
    if (added.length) store.set('dictionary', [...existing, ...added])
    legacy.delete('speechVocabulary')
  }
}

/**
 * Run all migrations
 */
export function runMigrations(): void {
  // Each migration is independent — one failing must not skip the others
  for (const migrate of [
    migrateStats,
    migrateActivityRecords,
    migrateSonioxModel,
    migrateSpeechSettings,
    migrateApiKeysToSafeStorage
  ]) {
    try {
      migrate()
    } catch {
      // Migration failure is non-fatal — app continues with current data
    }
  }
}
