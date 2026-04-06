import type { TranscriptionResponse } from './ai-router'

const TOGETHER_API_BASE = 'https://api.together.xyz/v1'
const OPENAI_API_BASE = 'https://api.openai.com/v1'

const DEFAULT_TOGETHER_MODEL = 'openai/whisper-large-v3'
const DEFAULT_OPENAI_MODEL = 'whisper-1'

async function transcribeWithWhisperBase(
  audioBlob: Blob,
  apiKey: string,
  language: string | undefined,
  model: string,
  apiBase: string,
  providerLabel: string
): Promise<TranscriptionResponse> {
  const formData = new FormData()
  formData.append('file', audioBlob, 'recording.wav')
  formData.append('model', model)
  if (language) {
    formData.append('language', language)
  }

  const response = await fetch(`${apiBase}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`${providerLabel} transcription error: ${response.status} - ${error}`)
  }

  const data = await response.json()

  return {
    text: data.text?.trim() || '',
    provider: providerLabel,
    duration: data.duration
  }
}

export async function transcribeWithWhisper(
  audioBlob: Blob,
  apiKey: string,
  language?: string,
  model?: string
): Promise<TranscriptionResponse> {
  return transcribeWithWhisperBase(
    audioBlob,
    apiKey,
    language,
    model || DEFAULT_TOGETHER_MODEL,
    TOGETHER_API_BASE,
    'whisper'
  )
}

export async function transcribeWithOpenAIWhisper(
  audioBlob: Blob,
  apiKey: string,
  language?: string,
  model?: string
): Promise<TranscriptionResponse> {
  return transcribeWithWhisperBase(
    audioBlob,
    apiKey,
    language,
    model || DEFAULT_OPENAI_MODEL,
    OPENAI_API_BASE,
    'openai-whisper'
  )
}
