/**
 * Open-source models the local engine can download, and the pure helpers that
 * match them to the user's device. Shared by the main process and the renderer.
 *
 * The data lives in models.json so CI can check every URL without a
 * TypeScript toolchain (scripts/check-model-urls.mjs).
 */
import catalogData from './models.json'
import type {
  ChatInput,
  DeviceProfile,
  LocalAiSettings,
  LocalModelEntry,
  LocalModelKind,
  ModelRating,
  SelfHostedSettings
} from './types'

type CatalogEntry = Omit<LocalModelEntry, 'kind' | 'license' | 'licenseUrl' | 'learnMoreUrl'> &
  Partial<Pick<LocalModelEntry, 'license' | 'licenseUrl' | 'learnMoreUrl'>>

/** Every whisper.cpp model shares these */
const WHISPER_INFO = {
  license: 'MIT',
  licenseUrl: 'https://github.com/openai/whisper/blob/main/LICENSE',
  learnMoreUrl: 'https://huggingface.co/ggerganov/whisper.cpp'
}

export const MODEL_CATALOG: LocalModelEntry[] = [
  ...(catalogData.stt as CatalogEntry[]).map((e) => ({
    ...WHISPER_INFO,
    ...e,
    kind: 'stt' as const
  })),
  ...(catalogData.llm as CatalogEntry[]).map((e) => ({ ...e, kind: 'llm' as const }))
] as LocalModelEntry[]

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
 * the context minus room for the answer and the prompt, at ~3 chars per token
 * (conservative for non-English text).
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

/** Whether a model understands every language the user dictates in ([] = any) */
export function supportsLanguages(model: LocalModelEntry, languages: string[]): boolean {
  if (model.languages === 'multilingual') return true
  const supported = model.languages
  return languages.length > 0 && languages.every((l) => supported.includes(baseLanguage(l)))
}

function hasFastAccel(profile: DeviceProfile): boolean {
  return profile.accel !== 'cpu' && !profile.emulated
}

/**
 * Best default for this device. Speech models are always multilingual so
 * changing the dictation language never silently breaks recognition.
 */
export function recommendedModelId(kind: LocalModelKind, profile: DeviceProfile): string | null {
  const ram = profile.totalRamGB
  if (kind === 'stt') {
    if (hasFastAccel(profile) && ram >= 8) return 'whisper-large-v3-turbo-q5'
    if (ram >= 8 && !profile.emulated) return 'whisper-small'
    return 'whisper-base'
  }
  if (hasFastAccel(profile) && ram >= 16) return 'qwen3-4b'
  if (ram >= 8) return 'qwen3-1.7b'
  if (ram >= 4) return 'qwen3-0.6b'
  return null
}

/** How well a model fits this device: hard blockers first, then performance hints */
export function rateModel(
  model: LocalModelEntry,
  profile: DeviceProfile,
  languages: string[],
  installed: boolean
): ModelRating {
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

/** Remove reasoning blocks some models emit even when asked not to */
export function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^[\s\S]*?<\/think>/i, '')
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
