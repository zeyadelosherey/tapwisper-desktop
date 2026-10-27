/**
 * Downloaded model files: where they live, downloading (resumable, pinned to a
 * Hugging Face commit, verified) and deleting. Models are plain data files, so
 * they need no code signing.
 */
import { app, net } from 'electron'
import { createHash, type Hash } from 'crypto'
import { createReadStream, createWriteStream, type WriteStream } from 'fs'
import { mkdir, rename, rm, stat, statfs } from 'fs/promises'
import { once } from 'events'
import path from 'path'
import { getConfigValue } from '../store'
import { LocalAiError } from './errors'
import { resolveSource, type FileRole, type RemoteFile } from './hf'
import { DISK_HEADROOM_BYTES, MODEL_CATALOG, getModel } from '../../shared/local-ai/catalog'
import type {
  DownloadProgress,
  LocalAiErrorCode,
  LocalAiResult,
  LocalAiSettings,
  LocalModelEntry
} from '../../shared/local-ai/types'

const MAX_ATTEMPTS = 4
const PROGRESS_INTERVAL_MS = 250
/** Partial downloads nobody resumed for this long are removed */
const STALE_PART_MS = 7 * 24 * 60 * 60_000

export function modelsDir(): string {
  const settings = getConfigValue('localAi') as LocalAiSettings | undefined
  return settings?.modelsDir || path.join(app.getPath('userData'), 'models')
}

/**
 * Where a model's files live. Named after the catalog id, not the upstream
 * file, so a renamed upstream file never orphans a download.
 */
export function modelFiles(model: LocalModelEntry): Record<FileRole, string | null> {
  const base = path.join(modelsDir(), model.kind, model.id)
  return {
    model: `${base}.${model.runtime === 'llama' ? 'gguf' : 'bin'}`,
    mmproj: model.source.mmproj ? `${base}.mmproj.gguf` : null
  }
}

function localPaths(model: LocalModelEntry): string[] {
  return Object.values(modelFiles(model)).filter((p): p is string => p !== null)
}

async function fileSize(file: string): Promise<number | null> {
  try {
    return (await stat(file)).size
  } catch {
    return null
  }
}

export async function isInstalled(model: LocalModelEntry): Promise<boolean> {
  const sizes = await Promise.all(localPaths(model).map(fileSize))
  return sizes.every((size) => size !== null)
}

/** Ids of the catalog models present on disk; also clears out stale partial files */
export async function listInstalled(): Promise<string[]> {
  const results = await Promise.all(
    MODEL_CATALOG.map(async (model) => {
      if (!downloads.has(model.id)) await removeStaleParts(model)
      return (await isInstalled(model)) ? model.id : null
    })
  )
  return results.filter((id): id is string => id !== null)
}

async function removeStaleParts(model: LocalModelEntry): Promise<void> {
  for (const file of localPaths(model)) {
    const part = await stat(`${file}.part`).catch(() => null)
    if (part && Date.now() - part.mtimeMs > STALE_PART_MS) await rm(`${file}.part`, { force: true })
  }
}

/** Free bytes on the volume holding `dir` (or its nearest existing parent) */
export async function freeDiskBytes(dir: string): Promise<number | null> {
  let current = dir
  for (;;) {
    try {
      const fs = await statfs(current)
      return fs.bavail * fs.bsize
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return null
      current = parent
    }
  }
}

// ── Downloading ───────────────────────────────────────────────────

class DownloadError extends LocalAiError {
  constructor(
    code: LocalAiErrorCode,
    readonly retryable = false
  ) {
    super(code)
  }
}

interface ActiveDownload {
  controller: AbortController
  done: Promise<LocalAiResult<void>>
}

const downloads = new Map<string, ActiveDownload>()

/** Download a catalog model. Calling it again for the same id joins the running download */
export function downloadModel(
  id: string,
  onProgress: (progress: DownloadProgress) => void
): Promise<LocalAiResult<void>> {
  const running = downloads.get(id)
  if (running) return running.done
  const model = getModel(id)
  if (!model) return Promise.resolve({ ok: false, code: 'model-unavailable' })

  const controller = new AbortController()
  const done = runDownload(model, controller.signal, onProgress).finally(() => downloads.delete(id))
  downloads.set(id, { controller, done })
  return done
}

export function cancelDownload(id: string): void {
  downloads.get(id)?.controller.abort()
}

async function runDownload(
  model: LocalModelEntry,
  signal: AbortSignal,
  onProgress: (progress: DownloadProgress) => void
): Promise<LocalAiResult<void>> {
  const report = new ProgressReporter(model.id, onProgress)
  try {
    if (await isInstalled(model)) return { ok: true, data: undefined }
    const remote = await resolveSource(model.source)
    const targets = modelFiles(model)
    const total = remote.reduce((sum, f) => sum + (f.size ?? 0), 0) || model.sizeBytes

    // Disk space for what is still missing, across all files
    const dir = path.dirname(targets.model!)
    await mkdir(dir, { recursive: true })
    const have = await Promise.all(
      remote.map(async (f) => {
        const target = targets[f.role]!
        return (await fileSize(target)) ?? (await fileSize(`${target}.part`)) ?? 0
      })
    )
    const free = await freeDiskBytes(dir)
    const missing = total - have.reduce((a, b) => a + b, 0)
    if (free !== null && free < missing + DISK_HEADROOM_BYTES) {
      throw new DownloadError('insufficient-disk')
    }

    let completed = 0
    for (const file of remote) {
      const target = targets[file.role]!
      if ((await fileSize(target)) === null) {
        await downloadFile(file, target, signal, (received) =>
          report.bytes(completed + received, total)
        )
      }
      completed += (await fileSize(target)) ?? 0
    }
    report.state('done')
    return { ok: true, data: undefined }
  } catch (err) {
    if (signal.aborted) {
      report.state('cancelled')
      return { ok: false, code: 'download-failed', detail: 'cancelled' }
    }
    const code = err instanceof LocalAiError ? err.code : 'download-failed'
    report.state('error', code)
    return { ok: false, code, detail: (err as Error).message }
  }
}

/** Download one file to `<target>.part`, verify it and move it into place */
async function downloadFile(
  file: RemoteFile,
  target: string,
  signal: AbortSignal,
  onBytes: (received: number) => void
): Promise<void> {
  const part = `${target}.part`
  // Hashed while it streams in, so a multi-GB file isn't read a second time
  const digest = new StreamingDigest(Boolean(file.sha256))
  for (let attempt = 1; ; attempt++) {
    try {
      await digest.catchUp(part)
      await fetchToFile(file, part, signal, digest, onBytes)
      break
    } catch (err) {
      const retryable = !signal.aborted && (!(err instanceof DownloadError) || err.retryable)
      if (!retryable || attempt >= MAX_ATTEMPTS) throw err
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
    }
  }

  const verified = file.sha256
    ? digest.hex() === file.sha256
    : file.size === undefined || (await fileSize(part)) === file.size
  if (!verified) {
    await rm(part, { force: true })
    throw new DownloadError('checksum-mismatch')
  }
  await rename(part, target)
}

/** SHA-256 of a partial file as it grows, picking up after interruptions */
class StreamingDigest {
  private hash: Hash | null = null
  private hashed = 0

  constructor(private readonly enabled: boolean) {
    this.reset()
  }

  /** Bring the hash up to the file's current length (on resume or after a failed attempt) */
  async catchUp(file: string): Promise<void> {
    if (!this.enabled) return
    const size = (await fileSize(file)) ?? 0
    if (size === this.hashed) return
    this.reset()
    if (size > 0) for await (const chunk of createReadStream(file)) this.update(chunk as Buffer)
  }

  reset(): void {
    this.hash = this.enabled ? createHash('sha256') : null
    this.hashed = 0
  }

  update(chunk: Uint8Array): void {
    this.hash?.update(chunk)
    this.hashed += chunk.byteLength
  }

  hex(): string {
    return this.hash?.digest('hex') ?? ''
  }
}

/** Throttled progress events with a running download speed */
class ProgressReporter {
  private received = 0
  private total = 0
  private lastSent = 0
  private lastBytes = 0
  private bytesPerSec = 0

  constructor(
    private readonly id: string,
    private readonly onProgress: (progress: DownloadProgress) => void
  ) {}

  bytes(received: number, total: number): void {
    this.received = received
    this.total = total
    const now = Date.now()
    if (now - this.lastSent < PROGRESS_INTERVAL_MS) return
    if (this.lastSent) {
      this.bytesPerSec = ((received - this.lastBytes) * 1000) / (now - this.lastSent)
    }
    this.lastSent = now
    this.lastBytes = received
    this.state('downloading')
  }

  state(state: DownloadProgress['state'], error?: LocalAiErrorCode): void {
    const { received, total, bytesPerSec } = this
    this.onProgress({ id: this.id, received, total, bytesPerSec, state, error })
  }
}

/** Append the remainder of `file` to `part`, resuming from its current size */
async function fetchToFile(
  file: RemoteFile,
  part: string,
  signal: AbortSignal,
  digest: StreamingDigest,
  onBytes: (received: number) => void
): Promise<void> {
  let offset = (await fileSize(part)) ?? 0
  if (offset > 0 && offset === file.size) return
  const res = await net.fetch(file.url, {
    headers: offset ? { Range: `bytes=${offset}-` } : {},
    signal
  })
  if (!res.ok || !res.body) {
    // 416: the part file doesn't fit the remote file — drop it and start over
    if (res.status === 416) await rm(part, { force: true })
    const retryable = res.status === 416 || res.status === 429 || res.status >= 500
    throw new DownloadError('download-failed', retryable)
  }
  if (offset && res.status !== 206) {
    // The server ignored the range: start over
    offset = 0
    digest.reset()
  }

  const out = createWriteStream(part, { flags: offset ? 'a' : 'w' })
  let received = offset
  try {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      await write(out, value)
      digest.update(value)
      received += value.byteLength
      onBytes(received)
    }
  } catch (err) {
    if (signal.aborted) throw err
    throw new DownloadError('download-failed', true)
  } finally {
    out.end()
    await once(out, 'close')
  }
  if (file.size !== undefined && received < file.size) {
    throw new DownloadError('download-failed', true)
  }
}

async function write(out: WriteStream, chunk: Uint8Array): Promise<void> {
  if (!out.write(chunk)) await once(out, 'drain')
}

// ── Deleting ──────────────────────────────────────────────────────

export async function deleteModel(id: string): Promise<LocalAiResult<void>> {
  const model = getModel(id)
  if (!model) return { ok: false, code: 'model-not-downloaded' }
  // A cancelled download still closes (or renames) its files; let it finish first
  const running = downloads.get(id)
  running?.controller.abort()
  await running?.done
  try {
    await Promise.all(
      localPaths(model).flatMap((file) => [
        rm(file, { force: true }),
        rm(`${file}.part`, { force: true })
      ])
    )
  } catch {
    // Windows can't delete a file another process has open
    return { ok: false, code: 'model-in-use' }
  }
  return { ok: true, data: undefined }
}
