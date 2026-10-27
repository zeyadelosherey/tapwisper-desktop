/**
 * Downloaded model files: where they live, downloading (resumable, verified)
 * and deleting. Models are plain data files, so they need no code signing.
 */
import { app, net } from 'electron'
import { createHash } from 'crypto'
import { createReadStream, createWriteStream, type WriteStream } from 'fs'
import { mkdir, rename, rm, stat, statfs } from 'fs/promises'
import { once } from 'events'
import path from 'path'
import { getConfigValue } from '../store'
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

export function modelPath(model: LocalModelEntry): string {
  return path.join(modelsDir(), model.kind, model.fileName)
}

async function fileSize(file: string): Promise<number | null> {
  try {
    return (await stat(file)).size
  } catch {
    return null
  }
}

export async function isInstalled(model: LocalModelEntry): Promise<boolean> {
  return (await fileSize(modelPath(model))) !== null
}

/** Ids of the catalog models present on disk; also clears out stale partial files */
export async function listInstalled(): Promise<string[]> {
  const installed: string[] = []
  for (const model of MODEL_CATALOG) {
    if (await isInstalled(model)) installed.push(model.id)
    const part = `${modelPath(model)}.part`
    const partStat = await stat(part).catch(() => null)
    if (partStat && Date.now() - partStat.mtimeMs > STALE_PART_MS && !downloads.has(model.id)) {
      await rm(part, { force: true })
    }
  }
  return installed
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

class DownloadError extends Error {
  constructor(
    readonly code: LocalAiErrorCode,
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

export function isDownloading(id: string): boolean {
  return downloads.has(id)
}

/** Download a catalog model. Calling it again for the same id joins the running download */
export function downloadModel(
  id: string,
  onProgress: (progress: DownloadProgress) => void
): Promise<LocalAiResult<void>> {
  const running = downloads.get(id)
  if (running) return running.done
  const model = getModel(id)
  if (!model)
    return Promise.resolve({ ok: false, code: 'download-failed', detail: 'unknown model' })

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
  const target = modelPath(model)
  const part = `${target}.part`
  const report = new ProgressReporter(model, onProgress)
  try {
    if (await isInstalled(model)) return { ok: true, data: undefined }
    await mkdir(path.dirname(target), { recursive: true })

    const existing = (await fileSize(part)) ?? 0
    const free = await freeDiskBytes(path.dirname(target))
    if (free !== null && free < model.sizeBytes - existing + DISK_HEADROOM_BYTES) {
      throw new DownloadError('insufficient-disk')
    }

    const expectedSha = model.sha256 ?? (await huggingFaceSha256(model.url))
    for (let attempt = 1; ; attempt++) {
      try {
        await fetchToFile(model.url, part, signal, report)
        break
      } catch (err) {
        const retryable = !signal.aborted && (!(err instanceof DownloadError) || err.retryable)
        if (!retryable || attempt >= MAX_ATTEMPTS) throw err
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
      }
    }

    report.state('verifying')
    if (expectedSha && (await sha256File(part)) !== expectedSha) {
      await rm(part, { force: true })
      throw new DownloadError('checksum-mismatch')
    }
    await rename(part, target)
    report.state('done')
    return { ok: true, data: undefined }
  } catch (err) {
    if (signal.aborted) {
      report.state('cancelled')
      return { ok: false, code: 'download-failed', detail: 'cancelled' }
    }
    const code = err instanceof DownloadError ? err.code : 'download-failed'
    report.state('error', code)
    return { ok: false, code, detail: (err as Error).message }
  }
}

/** Throttled progress events with a running download speed */
class ProgressReporter {
  private received = 0
  private total: number
  private lastSent = 0
  private lastBytes = 0
  private bytesPerSec = 0

  constructor(
    private readonly model: LocalModelEntry,
    private readonly onProgress: (progress: DownloadProgress) => void
  ) {
    this.total = model.sizeBytes
  }

  bytes(received: number, total: number): void {
    this.received = received
    this.total = total || this.total
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
    this.onProgress({ id: this.model.id, received, total, bytesPerSec, state, error })
  }
}

/** Append the remainder of `url` to `part`, resuming from its current size */
async function fetchToFile(
  url: string,
  part: string,
  signal: AbortSignal,
  report: ProgressReporter
): Promise<void> {
  let offset = (await fileSize(part)) ?? 0
  const res = await net.fetch(url, {
    headers: offset ? { Range: `bytes=${offset}-` } : {},
    signal
  })
  if (res.status === 416) return // Already complete
  if (!res.ok || !res.body) {
    throw new DownloadError('download-failed', res.status === 429 || res.status >= 500)
  }
  if (res.status !== 206) offset = 0 // Server ignored the range: start over

  const length = Number(res.headers.get('content-length')) || 0
  const total = length ? offset + length : 0
  const out = createWriteStream(part, { flags: offset ? 'a' : 'w' })
  let received = offset
  try {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      await write(out, value)
      report.bytes(received, total)
    }
  } catch (err) {
    if (signal.aborted) throw err
    throw new DownloadError('download-failed', true)
  } finally {
    out.end()
    await once(out, 'close')
  }
  if (total && received < total) throw new DownloadError('download-failed', true)
}

async function write(out: WriteStream, chunk: Uint8Array): Promise<void> {
  if (!out.write(chunk)) await once(out, 'drain')
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

/** Hugging Face sends the SHA-256 of LFS files in X-Linked-Etag on its redirect */
export function parseLinkedEtag(value: string | string[] | undefined): string | undefined {
  const raw = (Array.isArray(value) ? value[0] : value)?.replace(/^W\//, '').replace(/"/g, '')
  return raw && /^[a-f0-9]{64}$/i.test(raw) ? raw.toLowerCase() : undefined
}

/** The expected hash of a Hugging Face file, or undefined when the server doesn't say */
function huggingFaceSha256(url: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const request = net.request({ method: 'HEAD', url, redirect: 'manual' })
    const timer = setTimeout(() => finish(undefined), 10_000)
    function finish(sha: string | undefined): void {
      clearTimeout(timer)
      request.abort()
      resolve(sha)
    }
    request.on('redirect', (_status, _method, _url, headers) =>
      finish(parseLinkedEtag(headers['x-linked-etag']))
    )
    request.on('response', (res) => finish(parseLinkedEtag(res.headers['x-linked-etag'])))
    request.on('error', () => finish(undefined))
    request.end()
  })
}

// ── Deleting ──────────────────────────────────────────────────────

export async function deleteModel(id: string): Promise<LocalAiResult<void>> {
  const model = getModel(id)
  if (!model) return { ok: false, code: 'model-not-downloaded' }
  cancelDownload(id)
  await rm(modelPath(model), { force: true })
  await rm(`${modelPath(model)}.part`, { force: true })
  return { ok: true, data: undefined }
}
