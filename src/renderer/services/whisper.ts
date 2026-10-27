import type { TranscriptionResponse, TranscriptionOptions } from './ai-router'

const TOGETHER_API_BASE = 'https://api.together.xyz/v1'
const OPENAI_API_BASE = 'https://api.openai.com/v1'

const DEFAULT_TOGETHER_MODEL = 'openai/whisper-large-v3'
const DEFAULT_OPENAI_MODEL = 'whisper-1'

/**
 * File name with an extension matching the blob's real container. OpenAI picks
 * the decoder from the extension, so labelling WebM/Opus as .wav breaks decoding.
 */
export function audioFileName(blob: Blob): string {
  const type = blob.type.toLowerCase()
  if (type.includes('webm')) return 'recording.webm'
  if (type.includes('ogg')) return 'recording.ogg'
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'recording.m4a'
  if (type.includes('mpeg') || type.includes('mp3')) return 'recording.mp3'
  if (type.includes('wav')) return 'recording.wav'
  return 'recording.webm'
}

async function transcribeWithWhisperBase(
  audioBlob: Blob,
  apiKey: string,
  options: TranscriptionOptions,
  model: string,
  apiBase: string,
  providerLabel: string
): Promise<TranscriptionResponse> {
  const formData = new FormData()
  formData.append('file', audioBlob, audioFileName(audioBlob))
  formData.append('model', model)
  // Deterministic decoding — higher temperatures increase hallucinated text on short clips
  formData.append('temperature', '0')
  if (options.language) {
    formData.append('language', options.language)
  }
  if (options.prompt) {
    // Whisper uses the prompt as preceding context: names and spellings in it are favoured
    formData.append('prompt', options.prompt)
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

  const data = (await response.json()) as { text?: string; duration?: number }

  return {
    text: data.text?.trim() || '',
    provider: providerLabel,
    duration: data.duration
  }
}

export async function transcribeWithWhisper(
  audioBlob: Blob,
  apiKey: string,
  options: TranscriptionOptions,
  model?: string
): Promise<TranscriptionResponse> {
  return transcribeWithWhisperBase(
    audioBlob,
    apiKey,
    options,
    model || DEFAULT_TOGETHER_MODEL,
    TOGETHER_API_BASE,
    'whisper'
  )
}

export async function transcribeWithOpenAIWhisper(
  audioBlob: Blob,
  apiKey: string,
  options: TranscriptionOptions,
  model?: string
): Promise<TranscriptionResponse> {
  return transcribeWithWhisperBase(
    audioBlob,
    apiKey,
    options,
    model || DEFAULT_OPENAI_MODEL,
    OPENAI_API_BASE,
    'openai-whisper'
  )
}
