/**
 * What this computer can run: memory, disk, CPU/GPU and whether the bundled
 * inference servers start at all. The settings page uses it to recommend
 * models and to explain why the local engine is unavailable.
 */
import { app } from 'electron'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { access, constants, mkdir } from 'fs/promises'
import os from 'os'
import { bundledBinaryPath } from '../bundled-binary'
import { freeDiskBytes, modelsDir } from './model-store'
import type {
  DeviceProfile,
  GpuAcceleration,
  LocalModelKind,
  ModelsDirWarning,
  RuntimeCheck
} from '../../shared/local-ai/types'

/** Platforms the runtimes are built for (see scripts/build-runtimes.mjs) */
const SUPPORTED_TARGETS = new Set(['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64'])

const SERVER_NAMES: Record<LocalModelKind, string> = {
  stt: 'whisper-server',
  llm: 'llama-server'
}

export function runtimeBinary(kind: LocalModelKind): string {
  const exe = process.platform === 'win32' ? '.exe' : ''
  return bundledBinaryPath(kind === 'stt' ? 'whisper' : 'llama', SERVER_NAMES[kind] + exe)
}

/** Windows NTSTATUS exit codes worth telling apart */
const STATUS_DLL_NOT_FOUND = 0xc0000135
const STATUS_ILLEGAL_INSTRUCTION = 0xc000001d

const runtimeChecks = new Map<LocalModelKind, Promise<RuntimeCheck>>()

/** Whether a bundled server can start here. Cached for the session */
export function checkRuntime(kind: LocalModelKind): Promise<RuntimeCheck> {
  let check = runtimeChecks.get(kind)
  if (!check) {
    check = probeRuntime(kind)
    runtimeChecks.set(kind, check)
  }
  return check
}

function probeRuntime(kind: LocalModelKind): Promise<RuntimeCheck> {
  const target = `${process.platform}-${process.arch}`
  // x64 builds under Windows-on-ARM emulation lack the instructions ggml needs
  if (!SUPPORTED_TARGETS.has(target) || (process.platform === 'win32' && emulated())) {
    return Promise.resolve({ available: false, issue: 'unsupported-platform' })
  }
  const binary = runtimeBinary(kind)
  if (!existsSync(binary)) return Promise.resolve({ available: false, issue: 'not-bundled' })

  return new Promise((resolve) => {
    let output = ''
    const child = spawn(binary, ['--help'], { windowsHide: true, timeout: 5000 })
    child.stdout.on('data', (d: Buffer) => (output += d.toString()))
    child.stderr.on('data', (d: Buffer) => (output += d.toString()))
    child.once('error', (err: NodeJS.ErrnoException) =>
      resolve({ available: false, issue: err.code === 'ENOENT' ? 'not-bundled' : 'blocked' })
    )
    child.once('exit', (code, signal) => {
      if (code === 0 || /usage/i.test(output) || signal === 'SIGTERM') {
        // SIGTERM = our 5 s timeout: slow first run (antivirus scan), not a failure
        resolve({ available: true })
      } else if (
        code === STATUS_DLL_NOT_FOUND ||
        /library not loaded|cannot open shared/i.test(output)
      ) {
        resolve({ available: false, issue: 'missing-library' })
      } else if (signal === 'SIGKILL') {
        // macOS kills unsigned or quarantined binaries outright
        resolve({ available: false, issue: 'blocked' })
      } else {
        const illegal = signal === 'SIGILL' || code === STATUS_ILLEGAL_INSTRUCTION
        resolve({ available: false, issue: illegal ? 'crashed' : 'blocked' })
      }
    })
  })
}

function emulated(): boolean {
  return app.runningUnderARM64Translation === true
}

interface GpuInfo {
  name: string | null
  vendor: 'nvidia' | 'amd' | 'intel' | 'apple' | 'other' | null
}

let gpuInfo: Promise<GpuInfo> | null = null

/** Name and vendor of the active GPU, from Chromium's GPU info (read once) */
function detectGpu(): Promise<GpuInfo> {
  gpuInfo ??= app
    .getGPUInfo('complete')
    .then((info) => {
      const data = info as {
        auxAttributes?: { glRenderer?: string }
        gpuDevice?: Array<{ active?: boolean; vendorId?: number }>
      }
      const renderer = data.auxAttributes?.glRenderer ?? ''
      // "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 …)" → the model name
      const name =
        renderer.match(/^ANGLE \([^,]+, ([^(]+?)(?: \(0x|,| Direct3D|$)/)?.[1] ?? renderer
      const device = data.gpuDevice?.find((d) => d.active) ?? data.gpuDevice?.[0]
      const vendor =
        { 0x10de: 'nvidia', 0x1002: 'amd', 0x8086: 'intel', 0x106b: 'apple' }[
          device?.vendorId ?? 0
        ] ?? 'other'
      return { name: name.trim() || null, vendor } as GpuInfo
    })
    .catch(() => ({ name: null, vendor: null }))
  return gpuInfo
}

function accelerationFor(gpu: GpuInfo, appleSilicon: boolean): GpuAcceleration {
  if (process.platform === 'darwin') return appleSilicon && !emulated() ? 'metal' : 'cpu'
  // The Windows runtime ships a Vulkan backend. Integrated Intel graphics (except
  // Arc) are usually slower than the CPU for these models.
  if (process.platform === 'win32') {
    if (gpu.vendor === 'nvidia' || gpu.vendor === 'amd') return 'vulkan'
    if (gpu.vendor === 'intel' && /\bArc\b/i.test(gpu.name ?? '')) return 'vulkan'
  }
  return 'cpu'
}

async function modelsDirWarning(dir: string): Promise<ModelsDirWarning | undefined> {
  try {
    await mkdir(dir, { recursive: true })
    await access(dir, constants.W_OK)
  } catch {
    return 'not-writable'
  }
  // Older ggml builds fail to open files whose Windows path isn't plain ASCII
  if (process.platform === 'win32' && /[^\x20-\x7e]/.test(dir)) return 'non-ascii'
  return undefined
}

export async function getDeviceProfile(): Promise<DeviceProfile> {
  const cpus = os.cpus()
  const cpuModel = cpus[0]?.model.trim() ?? ''
  const appleSilicon =
    process.platform === 'darwin' && (process.arch === 'arm64' || /apple/i.test(cpuModel))
  const dir = modelsDir()
  const [gpu, freeBytes, warning, stt, llm] = await Promise.all([
    detectGpu(),
    freeDiskBytes(dir),
    modelsDirWarning(dir),
    checkRuntime('stt'),
    checkRuntime('llm')
  ])
  return {
    platform: process.platform,
    arch: process.arch,
    cpuModel,
    cpuCores: cpus.length,
    totalRamGB: Math.round(os.totalmem() / 1024 ** 3),
    freeDiskGB: freeBytes === null ? null : freeBytes / 1024 ** 3,
    appleSilicon,
    emulated: emulated(),
    gpuName: gpu.name,
    accel: accelerationFor(gpu, appleSilicon),
    runtimes: { stt, llm },
    modelsDir: dir,
    modelsDirWarning: warning
  }
}

/** Threads for inference: physical-ish cores, leaving room for the UI */
export function defaultThreads(): number {
  return Math.max(1, Math.min(8, Math.floor(os.cpus().length / 2)))
}
