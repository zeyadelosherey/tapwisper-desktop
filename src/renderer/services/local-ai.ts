/**
 * Renderer side of the local (on-device) and self-hosted engines. The work
 * happens in the main process; this converts audio, calls it over IPC and
 * turns its error codes into messages people can act on.
 */
import i18n from '../i18n'
import { toWav16k } from '../utils/audio-convert'
import { LOCAL_LLM_MAX_INPUT_CHARS } from '../../shared/local-ai/catalog'
import type {
  AIEngine,
  ChatInput,
  LocalAiErrorCode,
  LocalAiResult,
  LocalModelKind
} from '../../shared/local-ai/types'

type DeviceEngine = Exclude<AIEngine, 'cloud'>

const FALLBACK_MESSAGES: Record<LocalAiErrorCode, string> = {
  'no-model-selected': 'No model is selected. Choose one in Settings › {{page}}.',
  'model-not-downloaded':
    "The selected model isn't downloaded yet. Download it in Settings › {{page}}.",
  'runtime-unavailable':
    "Local models can't run on this computer. Choose Cloud or Self-hosted in Settings › {{page}}.",
  'server-failed': 'The local model stopped unexpectedly. Try again or choose a smaller model.',
  timeout: 'The model took too long to respond.',
  'insufficient-disk': 'Not enough free disk space for this model.',
  'download-failed': 'The download failed. Check your connection and try again.',
  'model-unavailable':
    'This model is no longer available for download. Choose another one or update TapWisper.',
  'checksum-mismatch': 'The downloaded file was damaged and has been removed. Try again.',
  'model-in-use': 'This model is busy. Try again in a moment.',
  'input-too-long':
    'This text is too long for the model. Select less text, or use a cloud provider for long texts.',
  'not-configured': 'Add your server address and model in Settings › {{page}}.',
  unreachable: "Couldn't reach your server. Check that it's running and the address is right.",
  unauthorized: 'Your server rejected the API key.',
  'not-found': "Your server doesn't offer this endpoint. Check the address.",
  tls: "Couldn't make a secure connection to your server (certificate problem).",
  'bad-response': 'The model returned an unexpected response.',
  'invalid-url': "The server address isn't a valid URL."
}

/** Translated message for a local/self-hosted failure */
export function localAiErrorMessage(code: LocalAiErrorCode, kind: LocalModelKind): string {
  const page =
    kind === 'stt'
      ? i18n.t('settings.tabSpeechToText', 'Speech-to-Text')
      : i18n.t('settings.tabLanguageModels', 'Language Models')
  return i18n.t(`errors.local.${code}`, FALLBACK_MESSAGES[code], { page })
}

/** Failures that need a change in Settings; retrying won't help */
const SETUP_CODES = new Set<LocalAiErrorCode>([
  'no-model-selected',
  'model-not-downloaded',
  'runtime-unavailable',
  'not-configured',
  'invalid-url'
])

/** A local or self-hosted engine failed; the message is already translated */
export class LocalEngineError extends Error {
  constructor(
    readonly code: LocalAiErrorCode,
    kind: LocalModelKind
  ) {
    super(localAiErrorMessage(code, kind))
  }

  /** The engine needs setting up in Settings; retrying won't help */
  get needsSetup(): boolean {
    return SETUP_CODES.has(this.code)
  }
}

function unwrap<T>(result: LocalAiResult<T>, kind: LocalModelKind): T {
  if (result.ok) return result.data
  throw new LocalEngineError(result.code, kind)
}

export async function transcribeOnDevice(
  engine: DeviceEngine,
  audio: Blob,
  hints: { language?: string; prompt?: string }
): Promise<string> {
  const { wav, seconds } = await toWav16k(audio)
  const input = { wav, seconds, ...hints }
  const api = engine === 'local' ? window.tapwisper.localAi : window.tapwisper.selfHosted
  return unwrap(await api.transcribe(input), 'stt')
}

export async function chatOnDevice(engine: DeviceEngine, input: ChatInput): Promise<string> {
  // Local and self-hosted models have small context windows; failing here beats a garbled answer
  const length = input.prompt.length + input.text.length + (input.systemInstruction?.length ?? 0)
  if (length > LOCAL_LLM_MAX_INPUT_CHARS) throw new LocalEngineError('input-too-long', 'llm')
  const api = engine === 'local' ? window.tapwisper.localAi : window.tapwisper.selfHosted
  return unwrap(await api.chat(input), 'llm')
}

/**
 * Start loading the local models a recording is about to need, so they are
 * ready by the time the user stops talking. No-op for other engines.
 */
export async function warmUpLocalModels(feature: 'dictation' | 'meeting'): Promise<void> {
  const config = (await window.tapwisper.store.getAll()) as {
    speechEngine?: AIEngine
    llmEngine?: AIEngine
    smartFormatting?: boolean
    dictationTranslateTo?: string
    meetingTranslateTo?: string
  }
  if (config.speechEngine === 'local') void window.tapwisper.localAi.warmUp('stt')
  const usesLlm =
    feature === 'dictation'
      ? config.smartFormatting || !!config.dictationTranslateTo
      : !!config.meetingTranslateTo
  if (usesLlm && config.llmEngine === 'local') void window.tapwisper.localAi.warmUp('llm')
}
