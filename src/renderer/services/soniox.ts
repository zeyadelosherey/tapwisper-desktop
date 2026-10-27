import type { TranscriptionResponse, TranscriptionOptions } from './ai-router'
import { audioFileName } from './whisper'
import i18n from '../i18n'

const API_BASE = 'https://api.soniox.com/v1'
const DEFAULT_MODEL = 'stt-async-v4'
const POLL_INTERVAL_MS = 250
const TIMEOUT_MS = 60_000

interface SonioxTranscription {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'error'
  error_message?: string | null
}

interface SonioxTranscript {
  text?: string
  tokens?: Array<{ text: string }>
}

async function sonioxFetch<T>(apiKey: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, ...(init.headers || {}) }
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Soniox transcription error: ${response.status} - ${error}`)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/**
 * Transcribe with Soniox's async API: upload the file, create a transcription
 * job, poll until it completes, fetch the transcript, then delete both the job
 * and the uploaded file (Soniox keeps them — and counts them against quota —
 * until deleted).
 */
export async function transcribeWithSoniox(
  audioBlob: Blob,
  apiKey: string,
  options: TranscriptionOptions,
  model?: string
): Promise<TranscriptionResponse> {
  const form = new FormData()
  form.append('file', audioBlob, audioFileName(audioBlob))
  const file = await sonioxFetch<{ id: string }>(apiKey, '/files', { method: 'POST', body: form })

  let transcriptionId: string | null = null
  try {
    const body: Record<string, unknown> = {
      // Older configs stored a display id like "soniox-stt-async-v3"; only pass real model ids
      model: model && model.startsWith('stt-') ? model : DEFAULT_MODEL,
      file_id: file.id
    }
    if (options.language) body.language_hints = [options.language]
    if (options.prompt) body.context = options.prompt

    const created = await sonioxFetch<SonioxTranscription>(apiKey, '/transcriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    transcriptionId = created.id

    const deadline = Date.now() + TIMEOUT_MS
    let status = created
    while (status.status !== 'completed') {
      if (status.status === 'error') {
        throw new Error(`Soniox transcription error: ${status.error_message || 'unknown error'}`)
      }
      if (Date.now() > deadline) {
        throw new Error(i18n.t('errors.sonioxTimeout', 'Soniox transcription timed out'))
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      status = await sonioxFetch<SonioxTranscription>(apiKey, `/transcriptions/${created.id}`)
    }

    const transcript = await sonioxFetch<SonioxTranscript>(
      apiKey,
      `/transcriptions/${created.id}/transcript`
    )
    const text = transcript.text ?? transcript.tokens?.map((t) => t.text).join('') ?? ''

    return { text: text.trim(), provider: 'soniox' }
  } finally {
    // Best-effort cleanup; never let it mask the real result or error
    if (transcriptionId) {
      sonioxFetch(apiKey, `/transcriptions/${transcriptionId}`, { method: 'DELETE' }).catch(
        () => {}
      )
    }
    sonioxFetch(apiKey, `/files/${file.id}`, { method: 'DELETE' }).catch(() => {})
  }
}
