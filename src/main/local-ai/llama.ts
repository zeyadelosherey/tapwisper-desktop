/** llama.cpp's llama-server: launch arguments and the chat request */
import { readChatReply } from './http'
import { loadTimeoutMs, type RuntimeOptions, type SidecarLaunch } from './sidecar'
import { LOCAL_LLM_CONTEXT_TOKENS, toChatMessages } from '../../shared/local-ai/catalog'
import type { ChatInput, LocalModelEntry } from '../../shared/local-ai/types'

/** Output budget reserved inside the context window (see LOCAL_LLM_MAX_INPUT_CHARS) */
const MAX_OUTPUT_TOKENS = 2048

/** CPU generation of a long answer can take minutes on older machines */
const CHAT_TIMEOUT_MS = 5 * 60_000

export function llamaLaunch(o: RuntimeOptions): SidecarLaunch {
  return {
    binary: o.binary,
    modelId: o.modelId,
    loadTimeoutMs: loadTimeoutMs(o.modelBytes),
    idleUnloadMs: o.idleUnloadMs,
    args: (port) => [
      '-m',
      o.modelFile,
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
      // Use the model's own chat template, needed for enable_thinking below
      '--jinja'
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: toChatMessages(input),
      temperature: input.temperature ?? 0.7,
      max_tokens: Math.min(input.maxTokens ?? MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS),
      ...(model.thinking ? { chat_template_kwargs: { enable_thinking: false } } : {})
    }),
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS)
  })
  return readChatReply(res)
}
