import type { TranscriptionResponse } from './ai-router'

const API_BASE = 'https://api.soniox.com/v1'

export async function transcribeWithSoniox(
  audioBlob: Blob,
  apiKey: string,
  language?: string
): Promise<TranscriptionResponse> {
  // Convert blob to base64
  const arrayBuffer = await audioBlob.arrayBuffer()
  const base64Audio = btoa(
    String.fromCharCode(...new Uint8Array(arrayBuffer))
  )

  const response = await fetch(`${API_BASE}/speech:transcribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      audio: {
        content: base64Audio
      },
      config: {
        model: 'stt-async-v3',
        language: language || 'en',
        encoding: 'LINEAR16',
        sampleRateHertz: 16000
      }
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Soniox transcription error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  const text = data.results
    ?.map((r: any) => r.alternatives?.[0]?.transcript || '')
    .join(' ')
    .trim()

  return {
    text: text || '',
    provider: 'soniox'
  }
}
