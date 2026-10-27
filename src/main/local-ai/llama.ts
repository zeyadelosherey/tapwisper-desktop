/**
 * llama.cpp's llama-server: launch arguments, chat requests for language
 * models and transcription for audio models (Qwen3-ASR, Voxtral)
 */
import { randomUUID } from 'crypto'
import {
  CHAT_TIMEOUT_MS,
  outputTokens,
  readChatReply,
  readTranscript,
  transcriptionForm,
  transcriptionTimeout
} from './http'
import { loadTimeoutMs, type RuntimeOptions, type SidecarLaunch } from './sidecar'
import { LOCAL_LLM_CONTEXT_TOKENS, toChatMessages } from '../../shared/local-ai/catalog'
import type { ChatInput, LocalModelEntry, TranscribeInput } from '../../shared/local-ai/types'

/**
 * The server only listens on 127.0.0.1, but web pages in a browser can still
 * reach localhost; a key known only to this app keeps them out. Stable for the
 * app's lifetime so it doesn't force a restart.
 */
const API_KEY = randomUUID()

export function llamaLaunch(o: RuntimeOptions): SidecarLaunch {
  return {
    binary: o.binary,
    modelId: o.modelId,
    loadTimeoutMs: loadTimeoutMs(o.modelBytes),
    idleUnloadMs: o.idleUnloadMs,
    args: (port) => [
      '-m',
      o.modelFile,
      ...(o.mmprojFile ? ['--mmproj', o.mmprojFile] : []),
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '-c',
      String(LOCAL_LLM_CONTEXT_TOKENS),
      // One request at a time gets the whole context (slots split it otherwise)
      '-np',
      '1',
      '-ngl',
      o.useGpu ? '99' : '0',
      '-t',
      String(o.threads),
      // Use the model's own chat template, needed for chat_template_kwargs below
      '--jinja',
      '--api-key',
      API_KEY
    ]
  }
}

export async function llamaChat(
  baseUrl: string,
  input: ChatInput,
  model: LocalModelEntry
): Promise<string> {
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      messages: toChatMessages(input),
      temperature: input.temperature ?? 0.7,
      max_tokens: outputTokens(input),
      // e.g. thinking off for Qwen, low reasoning effort for gpt-oss
      ...(model.chatTemplateKwargs && { chat_template_kwargs: model.chatTemplateKwargs })
    }),
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS)
  })
  return readChatReply(res)
}

/** Speech to text with an audio model, through the OpenAI-style endpoint */
export async function llamaTranscribe(baseUrl: string, input: TranscribeInput): Promise<string> {
  // The server uses `prompt` as the instruction to the model, not as vocabulary
  // context as Whisper does, so it's left out
  const form = transcriptionForm({ ...input, prompt: undefined }, {})
  const res = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
    signal: transcriptionTimeout(input.seconds, 60_000)
  })
  return readTranscript(res)
}
