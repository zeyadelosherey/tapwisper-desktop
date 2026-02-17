/**
 * High-performance SQLite database for activity and stats data
 * Using better-sqlite3 for synchronous, fast database operations
 */

import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

// ── Type Definitions ──────────────────────────────────────────────
export interface StatsData {
  voiceSeconds: number
  transcribedChars: number
  wordCount: number
  wordsPerMinute: number
  aiActions: number
  aiActionsByCategory: string // JSON string
  outputChars: number
  voiceTimeSavedSeconds: number
  aiTimeSavedSeconds: number
  weekStartDate: string
  dailyStats: string // JSON string
  recentActivity: string // JSON string
  updatedAt: number
}

export interface ActivityRecord {
  id: string
  timestamp: number
  type: 'voice' | 'voice-with-llm'
  transcription: string
  durationSeconds: number
  wordCount: number
  llmAction?: string
  llmInput?: string
  llmResult?: string
}

// ── Database Instance ─────────────────────────────────────────────
let db: Database.Database | null = null

/**
 * Get database file path
 */
function getDatabasePath(): string {
  const userDataPath = app.getPath('userData')
  const dbDir = path.join(userDataPath, 'database')
  
  // Ensure directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
  
  return path.join(dbDir, 'tapwisper.db')
}

/**
 * Initialize database with schema and indexes
 */
export function initDatabase(): Database.Database {
  if (db) return db

  const dbPath = getDatabasePath()

  db = new Database(dbPath)

  // Enable WAL mode for better concurrency and performance
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL') // Faster writes, still safe
  db.pragma('cache_size = 10000') // 10MB cache
  db.pragma('temp_store = MEMORY')
  db.pragma('mmap_size = 268435456') // 256MB memory-mapped I/O (sufficient for app-sized DB)

  // Create schema
  createSchema(db)

  return db
}

/**
 * Create database schema with proper indexes
 */
function createSchema(database: Database.Database): void {
  // ── Stats Table ──
  database.exec(`
    CREATE TABLE IF NOT EXISTS stats (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      voiceSeconds REAL NOT NULL DEFAULT 0,
      transcribedChars INTEGER NOT NULL DEFAULT 0,
      wordCount INTEGER NOT NULL DEFAULT 0,
      wordsPerMinute INTEGER NOT NULL DEFAULT 0,
      aiActions INTEGER NOT NULL DEFAULT 0,
      aiActionsByCategory TEXT NOT NULL DEFAULT '{}',
      outputChars INTEGER NOT NULL DEFAULT 0,
      voiceTimeSavedSeconds REAL NOT NULL DEFAULT 0,
      aiTimeSavedSeconds REAL NOT NULL DEFAULT 0,
      weekStartDate TEXT NOT NULL,
      dailyStats TEXT NOT NULL DEFAULT '[]',
      recentActivity TEXT NOT NULL DEFAULT '[]',
      updatedAt INTEGER NOT NULL DEFAULT 0
    );

    -- Initialize stats row if it doesn't exist
    INSERT OR IGNORE INTO stats (id, weekStartDate, updatedAt)
    VALUES (1, date('now', 'weekday 1', '-7 days'), strftime('%s', 'now') * 1000);
  `)

  // ── Activity Records Table ──
  database.exec(`
    CREATE TABLE IF NOT EXISTS activity_records (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('voice', 'voice-with-llm')),
      transcription TEXT NOT NULL,
      durationSeconds REAL NOT NULL,
      wordCount INTEGER NOT NULL,
      llmAction TEXT,
      llmInput TEXT,
      llmResult TEXT
    );

    -- Indexes for fast queries
    CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_records(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_records(type);
    CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_records(date(timestamp / 1000, 'unixepoch'));
  `)

}

/**
 * Get database instance (initializes if needed)
 */
export function getDatabase(): Database.Database {
  if (!db) {
    return initDatabase()
  }
  return db
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

// ── Stats Operations ──────────────────────────────────────────────

/**
 * Get current stats
 */
export function getStats(): StatsData | null {
  const database = getDatabase()
  const stmt = database.prepare('SELECT * FROM stats WHERE id = 1')
  const row = stmt.get() as StatsData | undefined
  
  if (!row) {
    // Initialize with defaults
    const now = Date.now()
    const weekStart = getMonday()
    database.prepare(`
      INSERT INTO stats (id, weekStartDate, updatedAt)
      VALUES (1, ?, ?)
    `).run(weekStart, now)
    
    return {
      voiceSeconds: 0,
      transcribedChars: 0,
      wordCount: 0,
      wordsPerMinute: 0,
      aiActions: 0,
      aiActionsByCategory: '{}',
      outputChars: 0,
      voiceTimeSavedSeconds: 0,
      aiTimeSavedSeconds: 0,
      weekStartDate: weekStart,
      dailyStats: '[]',
      recentActivity: '[]',
      updatedAt: now
    }
  }
  
  return row
}

/**
 * Update stats (atomic transaction)
 */
export function updateStats(data: Partial<StatsData>): void {
  const database = getDatabase()
  
  const updates: string[] = []
  const values: any[] = []
  
  // Build dynamic UPDATE query
  for (const [key, value] of Object.entries(data)) {
    if (key !== 'id') {
      updates.push(`${key} = ?`)
      values.push(value)
    }
  }
  
  if (updates.length === 0) return
  
  // Always update timestamp
  updates.push('updatedAt = ?')
  values.push(Date.now())
  
  const sql = `UPDATE stats SET ${updates.join(', ')} WHERE id = 1`
  database.prepare(sql).run(...values)
}

/**
 * Reset weekly stats
 */
export function resetWeeklyStats(): void {
  const database = getDatabase()
  const weekStart = getMonday()
  
  database.prepare(`
    UPDATE stats SET
      voiceSeconds = 0,
      transcribedChars = 0,
      wordCount = 0,
      wordsPerMinute = 0,
      aiActions = 0,
      aiActionsByCategory = '{}',
      outputChars = 0,
      voiceTimeSavedSeconds = 0,
      aiTimeSavedSeconds = 0,
      weekStartDate = ?,
      dailyStats = '[]',
      recentActivity = '[]',
      updatedAt = ?
    WHERE id = 1
  `).run(weekStart, Date.now())
}

// ── Activity Records Operations ───────────────────────────────────

/**
 * Get all activity records (limited to most recent)
 */
export function getActivityRecords(limit = 100): ActivityRecord[] {
  const database = getDatabase()
  const stmt = database.prepare(`
    SELECT * FROM activity_records
    ORDER BY timestamp DESC
    LIMIT ?
  `)
  
  return stmt.all(limit) as ActivityRecord[]
}

/**
 * Add new activity record
 */
export function addActivityRecord(record: ActivityRecord): void {
  const database = getDatabase()
  
  const stmt = database.prepare(`
    INSERT INTO activity_records (
      id, timestamp, type, transcription, durationSeconds, wordCount,
      llmAction, llmInput, llmResult
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  
  stmt.run(
    record.id,
    record.timestamp,
    record.type,
    record.transcription,
    record.durationSeconds,
    record.wordCount,
    record.llmAction || null,
    record.llmInput || null,
    record.llmResult || null
  )
}

/**
 * Delete activity record by ID
 */
export function deleteActivityRecord(id: string): void {
  const database = getDatabase()
  database.prepare('DELETE FROM activity_records WHERE id = ?').run(id)
}

/**
 * Clear all activity records
 */
export function clearAllActivityRecords(): void {
  const database = getDatabase()
  database.prepare('DELETE FROM activity_records').run()
}

/**
 * Get activity records by date range
 */
export function getActivityRecordsByDateRange(startDate: number, endDate: number): ActivityRecord[] {
  const database = getDatabase()
  const stmt = database.prepare(`
    SELECT * FROM activity_records
    WHERE timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp DESC
  `)
  
  return stmt.all(startDate, endDate) as ActivityRecord[]
}

/**
 * Get activity stats for a date range (optimized aggregation)
 */
export function getActivityStats(startDate: number, endDate: number): {
  totalRecords: number
  voiceRecords: number
  llmRecords: number
  totalDuration: number
  totalWords: number
} {
  const database = getDatabase()
  const stmt = database.prepare(`
    SELECT
      COUNT(*) as totalRecords,
      SUM(CASE WHEN type = 'voice' THEN 1 ELSE 0 END) as voiceRecords,
      SUM(CASE WHEN type = 'voice-with-llm' THEN 1 ELSE 0 END) as llmRecords,
      SUM(durationSeconds) as totalDuration,
      SUM(wordCount) as totalWords
    FROM activity_records
    WHERE timestamp >= ? AND timestamp <= ?
  `)
  
  return stmt.get(startDate, endDate) as any
}

/**
 * Computed stats structure for dashboard (derived from activity_records)
 */
export interface WeeklyStatsFromActivity {
  voiceSeconds: number
  transcribedChars: number
  wordCount: number
  wordsPerMinute: number
  aiActions: number
  aiActionsByCategory: Record<string, number>
  outputChars: number
  voiceTimeSavedSeconds: number
  aiTimeSavedSeconds: number
  weekStartDate: string
  dailyStats: Array<{ voiceSeconds: number; aiActions: number; wordCount: number; timeSavedSeconds: number }>
  recentActivity: Array<{ id: string; type: 'voice' | 'ai'; description: string; timestamp: number; value?: string }>
}

/**
 * Compute dashboard stats from activity_records (source of truth).
 * Replaces incremental stats table for accurate dashboard display.
 */
export function getWeeklyStatsFromActivity(): WeeklyStatsFromActivity {
  const database = getDatabase()
  const weekStart = getMonday() // e.g. "2025-02-17"
  const [y, m, d] = weekStart.split('-').map(Number)
  const weekStartDate = new Date(y, m - 1, d, 0, 0, 0, 0) // local midnight
  const startTs = weekStartDate.getTime()
  const endTs = Date.now()

  const records = database.prepare(`
    SELECT * FROM activity_records
    WHERE timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp DESC
  `).all(startTs, endTs) as ActivityRecord[]

  const TYPING_WPM = 40
  const AI_TIME_SAVED_PER_ACTION = 15

  let voiceSeconds = 0
  let transcribedChars = 0
  let wordCount = 0
  let aiActions = 0
  let outputChars = 0
  let voiceTimeSavedSeconds = 0
  let aiTimeSavedSeconds = 0
  const aiActionsByCategory: Record<string, number> = {}

  const emptyDaily = (): { voiceSeconds: number; aiActions: number; wordCount: number; timeSavedSeconds: number } =>
    ({ voiceSeconds: 0, aiActions: 0, wordCount: 0, timeSavedSeconds: 0 })
  const dailyStats: Array<{ voiceSeconds: number; aiActions: number; wordCount: number; timeSavedSeconds: number }> =
    Array.from({ length: 7 }, emptyDaily)

  const recentActivity: WeeklyStatsFromActivity['recentActivity'] = []

  for (const r of records) {
    const secs = r.durationSeconds || 0
    const words = r.wordCount || 0
    const chars = (r.transcription?.length || 0) + (r.llmResult?.length || 0)

    voiceSeconds += secs
    transcribedChars += chars
    wordCount += words

    const dayIdx = getDayIndexFromTimestamp(r.timestamp)
    if (dayIdx >= 0 && dayIdx < 7) {
      dailyStats[dayIdx].voiceSeconds += secs
      dailyStats[dayIdx].wordCount += words
    }

    if (r.type === 'voice-with-llm' && r.llmResult) {
      aiActions += 1
      outputChars += r.llmResult.length
      aiTimeSavedSeconds += AI_TIME_SAVED_PER_ACTION
      const cat = r.llmAction || 'general'
      aiActionsByCategory[cat] = (aiActionsByCategory[cat] || 0) + 1
      if (dayIdx >= 0 && dayIdx < 7) {
        dailyStats[dayIdx].aiActions += 1
        dailyStats[dayIdx].timeSavedSeconds += AI_TIME_SAVED_PER_ACTION
      }

      recentActivity.push({
        id: r.id,
        type: 'ai',
        description: `AI Action: ${(r.llmAction || 'general').replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}`,
        timestamp: r.timestamp,
        value: `${r.llmResult.length} chars`
      })
    } else {
      const typingSeconds = words > 0 ? (words / TYPING_WPM) * 60 : 0
      const saved = Math.max(0, typingSeconds - secs)
      voiceTimeSavedSeconds += saved
      if (dayIdx >= 0 && dayIdx < 7) {
        dailyStats[dayIdx].timeSavedSeconds += saved
      }

      recentActivity.push({
        id: r.id,
        type: 'voice',
        description: `Transcribed ${words} words`,
        timestamp: r.timestamp,
        value: `${Math.round(secs)}s`
      })
    }
  }

  recentActivity.sort((a, b) => b.timestamp - a.timestamp)
  const trimmed = recentActivity.slice(0, 20)

  const wordsPerMinute = voiceSeconds > 0 ? Math.round((wordCount / voiceSeconds) * 60) : 0

  return {
    voiceSeconds,
    transcribedChars,
    wordCount,
    wordsPerMinute,
    aiActions,
    aiActionsByCategory,
    outputChars,
    voiceTimeSavedSeconds,
    aiTimeSavedSeconds,
    weekStartDate: weekStart,
    dailyStats,
    recentActivity: trimmed
  }
}

function getDayIndexFromTimestamp(ts: number): number {
  const d = new Date(ts)
  const day = d.getDay()
  return day === 0 ? 6 : day - 1
}

/**
 * Cleanup old records (keep only recent ones for performance)
 */
export function cleanupOldRecords(keepCount = 500): void {
  const database = getDatabase()
  
  // Delete all but the most recent keepCount records
  database.prepare(`
    DELETE FROM activity_records
    WHERE id NOT IN (
      SELECT id FROM activity_records
      ORDER BY timestamp DESC
      LIMIT ?
    )
  `).run(keepCount)
  
  // Optimize database after cleanup
  database.prepare('VACUUM').run()
}

// ── Utility Functions ─────────────────────────────────────────────

function getMonday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}

/**
 * Export database to JSON (for backup/migration)
 */
export function exportToJSON(): { stats: StatsData | null; records: ActivityRecord[] } {
  return {
    stats: getStats(),
    records: getActivityRecords(1000)
  }
}

/**
 * Import from JSON (for backup/migration)
 */
export function importFromJSON(data: { stats?: StatsData; records?: ActivityRecord[] }): void {
  const database = getDatabase()
  
  // Use transaction for atomic import
  const transaction = database.transaction(() => {
    // Import stats
    if (data.stats) {
      updateStats(data.stats)
    }
    
    // Import records
    if (data.records) {
      for (const record of data.records) {
        addActivityRecord(record)
      }
    }
  })
  
  transaction()
}
