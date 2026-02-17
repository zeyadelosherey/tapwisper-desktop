# TapWisper Database Implementation

## Overview

TapWisper now uses **SQLite** (via better-sqlite3) for persistent storage of activity logs and usage statistics. This provides superior performance, reliability, and scalability compared to the previous JSON-based storage.

## Architecture

### Database Location
- **File**: `~/Library/Application Support/tapwisper-desktop/database/tapwisper.db` (macOS)
- **Windows**: `%APPDATA%/tapwisper-desktop/database/tapwisper.db`
- **Linux**: `~/.config/tapwisper-desktop/database/tapwisper.db`

### Database Mode
- **WAL (Write-Ahead Logging)**: Enables better concurrency and crash recovery
- **Synchronous = NORMAL**: Optimized for speed while maintaining safety
- **Memory-mapped I/O**: Faster reads for frequently accessed data
- **10MB cache**: In-memory caching for lightning-fast queries

## Schema

### Stats Table
Stores aggregated usage statistics with automatic weekly reset.

```sql
CREATE TABLE stats (
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
```

### Activity Records Table
Stores individual transcription and AI action records.

```sql
CREATE TABLE activity_records (
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

-- Optimized indexes for fast queries
CREATE INDEX idx_activity_timestamp ON activity_records(timestamp DESC);
CREATE INDEX idx_activity_type ON activity_records(type);
CREATE INDEX idx_activity_date ON activity_records(date(timestamp / 1000, 'unixepoch'));
```

## Performance Optimizations

### 1. Debounced Writes
- Database writes are debounced (500ms) to prevent excessive I/O
- Multiple rapid updates are batched into a single write
- Reduces disk wear and improves battery life

### 2. Indexed Queries
- Primary timestamp index for chronological queries
- Type index for filtering by activity type
- Date index for daily/weekly aggregations

### 3. Automatic Cleanup
- Old records are automatically pruned (keeps 500 most recent by default)
- `VACUUM` command optimizes database file size after cleanup

### 4. Prepared Statements
- All queries use prepared statements (cached by better-sqlite3)
- Prevents SQL injection and improves performance

## API Usage

### From Renderer Process

```typescript
// Stats operations
const stats = await window.tapwisper.db.stats.get()
await window.tapwisper.db.stats.update({ voiceSeconds: 120 })
await window.tapwisper.db.stats.resetWeekly()

// Activity records operations
const records = await window.tapwisper.db.activity.getAll(100)
await window.tapwisper.db.activity.add(record)
await window.tapwisper.db.activity.delete(id)
await window.tapwisper.db.activity.clearAll()

// Advanced queries
const rangeRecords = await window.tapwisper.db.activity.getByDateRange(startDate, endDate)
const aggregatedStats = await window.tapwisper.db.activity.getStats(startDate, endDate)

// Maintenance
await window.tapwisper.db.cleanupOldRecords(500)

// Backup/Export
const backup = await window.tapwisper.db.exportJSON()
await window.tapwisper.db.importJSON(backup)
```

### From Main Process

```typescript
import * as db from './database'

// Initialize database (called on app start)
db.initDatabase()

// Stats operations
const stats = db.getStats()
db.updateStats({ voiceSeconds: 120 })
db.resetWeeklyStats()

// Activity operations
const records = db.getActivityRecords(100)
db.addActivityRecord(record)
db.deleteActivityRecord(id)
db.clearAllActivityRecords()

// Advanced queries
const rangeRecords = db.getActivityRecordsByDateRange(startDate, endDate)
const aggregatedStats = db.getActivityStats(startDate, endDate)

// Cleanup
db.cleanupOldRecords(500)

// Close database (called on app quit)
db.closeDatabase()
```

## Migration

Data is automatically migrated from the old electron-store format on first run:

1. Old `stats` and `activityRecords` are read from electron-store
2. Data is imported into SQLite database
3. Old data is removed from electron-store to avoid duplication
4. Future reads/writes use SQLite exclusively

## Benefits

### 🚀 Performance
- **10-100x faster queries** compared to JSON file parsing
- Sub-millisecond reads for indexed queries
- Efficient aggregations without loading entire dataset

### 💾 Reliability
- **ACID transactions**: Data integrity even during crashes
- **WAL mode**: Crash recovery without data loss
- **Atomic writes**: No partial updates or corruption

### 📈 Scalability
- Handles **thousands of records** without slowdown
- Efficient storage (binary format vs JSON)
- Automatic indexing for complex queries

### 🔋 Battery Friendly
- Debounced writes reduce disk I/O
- Memory-mapped reads minimize system calls
- Optimized cache reduces redundant queries

### 🛠️ Developer Experience
- Type-safe API with TypeScript
- Comprehensive error handling
- Easy backup/restore functionality

## Maintenance

### Database File Size
- Typical size: 100KB - 1MB for normal usage
- Automatic cleanup keeps size optimal
- Manual cleanup available via `cleanupOldRecords()`

### Backup & Export
```typescript
// Export to JSON (for backup or migration)
const backup = await window.tapwisper.db.exportJSON()
fs.writeFileSync('backup.json', JSON.stringify(backup))

// Import from JSON
const data = JSON.parse(fs.readFileSync('backup.json'))
await window.tapwisper.db.importJSON(data)
```

### Troubleshooting

**Database locked errors**:
- Better-sqlite3 is synchronous and single-threaded by design
- Never happens with proper usage (all calls from main process)

**Corrupted database**:
- Delete database file and restart app (will create fresh database)
- Restore from backup if available

**Performance issues**:
- Run cleanup: `db.cleanupOldRecords(500)`
- Optimize: `db.getDatabase().prepare('VACUUM').run()`

## Future Enhancements

Potential improvements for future versions:

1. **Full-text search** on transcriptions
2. **Advanced analytics** (trends, patterns)
3. **Cloud sync** (optional backup to cloud)
4. **Export formats** (CSV, Excel, PDF reports)
5. **Data retention policies** (automatic cleanup rules)

---

**Note**: Configuration data (API keys, settings, etc.) remains in electron-store for security and simplicity. Only activity and stats use SQLite.
