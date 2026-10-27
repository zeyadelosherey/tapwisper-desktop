/**
 * Contracts shared by the main process, preload and renderer for the local
 * (on-device) and self-hosted AI engines. Keep this file free of Node/DOM imports.
 */

/** Where speech-to-text or the language model runs */
export type AIEngine = 'cloud' | 'local' | 'self-hosted'

export type LocalModelKind = 'stt' | 'llm'

export interface LocalModelEntry {
  id: string
  kind: LocalModelKind
  /** Grouping chip in the UI: whisper, qwen, llama, gemma, phi, mistral */
  family: string
  label: string
  fileName: string
  url: string
  /** Approximate; the server's Content-Length wins at download time */
  sizeBytes: number
  /** Pinned SHA-256. Without it the Hugging Face LFS hash is used */
  sha256?: string
  /** Below this the model is likely to swap or fail to load */
  minRamGB: number
  /** Comfortable amount of RAM next to normal apps */
  recommendedRamGB: number
  /** 'multilingual' or the ISO-639-1 codes it understands */
  languages: 'multilingual' | string[]
  license: string
  licenseUrl: string
  learnMoreUrl: string
  /** 1 (fastest) – 5 (slowest), relative within its kind */
  speed: number
  /** 1 (lowest) – 5 (best), relative within its kind */
  quality: number
  /** Emits <think> blocks unless told not to (Qwen3) */
  thinking?: boolean
  /** Painful without a GPU */
  heavy?: boolean
}

export type GpuAcceleration = 'metal' | 'vulkan' | 'cpu'

/** Why a bundled runtime can't run on this device or build */
export type RuntimeIssue =
  | 'unsupported-platform'
  | 'not-bundled'
  | 'blocked'
  | 'missing-library'
  | 'crashed'

export interface RuntimeCheck {
  available: boolean
  issue?: RuntimeIssue
}

export type ModelsDirWarning = 'non-ascii' | 'not-writable'

export interface DeviceProfile {
  platform: string
  arch: string
  cpuModel: string
  cpuCores: number
  totalRamGB: number
  /** null when free space can't be read */
  freeDiskGB: number | null
  appleSilicon: boolean
  /** x64 build running under Rosetta 2 or Windows-on-ARM emulation */
  emulated: boolean
  gpuName: string | null
  accel: GpuAcceleration
  runtimes: Record<LocalModelKind, RuntimeCheck>
  modelsDir: string
  modelsDirWarning?: ModelsDirWarning
}

export type ModelRating =
  | 'recommended'
  | 'ok'
  | 'slow'
  | 'unsupported-language'
  | 'insufficient-ram'
  | 'insufficient-disk'

export type DownloadState = 'downloading' | 'verifying' | 'done' | 'error' | 'cancelled'

export interface DownloadProgress {
  id: string
  received: number
  total: number
  bytesPerSec: number
  state: DownloadState
  error?: LocalAiErrorCode
}

export type SidecarState = 'stopped' | 'starting' | 'ready' | 'busy' | 'failed'

export interface SidecarStatus {
  kind: LocalModelKind
  state: SidecarState
  modelId: string | null
  /** The GPU failed to load the model, so it runs on the CPU */
  cpuFallback?: boolean
  error?: LocalAiErrorCode
}

export interface LocalAiSettings {
  /** null = <userData>/models */
  modelsDir: string | null
  useGpu: boolean
  /** 0 = automatic */
  threads: number
  /** Unload a loaded model after this many idle minutes; 0 = never */
  idleUnloadMinutes: number
  /** Load the active models at startup so the first request is fast */
  keepWarm: boolean
}

/** API keys live with the other keys (safeStorage), not here */
export interface SelfHostedEndpoint {
  baseUrl: string
  model: string
}

export type SelfHostedSettings = Record<LocalModelKind, SelfHostedEndpoint>

/** One chat-style request, as every engine receives it */
export interface ChatInput {
  prompt: string
  text: string
  systemInstruction?: string
  /** Output token budget (default 2048) — raise for long outputs like meeting summaries */
  maxTokens?: number
  /** Sampling temperature (default 0.7); use low values for faithful rewriting */
  temperature?: number
}

export interface TranscribeInput {
  /** 16 kHz mono 16-bit WAV */
  wav: Uint8Array
  /** Audio length, used to size timeouts */
  seconds: number
  /** ISO-639-1; undefined = auto-detect */
  language?: string
  /** Vocabulary / context prompt */
  prompt?: string
}

/** Machine-readable failures, translated by the renderer (errors.local.*) */
export type LocalAiErrorCode =
  | 'no-model-selected'
  | 'model-not-downloaded'
  | 'runtime-unavailable'
  | 'server-failed'
  | 'timeout'
  | 'insufficient-disk'
  | 'download-failed'
  | 'checksum-mismatch'
  | 'model-in-use'
  | 'input-too-long'
  | 'not-configured'
  | 'unreachable'
  | 'unauthorized'
  | 'not-found'
  | 'tls'
  | 'bad-response'
  | 'invalid-url'

export type LocalAiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: LocalAiErrorCode; detail?: string }

export interface SelfHostedTestResult {
  models: string[]
}
