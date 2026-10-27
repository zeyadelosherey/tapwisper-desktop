/** Request/response helpers shared by the local servers and self-hosted ones */
import { LocalAiError } from './errors'
import { LOCAL_LLM_MAX_OUTPUT_TOKENS, stripThinking } from '../../shared/local-ai/catalog'
import type { ChatInput, LocalAiErrorCode, TranscribeInput } from '../../shared/local-ai/types'

/** CPU generation of a long answer can take minutes on older machines */
export const CHAT_TIMEOUT_MS = 5 * 60_000

/** llama-server, vLLM and OpenAI-style wording for a request longer than the context */
const CONTEXT_EXCEEDED = /exceed_context|context (size|length|window)|too many tokens/i

/** Throw a coded error for a non-2xx HTTP response */
export async function assertOk(res: Response): Promise<void> {
  if (res.ok) return
  const body = (await res.text().catch(() => '')).slice(0, 300)
  const code: LocalAiErrorCode =
    res.status === 401 || res.status === 403
      ? 'unauthorized'
      : res.status === 404
        ? 'not-found'
        : CONTEXT_EXCEEDED.test(body)
          ? 'input-too-long'
          : 'bad-response'
  throw new LocalAiError(code, `HTTP ${res.status} ${body}`.trim())
}

/** The JSON body of a successful response; anything else (an HTML proxy page) is a bad response */
async function readJson<T>(res: Response): Promise<T> {
  await assertOk(res)
  try {
    return (await res.json()) as T
  } catch {
    throw new LocalAiError('bad-response', 'not JSON')
  }
}

/** The text of a Whisper-style transcription response */
export async function readTranscript(res: Response): Promise<string> {
  const data = await readJson<{ text?: unknown; error?: unknown }>(res)
  if (data.error) throw new LocalAiError('bad-response', String(data.error))
  if (typeof data.text !== 'string') throw new LocalAiError('bad-response', 'no transcript')
  return data.text.trim()
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

/** How long transcribing `seconds` of audio may take: CPU decoding can take a few times real time */
export function transcriptionMs(seconds: number, minimumMs: number): number {
  return Math.max(minimumMs, seconds * 3000)
}

export function transcriptionTimeout(seconds: number, minimumMs: number): AbortSignal {
  return AbortSignal.timeout(transcriptionMs(seconds, minimumMs))
}

/** Requested answer length, capped so prompt + answer fit an 8K context */
export function outputTokens(input: ChatInput): number {
  return Math.min(input.maxTokens ?? LOCAL_LLM_MAX_OUTPUT_TOKENS, LOCAL_LLM_MAX_OUTPUT_TOKENS)
}

/** The assistant text of an OpenAI-style chat completion */
export async function readChatReply(res: Response): Promise<string> {
  const data = await readJson<{ choices?: Array<{ message?: { content?: unknown } }> }>(res)
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new LocalAiError('bad-response', 'no message content')
  const reply = stripThinking(content)
  // The answer ran out of tokens while the model was still reasoning
  if (!reply && content.trim()) throw new LocalAiError('bad-response', 'only reasoning, no answer')
  return reply
}
