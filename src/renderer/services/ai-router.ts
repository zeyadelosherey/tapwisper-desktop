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

/**
 * Route transcription to the configured voice provider
 */
export async function transcribeAudio(
  audioBlob: Blob,
  language?: string
): Promise<TranscriptionResponse> {
  const config = await window.tapwisper.store.getAll() as any
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

  switch (provider) {
    case 'whisper':
      return transcribeWithWhisper(audioBlob, apiKey, language, voiceModel)
    case 'openai-whisper':
      return transcribeWithOpenAIWhisper(audioBlob, apiKey, language, voiceModel)
    case 'soniox':
      return transcribeWithSoniox(audioBlob, apiKey, language)
    default:
      throw new Error(`Unknown voice provider: ${provider}`)
  }
}
