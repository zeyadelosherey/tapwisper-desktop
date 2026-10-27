/** llama.cpp's llama-server: launch arguments and the chat request */
import { randomUUID } from 'crypto'
import { CHAT_TIMEOUT_MS, outputTokens, readChatReply } from './http'
import { loadTimeoutMs, type RuntimeOptions, type SidecarLaunch } from './sidecar'
import { LOCAL_LLM_CONTEXT_TOKENS, toChatMessages } from '../../shared/local-ai/catalog'
import type { ChatInput, LocalModelEntry } from '../../shared/local-ai/types'

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
      ...(model.thinking ? { chat_template_kwargs: { enable_thinking: false } } : {})
    }),
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS)
  })
  return readChatReply(res)
}
