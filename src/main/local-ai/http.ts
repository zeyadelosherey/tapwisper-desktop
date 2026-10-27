/** Request/response helpers shared by the local servers and self-hosted ones */
import { LocalAiError } from './errors'
import { stripThinking } from '../../shared/local-ai/catalog'
import type { LocalAiErrorCode, TranscribeInput } from '../../shared/local-ai/types'

/** Throw a coded error for a non-2xx HTTP response */
export async function assertOk(res: Response): Promise<void> {
  if (res.ok) return
  const body = (await res.text().catch(() => '')).slice(0, 300)
  const code: LocalAiErrorCode =
    res.status === 401 || res.status === 403
      ? 'unauthorized'
      : res.status === 404
        ? 'not-found'
        : 'bad-response'
  throw new LocalAiError(code, `HTTP ${res.status} ${body}`.trim())
}

/** Multipart body for Whisper-style transcription endpoints */
export function transcriptionForm(
  input: TranscribeInput,
  fields: Record<string, string>
): FormData {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(input.wav)], { type: 'audio/wav' }), 'audio.wav')
  form.append('response_format', 'json')
  // Deterministic decoding — higher temperatures hallucinate more on short clips
  form.append('temperature', '0')
  if (input.language) form.append('language', input.language)
  // Whisper uses the prompt as preceding context: names and spellings in it are favoured
  if (input.prompt) form.append('prompt', input.prompt)
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  return form
}

/** Timeout for transcribing `seconds` of audio: CPU decoding can take a few times real time */
export function transcriptionTimeout(seconds: number, minimumMs: number): AbortSignal {
  return AbortSignal.timeout(Math.max(minimumMs, seconds * 3000))
}

/** The assistant text of an OpenAI-style chat completion */
export async function readChatReply(res: Response): Promise<string> {
  await assertOk(res)
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new LocalAiError('bad-response', 'no message content')
  return stripThinking(content)
}
