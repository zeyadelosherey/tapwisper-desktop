import { processWithGemini } from './gemini'
import { processWithTogether } from './together'
import { processWithOpenAI } from './openai'
import { processWithClaude } from './claude'
import { transcribeWithWhisper, transcribeWithOpenAIWhisper } from './whisper'
import { transcribeWithSoniox } from './soniox'
import { chatOnDevice, transcribeOnDevice } from './local-ai'

export type { LLMProvider, VoiceProvider } from '../constants/providers'
import type { AIEngine, LLMProvider, VoiceProvider } from '../constants/providers'
import { LOCAL_LLM_MAX_INPUT_CHARS } from '../../shared/local-ai/catalog'
import type { ChatInput } from '../../shared/local-ai/types'
import i18n from '../i18n'

export interface AIRequest extends ChatInput {
  /** Use this cloud provider instead of the configured engine (per-trigger configs) */
  providerOverride?: LLMProvider
  /** Override the global model (used by per-trigger configs) */
  modelOverride?: string
}

export interface AIResponse {
  result: string
  provider: string
  model: string
  tokensUsed?: number
}

export interface TranscriptionRequest {
  audioFilePath: string
  language?: string
}

export interface TranscriptionResponse {
  text: string
  provider: string
  duration?: number
  /** Spoken language (ISO-639-1) when known */
  language?: string
}

/**
 * Route AI text processing to the configured provider
 */
export async function processText(request: AIRequest): Promise<AIResponse> {
  const config = (await window.tapwisper.store.getAll()) as {
    llmEngine?: AIEngine
    aiProvider?: LLMProvider
    apiKeys?: Record<string, string>
    models?: Record<string, string>
    localModels?: { llm?: string | null }
    selfHosted?: { llm?: { model?: string } }
  }
  const engine = request.providerOverride ? 'cloud' : (config.llmEngine ?? 'cloud')
  if (engine !== 'cloud') {
    const result = await chatOnDevice(engine, request)
    const model =
      (engine === 'local' ? config.localModels?.llm : config.selfHosted?.llm?.model) || ''
    return { result: result.trim(), provider: engine, model }
  }

  const provider: LLMProvider = request.providerOverride || config.aiProvider || 'gemini'
  const apiKey = config.apiKeys?.[provider] || ''
  const model = request.modelOverride || config.models?.[provider] || ''

  if (!apiKey) {
    throw new Error(
      i18n.t(
        'errors.noApiKey',
        'No API key configured for {{provider}}. Please add your API key in Settings > AI Provider.',
        { provider }
      )
    )
  }

  switch (provider) {
    case 'gemini':
      return processWithGemini(request, apiKey, model)
    case 'together':
      return processWithTogether(request, apiKey, model)
    case 'openai':
      return processWithOpenAI(request, apiKey, model)
    case 'claude':
      return processWithClaude(request, apiKey, model)
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

/**
 * How much input text one request may carry. Local and self-hosted models have
 * small context windows, so long material (meeting transcripts) must be split.
 */
export async function getMaxInputChars(): Promise<number> {
  const engine = (await window.tapwisper.store.get('llmEngine')) as AIEngine | undefined
  return !engine || engine === 'cloud' ? CLOUD_MAX_INPUT_CHARS : LOCAL_LLM_MAX_INPUT_CHARS
}

/** Every supported cloud model takes far more; this bounds cost and latency */
const CLOUD_MAX_INPUT_CHARS = 120_000

/** Per-request transcription hints passed to every voice provider */
export interface TranscriptionOptions {
  /** ISO-639-1 code; undefined lets the model auto-detect the spoken language */
  language?: string
  /** All languages the user speaks (code-switching); providers that accept hints use these */
  languageHints?: string[]
  /** Vocabulary / context that biases recognition toward the user's terms */
  prompt?: string
}

/** Whisper only reads the last ~224 tokens of the prompt — keep it bounded */
const MAX_PROMPT_CHARS = 600

/**
 * Example sentences that show Whisper the user mixes a language with English.
 * Without them it tends to translate or transliterate the English words.
 */
const CODE_SWITCH_SAMPLES: Record<string, string> = {
  ar: 'تمام، هبعتلك الـ report على الـ Drive بعد الـ meeting.',
  hi: 'Theek hai, main report ko Drive pe upload kar dunga after the meeting.',
  ur: 'ٹھیک ہے، میں meeting کے بعد report بھیج دوں گا۔',
  fa: 'باشه، بعد از meeting فایل report رو می‌فرستم.',
  es: 'Vale, te mando el report por Drive después del meeting.',
  fr: "D'accord, je t'envoie le report sur le Drive après le meeting.",
  de: 'Okay, ich schicke dir den Report nach dem Meeting über Drive.',
  tr: 'Tamam, meeting sonrası report dosyasını Drive üzerinden atarım.'
}

function buildVocabularyPrompt(
  dictionary: unknown,
  triggers: unknown,
  languages: string[]
): string | undefined {
  const terms: string[] = []
  if (Array.isArray(dictionary)) {
    for (const e of dictionary as Array<{ term?: string }>) {
      if (e.term?.trim()) terms.push(e.term.trim())
    }
  }
  // Trigger phrases are exactly the words that must be recognised reliably
  if (Array.isArray(triggers)) {
    for (const t of triggers as Array<{ enabled?: boolean; triggerPhrase?: string }>) {
      if (t.enabled && t.triggerPhrase?.trim()) terms.push(t.triggerPhrase.trim())
    }
  }
  const parts: string[] = []
  const unique = [...new Set(terms)]
  if (unique.length) parts.push(unique.join(', '))

  // Code-switching with English: prime with a mixed sentence in the other language
  if (languages.length > 1 && languages.includes('en')) {
    const other = languages.find((l) => l !== 'en' && CODE_SWITCH_SAMPLES[l])
    if (other) parts.push(CODE_SWITCH_SAMPLES[other])
  }
  if (parts.length === 0) return undefined
  // Whisper weights the END of the prompt most — keep the sample sentence last
  const prompt = parts.join('. ')
  return prompt.length > MAX_PROMPT_CHARS ? prompt.slice(-MAX_PROMPT_CHARS) : prompt
}

/**
 * Route transcription to the configured voice provider.
 *
 * Spoken languages come from the `speechLanguages` setting (empty = auto-detect),
 * NOT the UI language — forcing the UI language made Whisper mistranscribe or
 * translate anyone who speaks a different language than their interface.
 * With several languages (code-switching) the model auto-detects, primed by
 * an example sentence and, for Soniox, explicit language hints.
 */
export async function transcribeAudio(
  audioBlob: Blob,
  languageOverride?: string
): Promise<TranscriptionResponse> {
  const config = (await window.tapwisper.store.getAll()) as CloudVoiceConfig & {
    speechEngine?: AIEngine
    speechLanguages?: string[]
    dictionary?: unknown
    triggers?: unknown
  }

  const languages = languageOverride
    ? [languageOverride]
    : (config.speechLanguages ?? []).filter((l) => typeof l === 'string' && l)
  const options: TranscriptionOptions = {
    language: languages.length === 1 ? languages[0] : undefined,
    languageHints: languages.length ? languages : undefined,
    prompt: buildVocabularyPrompt(config.dictionary, config.triggers, languages)
  }

  const engine = config.speechEngine ?? 'cloud'
  const response =
    engine === 'cloud'
      ? await transcribeWithCloud(audioBlob, options, config)
      : {
          text: await transcribeOnDevice(engine, audioBlob, {
            language: options.language,
            prompt: options.prompt
          }),
          provider: engine
        }

  // On unclear audio Whisper can echo its prompt back verbatim — never paste that
  if (options.prompt && isPromptEcho(response.text, options.prompt)) {
    return { ...response, text: '' }
  }
  return { ...response, language: response.language ?? options.language }
}

interface CloudVoiceConfig {
  voiceProvider?: VoiceProvider
  apiKeys?: Record<string, string>
  voiceModels?: Partial<Record<VoiceProvider, string>>
}

async function transcribeWithCloud(
  audioBlob: Blob,
  options: TranscriptionOptions,
  config: CloudVoiceConfig
): Promise<TranscriptionResponse> {
  const provider: VoiceProvider = config.voiceProvider || 'whisper'

  const voiceApiKeyMap: Record<VoiceProvider, string> = {
    whisper: 'together',
    'openai-whisper': 'openai',
    soniox: 'soniox'
  }
  const apiKey = config.apiKeys?.[voiceApiKeyMap[provider]] || ''
  const voiceModel = config.voiceModels?.[provider]

  if (!apiKey) {
    throw new Error(
      i18n.t(
        'errors.noApiKey',
        'No API key configured for {{provider}}. Please add your API key in Settings > AI Provider.',
        { provider }
      )
    )
  }

  switch (provider) {
    case 'whisper':
      return transcribeWithWhisper(audioBlob, apiKey, options, voiceModel)
    case 'openai-whisper':
      return transcribeWithOpenAIWhisper(audioBlob, apiKey, options, voiceModel)
    case 'soniox':
      return transcribeWithSoniox(audioBlob, apiKey, options, voiceModel)
    default:
      throw new Error(`Unknown voice provider: ${provider}`)
  }
}

function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * True if the output is just consecutive vocabulary terms (2+), i.e. the prompt
 * echoed back. A single term is allowed — the user may really have said it.
 */
export function isPromptEcho(text: string, prompt: string): boolean {
  const t = normalizeForCompare(text)
  if (!t) return false
  // The code-switch sample is one long sentence — echoing it alone is also an echo
  for (const sentence of prompt.split('. ')) {
    const n = normalizeForCompare(sentence)
    if (n.split(' ').length >= 4 && n === t) return true
  }
  const terms = prompt
    .split(/[,.]\s/)
    .map(normalizeForCompare)
    .filter(Boolean)
  for (let start = 0; start < terms.length; start++) {
    for (let end = start + 2; end <= terms.length; end++) {
      if (terms.slice(start, end).join(' ') === t) return true
    }
  }
  return false
}
