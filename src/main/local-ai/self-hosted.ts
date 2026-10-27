/**
 * The user's own OpenAI-compatible servers (Ollama, LM Studio, vLLM, LocalAI,
 * speaches…). Requests go through Electron's network stack so the system proxy
 * and certificate store apply, and the renderer's CSP doesn't block LAN hosts.
 */
import { net } from 'electron'
import { getConfigValue } from '../store'
import { LocalAiError } from './errors'
import {
  assertOk,
  CHAT_TIMEOUT_MS,
  outputTokens,
  readChatReply,
  transcriptionForm,
  transcriptionTimeout
} from './http'
import {
  normalizeBaseUrl,
  SELF_HOSTED_KEY_IDS,
  toChatMessages
} from '../../shared/local-ai/catalog'
import type {
  ChatInput,
  LocalModelKind,
  SelfHostedEndpoint,
  SelfHostedSettings,
  SelfHostedTestResult,
  TranscribeInput
} from '../../shared/local-ai/types'

const TEST_TIMEOUT_MS = 10_000

export interface SelfHostedTarget extends SelfHostedEndpoint {
  apiKey: string
}

/** The saved server for a feature, with its key from the encrypted key store */
export function savedTarget(kind: LocalModelKind): SelfHostedTarget {
  const settings = getConfigValue('selfHosted') as SelfHostedSettings | undefined
  const keys = getConfigValue('apiKeys') as Record<string, string> | undefined
  return {
    baseUrl: '',
    model: '',
    ...settings?.[kind],
    apiKey: keys?.[SELF_HOSTED_KEY_IDS[kind]] ?? ''
  }
}

function baseUrlOf(target: SelfHostedTarget): string {
  if (!target.baseUrl.trim()) throw new LocalAiError('not-configured')
  const base = normalizeBaseUrl(target.baseUrl)
  if (!base) throw new LocalAiError('invalid-url')
  return base
}

function authHeaders(target: SelfHostedTarget): Record<string, string> {
  return target.apiKey ? { Authorization: `Bearer ${target.apiKey}` } : {}
}

/** Reachability + model list. whisper.cpp's server has no /v1/models, so a 404 there falls back to its root page */
export async function testServer(
  kind: LocalModelKind,
  target: SelfHostedTarget
): Promise<SelfHostedTestResult> {
  const base = baseUrlOf(target)
  const res = await net.fetch(`${base}/v1/models`, {
    headers: authHeaders(target),
    signal: AbortSignal.timeout(TEST_TIMEOUT_MS)
  })
  if (res.status === 404 && kind === 'stt') {
    const root = await net.fetch(base, { signal: AbortSignal.timeout(TEST_TIMEOUT_MS) })
    await assertOk(root)
    return { models: [] }
  }
  await assertOk(res)
  const data = (await res.json().catch(() => null)) as { data?: Array<{ id?: string }> } | null
  const models = (data?.data ?? []).map((m) => m.id).filter((id): id is string => !!id)
  return { models: [...new Set(models)].sort() }
}

export async function selfHostedTranscribe(input: TranscribeInput): Promise<string> {
  const target = savedTarget('stt')
  const base = baseUrlOf(target)
  // Most servers need a model name; "whisper-1" is the conventional alias
  const form = transcriptionForm(input, { model: target.model || 'whisper-1' })
  const res = await net.fetch(`${base}/v1/audio/transcriptions`, {
    method: 'POST',
    headers: authHeaders(target),
    body: form,
    signal: transcriptionTimeout(input.seconds, 60_000)
  })
  await assertOk(res)
  const data = (await res.json()) as { text?: string }
  return (data.text ?? '').trim()
}

export async function selfHostedChat(input: ChatInput): Promise<string> {
  const target = savedTarget('llm')
  const base = baseUrlOf(target)
  if (!target.model.trim()) throw new LocalAiError('not-configured')

  const res = await net.fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(target) },
    body: JSON.stringify({
      model: target.model,
      messages: toChatMessages(input),
      temperature: input.temperature ?? 0.7,
      max_tokens: outputTokens(input)
    }),
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS)
  })
  return readChatReply(res)
}
