import { processWithGemini } from './gemini'
import { processWithTogether } from './together'
import { processWithOpenAI } from './openai'
import { processWithClaude } from './claude'
import { transcribeWithWhisper, transcribeWithOpenAIWhisper } from './whisper'
import { transcribeWithSoniox } from './soniox'

export type { LLMProvider, VoiceProvider } from '../constants/providers'
import type { LLMProvider, VoiceProvider } from '../constants/providers'

export interface AIRequest {
  prompt: string
  text: string
  systemInstruction?: string
  /** Override the global AI provider (used by per-trigger configs) */
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
}

/**
 * Route AI text processing to the configured provider
 */
export async function processText(request: AIRequest): Promise<AIResponse> {
  const config = await window.tapwisper.store.getAll() as any
  const provider: LLMProvider = request.providerOverride || config.aiProvider || 'gemini'
  const apiKey = config.apiKeys?.[provider] || ''
  const model = request.modelOverride || config.models?.[provider] || ''

  if (!apiKey) {
    throw new Error(`No API key configured for ${provider}. Please add your API key in Settings > AI Provider.`)
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

/** Per-request transcription hints passed to every voice provider */
export interface TranscriptionOptions {
  /** ISO-639-1 code; undefined lets the model auto-detect the spoken language */
  language?: string
  /** Vocabulary / context that biases recognition toward the user's terms */
  prompt?: string
}

/** Whisper only reads the last ~224 tokens of the prompt — keep it bounded */
const MAX_PROMPT_CHARS = 600

function buildVocabularyPrompt(vocabulary: unknown, triggers: unknown): string | undefined {
  const terms: string[] = []
  if (typeof vocabulary === 'string') {
    terms.push(
      ...vocabulary
        .split(/[\n,]+/)
        .map((t) => t.trim())
        .filter(Boolean)
    )
  }
  // Trigger phrases are exactly the words that must be recognised reliably
  if (Array.isArray(triggers)) {
    for (const t of triggers as Array<{ enabled?: boolean; triggerPhrase?: string }>) {
      if (t.enabled && t.triggerPhrase?.trim()) terms.push(t.triggerPhrase.trim())
    }
  }
  const unique = [...new Set(terms)]
  if (unique.length === 0) return undefined
  return unique.join(', ').slice(0, MAX_PROMPT_CHARS)
}

/**
 * Route transcription to the configured voice provider.
 *
 * The spoken language comes from the `speechLanguage` setting (default 'auto'),
 * NOT the UI language — forcing the UI language made Whisper mistranscribe or
 * translate anyone who speaks a different language than their interface.
 */
export async function transcribeAudio(
  audioBlob: Blob,
  languageOverride?: string
): Promise<TranscriptionResponse> {
  const config = (await window.tapwisper.store.getAll()) as Record<string, unknown> & {
    voiceProvider?: VoiceProvider
    apiKeys?: Record<string, string>
    voiceModels?: Partial<Record<VoiceProvider, string>>
    speechLanguage?: string
    speechVocabulary?: string
    triggers?: unknown
  }
  const provider: VoiceProvider = config.voiceProvider || 'whisper'

  const voiceApiKeyMap: Record<VoiceProvider, string> = {
    whisper: 'together',
    'openai-whisper': 'openai',
    soniox: 'soniox'
  }
  const apiKey = config.apiKeys?.[voiceApiKeyMap[provider]] || ''
  const voiceModel = config.voiceModels?.[provider]

  if (!apiKey) {
    throw new Error(`No API key configured for ${provider}. Please add your API key in Settings > AI Provider.`)
  }

  const speechLanguage = languageOverride || config.speechLanguage || 'auto'
  const options: TranscriptionOptions = {
    language: speechLanguage === 'auto' ? undefined : speechLanguage,
    prompt: buildVocabularyPrompt(config.speechVocabulary, config.triggers)
  }

  let response: TranscriptionResponse
  switch (provider) {
    case 'whisper':
      response = await transcribeWithWhisper(audioBlob, apiKey, options, voiceModel)
      break
    case 'openai-whisper':
      response = await transcribeWithOpenAIWhisper(audioBlob, apiKey, options, voiceModel)
      break
    case 'soniox':
      response = await transcribeWithSoniox(audioBlob, apiKey, options, voiceModel)
      break
    default:
      throw new Error(`Unknown voice provider: ${provider}`)
  }

  // On unclear audio Whisper can echo its prompt back verbatim — never paste that
  if (options.prompt && isPromptEcho(response.text, options.prompt)) {
    return { ...response, text: '' }
  }
  return response
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
  const terms = prompt.split(',').map(normalizeForCompare).filter(Boolean)
  for (let start = 0; start < terms.length; start++) {
    for (let end = start + 2; end <= terms.length; end++) {
      if (terms.slice(start, end).join(' ') === t) return true
    }
  }
  return false
}
