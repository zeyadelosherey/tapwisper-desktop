/**
 * Data migration utility
 * Migrates data from electron-store to SQLite database
 */

import { getStore } from './store'
import * as db from './database'

/**
 * Migrate stats data from electron-store to database
 */
function migrateStats(): void {
  const store = getStore()
  const oldStats = store.get('stats' as any)
  
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
    store.delete('stats' as any)
  } catch {
    // Migration failure is non-fatal — old data stays in electron-store
  }
}

/**
 * Migrate activity records from electron-store to database
 */
function migrateActivityRecords(): void {
  const store = getStore()
  const oldRecords = store.get('activityRecords' as any)
  
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
    store.delete('activityRecords' as any)
  } catch {
    // Migration failure is non-fatal — old data stays in electron-store
  }
}

/**
 * Run all migrations
 */
export function runMigrations(): void {
  try {
    migrateStats()
    migrateActivityRecords()
  } catch {
    // Migration failure is non-fatal — app continues with empty database
  }
}
