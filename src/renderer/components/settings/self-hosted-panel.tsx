import { type JSX, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { Callout, Section } from '../ui/primitives'
import { localAiErrorMessage } from '../../services/local-ai'
import { DEFAULT_SELF_HOSTED, isInsecureKeyUse } from '../../../shared/local-ai/catalog'
import type {
  LocalModelKind,
  SelfHostedEndpoint,
  SelfHostedSettings
} from '../../../shared/local-ai/types'

/** Common servers and their default addresses */
const PRESETS: Record<LocalModelKind, { label: string; url: string }[]> = {
  stt: [
    { label: 'speaches', url: 'http://localhost:8000' },
    { label: 'LocalAI', url: 'http://localhost:8080' }
  ],
  llm: [
    { label: 'Ollama', url: 'http://localhost:11434' },
    { label: 'LM Studio', url: 'http://localhost:1234' },
    { label: 'LocalAI', url: 'http://localhost:8080' },
    { label: 'vLLM', url: 'http://localhost:8000' }
  ]
}

type TestState =
  | { state: 'idle' }
  | { state: 'testing' }
  | { state: 'ok'; models: string[] }
  | { state: 'error'; message: string }

/** Address, model and optional key of the user's own OpenAI-compatible server */
export function SelfHostedPanel({
  kind,
  apiKey,
  onApiKeyChange
}: {
  kind: LocalModelKind
  apiKey: string
  onApiKeyChange: (value: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [all, setAll] = useState<SelfHostedSettings>(DEFAULT_SELF_HOSTED)
  const [showKey, setShowKey] = useState(false)
  const [test, setTest] = useState<TestState>({ state: 'idle' })
  const endpoint = all[kind]
  // Edits can land while a test is running; always build on the latest settings
  const allRef = useRef(all)
  allRef.current = all

  useEffect(() => {
    window.tapwisper.store
      .get('selfHosted')
      .then((value) =>
        setAll({ ...DEFAULT_SELF_HOSTED, ...(value as Partial<SelfHostedSettings>) })
      )
      .catch(() => {})
  }, [])

  // Any change invalidates the last test result
  useEffect(() => setTest({ state: 'idle' }), [endpoint.baseUrl, apiKey])

  const update = (patch: Partial<SelfHostedEndpoint>): void => {
    const current = allRef.current
    const next = { ...current, [kind]: { ...current[kind], ...patch } }
    allRef.current = next
    setAll(next)
    void window.tapwisper.store.set('selfHosted', next)
  }

  const runTest = async (): Promise<void> => {
    setTest({ state: 'testing' })
    const tested = endpoint.baseUrl
    const result = await window.tapwisper.selfHosted.test(kind, {
      ...endpoint,
      apiKey: apiKey.trim()
    })
    // The address changed meanwhile, so this result no longer applies
    if (allRef.current[kind].baseUrl !== tested) return
    if (!result.ok) {
      setTest({ state: 'error', message: localAiErrorMessage(result.code, kind) })
      return
    }
    setTest({ state: 'ok', models: result.data.models })
    // Pick the only model the server offers so it works right away
    if (!allRef.current[kind].model && result.data.models.length === 1) {
      update({ model: result.data.models[0] })
    }
  }

  const models = test.state === 'ok' ? test.models : []

  return (
    <Section
      title={t('settings.selfHosted.server', 'Server')}
      description={
        kind === 'stt'
          ? t(
              'settings.selfHosted.sttHint',
              'Any server with an OpenAI-compatible /v1/audio/transcriptions endpoint. For whisper.cpp, start whisper-server with -l auto --inference-path /v1/audio/transcriptions.'
            )
          : t(
              'settings.selfHosted.llmHint',
              'Any server with an OpenAI-compatible /v1/chat/completions endpoint. Give it a context window of at least 8K tokens (Ollama: num_ctx).'
            )
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS[kind].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => update({ baseUrl: preset.url })}
              className="btn-secondary btn-sm"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor={`self-hosted-url-${kind}`} className="section-label mb-1 block">
            {t('settings.selfHosted.url', 'Server address')}
          </label>
          <input
            id={`self-hosted-url-${kind}`}
            value={endpoint.baseUrl}
            onChange={(e) => update({ baseUrl: e.target.value })}
            placeholder="http://192.168.1.20:11434"
            dir="ltr"
            spellCheck={false}
            autoComplete="off"
            className="field font-mono text-[13px]"
          />
        </div>

        <div>
          <label htmlFor={`self-hosted-model-${kind}`} className="section-label mb-1 block">
            {t('settings.selfHosted.model', 'Model')}
          </label>
          <input
            id={`self-hosted-model-${kind}`}
            value={endpoint.model}
            onChange={(e) => update({ model: e.target.value })}
            placeholder={kind === 'stt' ? 'whisper-1' : 'qwen3:4b'}
            list={`self-hosted-models-${kind}`}
            dir="ltr"
            spellCheck={false}
            autoComplete="off"
            className="field font-mono text-[13px]"
          />
          <datalist id={`self-hosted-models-${kind}`}>
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>

        <div>
          <label htmlFor={`self-hosted-key-${kind}`} className="section-label mb-1 block">
            {t('settings.selfHosted.apiKey', 'API key (optional)')}
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`self-hosted-key-${kind}`}
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              dir="ltr"
              spellCheck={false}
              autoComplete="off"
              className="field font-mono text-[13px]"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              aria-label={
                showKey
                  ? t('settings.hideApiKey', 'Hide API key')
                  : t('settings.showApiKey', 'Show API key')
              }
              aria-pressed={showKey}
              className="icon-btn h-8 w-8 shrink-0"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={!endpoint.baseUrl.trim() || test.state === 'testing'}
            className="btn-secondary btn-sm"
          >
            {test.state === 'testing'
              ? t('settings.testingKey', 'Testing…')
              : t('settings.selfHosted.test', 'Test connection')}
          </button>
          {test.state === 'ok' && (
            <span role="status" className="text-[12px] text-success">
              {models.length
                ? t('settings.selfHosted.connectedModels', 'Connected · {{count}} models', {
                    count: models.length
                  })
                : t('settings.selfHosted.connected', 'Connected')}
            </span>
          )}
          {test.state === 'error' && (
            <span role="status" className="text-[12px] text-danger">
              {test.message}
            </span>
          )}
        </div>

        {isInsecureKeyUse(endpoint.baseUrl, apiKey) ? (
          <Callout tone="warning">
            {t(
              'settings.selfHosted.insecure',
              'This address uses plain http on the internet, so your API key would be sent unencrypted. Use https.'
            )}
          </Callout>
        ) : (
          <Callout tone="info" icon={<Lock />}>
            {t(
              'settings.selfHosted.privacy',
              'Audio and text go only to your server. The key is encrypted on this device.'
            )}
          </Callout>
        )}
      </div>
    </Section>
  )
}
