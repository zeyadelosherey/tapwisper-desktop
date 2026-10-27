/**
 * A local inference server (whisper-server / llama-server) run as a child
 * process. It listens on a random 127.0.0.1 port — never the LAN, which also
 * avoids firewall prompts — and is started on first use, stopped after a
 * period of inactivity and restarted when its launch settings change.
 */
import { execFile, spawn, type ChildProcess } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { createServer } from 'net'
import path from 'path'
import { LocalAiError, SidecarStartError } from './errors'
import { SerialQueue } from './serial-queue'
import type { LocalModelKind, SidecarState, SidecarStatus } from '../../shared/local-ai/types'

export interface SidecarLaunch {
  binary: string
  /** Command-line arguments for a server on 127.0.0.1:`port` */
  args: (port: number) => string[]
  modelId: string
  /** How long loading the model may take before giving up */
  loadTimeoutMs: number
  /** Stop the server after this long without requests; 0 = keep running */
  idleUnloadMs: number
  /** Running on the CPU because the GPU failed (shown in the UI) */
  cpuFallback?: boolean
}

/** What a runtime needs to build its launch arguments */
export interface RuntimeOptions {
  binary: string
  modelFile: string
  /** Multimodal projector (audio models on llama-server) */
  mmprojFile?: string | null
  modelId: string
  modelBytes: number
  useGpu: boolean
  threads: number
  idleUnloadMs: number
}

/** Loading reads the whole file; allow for slow disks */
export function loadTimeoutMs(modelBytes: number): number {
  return 30_000 + Math.ceil(modelBytes / 1024 ** 3) * 20_000
}

/** This many crashes within the window marks the server as failed */
const MAX_CRASHES = 3
const CRASH_WINDOW_MS = 5 * 60_000
const STOP_GRACE_MS = 2000
const HEALTH_POLL_MS = 250

export class SidecarServer {
  private child: ChildProcess | null = null
  private baseUrl = ''
  private launchKey = ''
  /** Everything that starts or stops the process goes through here, so they never overlap */
  private readonly queue = new SerialQueue()
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private crashes: number[] = []
  private stderrTail = ''
  private readonly stopping = new WeakSet<ChildProcess>()
  private status: SidecarStatus

  constructor(
    readonly kind: LocalModelKind,
    private readonly onStatus: (status: SidecarStatus) => void,
    private readonly onPid: (
      kind: LocalModelKind,
      pid: number | null,
      binary?: string
    ) => void = () => {}
  ) {
    this.status = { kind, state: 'stopped', modelId: null }
  }

  getStatus(): SidecarStatus {
    return this.status
  }

  /** Run `task` against a ready server. Requests are served one at a time. */
  run<T>(launch: SidecarLaunch, task: (baseUrl: string) => Promise<T>): Promise<T> {
    return this.queue.add(async () => {
      const baseUrl = await this.ensure(launch)
      this.clearIdleTimer()
      this.setState('busy')
      try {
        return await task(baseUrl)
      } finally {
        if (this.child) {
          this.setState('ready')
          this.armIdleTimer(launch.idleUnloadMs)
        }
      }
    })
  }

  /** Start the server and load the model without running a request */
  load(launch: SidecarLaunch): Promise<void> {
    return this.queue.add(async () => {
      await this.ensure(launch)
      this.armIdleTimer(launch.idleUnloadMs)
    })
  }

  /** Stop the server once the requests ahead of this have finished */
  stop(): Promise<void> {
    return this.queue.add(() => this.terminate())
  }

  /** Stop now, without waiting for queued requests (app quit) */
  shutdown(): Promise<void> {
    return this.terminate()
  }

  /** Forget earlier crashes so the next request tries again (the UI's Retry) */
  reset(): void {
    this.crashes = []
    if (this.status.state === 'failed') this.setState('stopped', { error: undefined })
  }

  private async terminate(): Promise<void> {
    this.clearIdleTimer()
    const child = this.child
    if (!child) return
    this.child = null
    this.stopping.add(child)
    const exited = new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) resolve()
      else child.once('exit', () => resolve())
    })
    child.kill()
    const timer = setTimeout(() => child.kill('SIGKILL'), STOP_GRACE_MS)
    await exited
    clearTimeout(timer)
    this.setState('stopped', { modelId: null })
  }

  private async ensure(launch: SidecarLaunch): Promise<string> {
    const key = [launch.binary, ...launch.args(0), launch.modelId].join('\0')
    if (this.child && this.launchKey === key) return this.baseUrl
    await this.terminate()
    this.crashes = this.crashes.filter((t) => Date.now() - t < CRASH_WINDOW_MS)
    if (this.crashes.length >= MAX_CRASHES) {
      // Not a start attempt, so callers don't mistake it for a GPU failure
      throw new LocalAiError('server-failed', this.stderrTail)
    }
    return this.start(launch, key)
  }

  private async start(launch: SidecarLaunch, key: string): Promise<string> {
    const port = await freePort()
    this.setState('starting', {
      modelId: launch.modelId,
      cpuFallback: launch.cpuFallback,
      error: undefined
    })
    this.stderrTail = ''

    let child: ChildProcess
    try {
      child = spawn(launch.binary, launch.args(port), {
        cwd: path.dirname(launch.binary),
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe']
      })
    } catch (err) {
      // Invalid arguments throw here; a missing binary is reported through 'error' below
      this.setState('stopped', { error: 'server-failed' })
      throw new SidecarStartError('server-failed', (err as Error).message)
    }
    this.child = child
    this.launchKey = key
    this.baseUrl = `http://127.0.0.1:${port}`
    if (child.pid) this.onPid(this.kind, child.pid, launch.binary)

    child.stderr?.on('data', (chunk: Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString()).slice(-4000)
    })
    const ended = new Promise<never>((_, reject) => {
      child.once('error', (err) => reject(new LocalAiError('server-failed', err.message)))
      child.once('exit', (code, signal) =>
        reject(new LocalAiError('server-failed', `exited (${signal ?? exitCodeText(code)})`))
      )
    })
    ended.catch(() => undefined)
    child.once('exit', () => this.onExit(child))

    try {
      await Promise.race([waitForHealth(this.baseUrl, launch.loadTimeoutMs), ended])
    } catch (err) {
      this.crashes.push(Date.now())
      await this.terminate()
      const code = err instanceof LocalAiError ? err.code : 'server-failed'
      this.setState(this.crashes.length >= MAX_CRASHES ? 'failed' : 'stopped', { error: code })
      // The exit code tells a crash (e.g. 0xC0000005 on Windows) from a reported error
      const detail = [this.stderrTail.trim(), (err as Error).message].filter(Boolean).join('\n')
      throw new SidecarStartError(code, detail)
    }
    this.setState('ready')
    return this.baseUrl
  }

  private onExit(child: ChildProcess): void {
    this.onPid(this.kind, null)
    if (this.stopping.has(child) || child !== this.child) return
    this.child = null
    this.clearIdleTimer()
    // A failed start is reported by start() itself
    if (this.status.state === 'starting') return
    // Unexpected exit (crash, killed by the user or the OS); the next request restarts it
    this.crashes.push(Date.now())
    const failed = this.crashes.filter((t) => Date.now() - t < CRASH_WINDOW_MS).length
    this.setState(failed >= MAX_CRASHES ? 'failed' : 'stopped', { error: 'server-failed' })
  }

  private armIdleTimer(ms: number): void {
    this.clearIdleTimer()
    if (ms > 0) this.idleTimer = setTimeout(() => void this.stop(), ms)
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
  }

  private setState(state: SidecarState, patch: Partial<SidecarStatus> = {}): void {
    this.status = { ...this.status, ...patch, state }
    this.onStatus(this.status)
  }
}

/** Windows crash codes are NTSTATUS values, readable in hex (0xC0000005) */
function exitCodeText(code: number | null): string {
  return code !== null && code > 0xffff ? `0x${code.toString(16).toUpperCase()}` : String(code)
}

/** Ask the OS for an unused port on the loopback interface */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('no port'))
      )
    })
  })
}

/**
 * Poll until the server answers. llama-server returns 503 while loading and
 * 200 when ready; whisper-server only starts listening once its model is
 * loaded and may not have a /health route, so any non-503 answer counts.
 */
async function waitForHealth(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) })
      if (res.status !== 503) return
    } catch {
      // Not listening yet
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS))
  }
  throw new LocalAiError('timeout', 'model load timed out')
}

// ── Orphan cleanup ────────────────────────────────────────────────
// If the app is killed, its servers keep running and holding RAM. Their PIDs
// are recorded so the next launch can stop them.

type PidRecord = Partial<Record<LocalModelKind, { pid: number; binary: string }>>

export class PidFile {
  private record: PidRecord = {}

  constructor(private readonly file: string) {}

  set(kind: LocalModelKind, pid: number | null, binary?: string): void {
    if (pid && binary) this.record[kind] = { pid, binary: path.basename(binary) }
    else delete this.record[kind]
    this.write()
  }

  /** Stop servers left behind by a previous run, checking the executable name first */
  async killOrphans(): Promise<void> {
    let previous: PidRecord
    try {
      previous = JSON.parse(readFileSync(this.file, 'utf8')) as PidRecord
    } catch {
      return
    }
    for (const entry of Object.values(previous)) {
      if (!entry?.pid) continue
      const name = await processName(entry.pid)
      if (name && name.includes(entry.binary.replace(/\.exe$/i, ''))) {
        try {
          process.kill(entry.pid)
        } catch {
          // Already gone
        }
      }
    }
    this.write()
  }

  private write(): void {
    try {
      writeFileSync(this.file, JSON.stringify(this.record))
    } catch {
      // Best effort — at worst an orphan survives until reboot
    }
  }
}

/** Executable name of a running process, or null if it isn't running */
function processName(pid: number): Promise<string | null> {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']]
      : ['ps', ['-p', String(pid), '-o', 'comm=']]
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 3000, windowsHide: true }, (err, stdout) => {
      const out = stdout?.trim() ?? ''
      resolve(err || !out || out.startsWith('INFO:') ? null : out)
    })
  })
}
