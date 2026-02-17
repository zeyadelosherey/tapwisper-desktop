import type { TranscriptionResponse } from './ai-router'

const DEFAULT_MODEL = 'openai/whisper-large-v3'
const API_BASE = 'https://api.together.xyz/v1'

export async function transcribeWithWhisper(
  audioBlob: Blob,
  apiKey: string,
  language?: string,
  model?: string
): Promise<TranscriptionResponse> {
  const formData = new FormData()
  formData.append('file', audioBlob, 'recording.wav')
  formData.append('model', model || DEFAULT_MODEL)
  if (language) {
    formData.append('language', language)
  }

  const response = await fetch(`${API_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Whisper transcription error: ${response.status} - ${error}`)
  }

  const data = await response.json()

  return {
    text: data.text?.trim() || '',
    provider: 'whisper',
    duration: data.duration
  }
}
