/**
 * Open-source models the local engine can download, and the pure helpers that
 * match them to the user's device. Shared by the main process and the renderer.
 *
 * The data lives in models.json; CI resolves every entry on Hugging Face
 * (src/main/local-ai/__tests__/catalog.online.test.ts).
 */
import catalogData from './models.json'
import type {
  ChatInput,
  DeviceProfile,
  LocalAiSettings,
  LocalModelEntry,
  LocalModelKind,
  LocalRuntime,
  ModelRating,
  RuntimeCheck,
  SelfHostedSettings
} from './types'

/** Catalog entries may leave out what their family (or kind) already says */
type CatalogEntry = Omit<LocalModelEntry, 'kind' | 'runtime' | 'languages'> &
  Partial<Pick<LocalModelEntry, 'runtime' | 'languages'>>

const familyDefaults = catalogData.familyDefaults as Record<string, Partial<LocalModelEntry>>

function withDefaults(entries: unknown[], kind: LocalModelKind): LocalModelEntry[] {
  return (entries as CatalogEntry[]).map((entry) => ({
    runtime: 'llama',
    languages: 'multilingual',
    ...familyDefaults[entry.family],
    ...entry,
    kind
  }))
}

export const MODEL_CATALOG: LocalModelEntry[] = [
  ...withDefaults(catalogData.stt, 'stt'),
  ...withDefaults(catalogData.llm, 'llm')
]

/** Display names of the model families (brand names, not translated) */
export const FAMILY_LABELS: Record<string, string> = {
  whisper: 'Whisper',
  parakeet: 'NVIDIA Parakeet',
  'qwen-asr': 'Qwen3-ASR',
  voxtral: 'Voxtral',
  qwen: 'Qwen',
  gemma: 'Gemma',
  llama: 'Llama',
  phi: 'Phi',
  mistral: 'Mistral',
  liquid: 'Liquid AI',
  smollm: 'SmolLM',
  granite: 'Granite',
  nvidia: 'NVIDIA',
  openai: 'OpenAI'
}

export const DEFAULT_LOCAL_AI_SETTINGS: LocalAiSettings = {
  modelsDir: null,
  useGpu: true,
  threads: 0,
  idleUnloadMinutes: 10,
  keepWarm: false
}

/** Where the self-hosted servers' optional keys live in the encrypted apiKeys */
export const SELF_HOSTED_KEY_IDS: Record<LocalModelKind, 'selfHostedStt' | 'selfHostedLlm'> = {
  stt: 'selfHostedStt',
  llm: 'selfHostedLlm'
}

export const DEFAULT_SELF_HOSTED: SelfHostedSettings = {
  stt: { baseUrl: '', model: '' },
  llm: { baseUrl: '', model: '' }
}

/** Free disk we keep on top of the model itself */
export const DISK_HEADROOM_BYTES = 500 * 1024 ** 2

/** Context window the local llama-server is started with */
export const LOCAL_LLM_CONTEXT_TOKENS = 8192

/** Longest answer requested from a local or self-hosted model (room kept in the context) */
export const LOCAL_LLM_MAX_OUTPUT_TOKENS = 2048

/**
 * Characters of input a local or self-hosted model can take in one request:
 * the context minus room for the answer and the prompt, at ~3 chars per token.
 * Chinese or Japanese text can take a token per character; the server's
 * context error is then reported as input-too-long as well.
 */
export const LOCAL_LLM_MAX_INPUT_CHARS =
  (LOCAL_LLM_CONTEXT_TOKENS - LOCAL_LLM_MAX_OUTPUT_TOKENS - 512) * 3

const GB = 1024 ** 3

export function getModel(id: string | null | undefined): LocalModelEntry | undefined {
  return id ? MODEL_CATALOG.find((m) => m.id === id) : undefined
}

/** 'en-US' → 'en' */
function baseLanguage(language: string): string {
  return language.toLowerCase().split(/[-_]/)[0]
}

/**
 * Whether a model understands every language the user dictates in. With
 * auto-detect ([]) a model needs to know more than one language.
 */
export function supportsLanguages(model: LocalModelEntry, languages: string[]): boolean {
  if (model.languages === 'multilingual') return true
  const supported = model.languages
  if (languages.length === 0) return supported.length > 1
  return languages.every((l) => supported.includes(baseLanguage(l)))
}

function hasFastAccel(profile: DeviceProfile): boolean {
  return profile.accel !== 'cpu' && !profile.emulated
}

/** The bundled programs that run each kind of model */
const KIND_RUNTIMES: Record<LocalModelKind, LocalRuntime[]> = {
  stt: ['whisper', 'parakeet', 'llama'],
  llm: ['llama']
}

/** Whether the local engine can run models of `kind`: one working runtime is enough */
export function localEngineCheck(kind: LocalModelKind, profile: DeviceProfile): RuntimeCheck {
  const checks = KIND_RUNTIMES[kind].map((runtime) => profile.runtimes[runtime])
  return checks.find((check) => check.available) ?? checks[0]
}

/**
 * Best default for this device. Speech models are always multilingual so
 * changing the dictation language never silently breaks recognition.
 */
export function recommendedModelId(kind: LocalModelKind, profile: DeviceProfile): string | null {
  const ram = profile.totalRamGB
  if (kind === 'stt') {
    if (hasFastAccel(profile) && ram >= 8) return 'whisper-large-v3-turbo-q5'
    // Quantized models: nearly the same accuracy, faster on a CPU
    if (ram >= 8 && !profile.emulated) return 'whisper-small-q5'
    return 'whisper-base-q5'
  }
  if (hasFastAccel(profile) && ram >= 16) return 'qwen3.5-4b'
  if (ram >= 8) return 'qwen3.5-2b'
  if (ram >= 4) return 'qwen3.5-0.8b'
  return null
}

/** How well a model fits this device: hard blockers first, then performance hints */
export function rateModel(
  model: LocalModelEntry,
  profile: DeviceProfile,
  languages: string[],
  installed: boolean
): ModelRating {
  if (!profile.runtimes[model.runtime].available) return 'runtime-unavailable'
  if (!supportsLanguages(model, languages)) return 'unsupported-language'
  if (profile.totalRamGB < model.minRamGB) return 'insufficient-ram'
  if (
    !installed &&
    profile.freeDiskGB !== null &&
    profile.freeDiskGB * GB < model.sizeBytes + DISK_HEADROOM_BYTES
  ) {
    return 'insufficient-disk'
  }
  if (model.id === recommendedModelId(model.kind, profile)) return 'recommended'
  const bigLlm = model.kind === 'llm' && model.sizeBytes > 3 * GB
  if (!hasFastAccel(profile) && (model.heavy || bigLlm || model.speed >= 4)) return 'slow'
  if (profile.totalRamGB < model.recommendedRamGB) return 'slow'
  return 'ok'
}

/**
 * Remove reasoning blocks some models emit even when asked not to: complete
 * ones, one whose opening tag is in the template, and one cut off by the token limit
 */
export function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^[\s\S]*?<\/think>/i, '')
    .replace(/<think>[\s\S]*$/i, '')
    .trim()
}

/** OpenAI-style messages, built the same way for every chat engine */
export function toChatMessages(input: ChatInput): Array<{ role: string; content: string }> {
  return [
    ...(input.systemInstruction ? [{ role: 'system', content: input.systemInstruction }] : []),
    { role: 'user', content: `${input.prompt}\n\nText: ${input.text}` }
  ]
}

/**
 * Normalise a user-typed server address to `scheme://host[:port][/path]` without
 * a trailing slash or `/v1`. Returns null for anything that isn't http(s).
 */
export function normalizeBaseUrl(input: string): string | null {
  let value = input.trim()
  if (!value) return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `http://${value}`
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const path = url.pathname.replace(/\/+$/, '').replace(/\/v1$/i, '')
  return `${url.protocol}//${url.host}${path}`
}

/** Loopback, private ranges (RFC 1918, CGNAT/Tailscale, link-local) and mDNS names */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.lan')) return true
  if (host.includes(':')) {
    return host === '::1' || /^f[cd]/.test(host) || host.startsWith('fe80')
  }
  const m = host.match(/^(\d+)\.(\d+)\.\d+\.\d+$/)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

/** A bearer token would travel unencrypted over the public internet */
export function isInsecureKeyUse(baseUrl: string, apiKey: string): boolean {
  const normalized = apiKey ? normalizeBaseUrl(baseUrl) : null
  if (!normalized) return false
  const url = new URL(normalized)
  return url.protocol === 'http:' && !isPrivateHost(url.hostname)
}
