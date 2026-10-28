import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ExternalLink, Eye, EyeOff, Lock } from 'lucide-react'
import togetherLogo from '../../assets/together.png'
import openaiLogo from '../../assets/openai.png'
import sonioxLogo from '../../assets/soniox.png'
import type { VoiceProvider, AIEngine } from '../../constants/providers'
import { testApiKey, type KeyProvider, type KeyTestResult } from '../../services/key-test'
import { EngineSettings } from '../settings/engine-settings'
import { Spinner } from '../ui/primitives'
import { SELF_HOSTED_KEY_IDS } from '../../../shared/local-ai/catalog'

interface ProviderInfo {
  id: VoiceProvider
  keyId: KeyProvider
  name: string
  model: string
  logo: string
  keyUrl: string
}

const PROVIDERS: ProviderInfo[] = [
  {
    id: 'whisper',
    keyId: 'together',
    name: 'Together AI',
    model: 'Whisper large v3',
    logo: togetherLogo,
    keyUrl: 'https://api.together.ai/settings/api-keys'
  },
  {
    id: 'openai-whisper',
    keyId: 'openai',
    name: 'OpenAI',
    model: 'Whisper · GPT-4o Transcribe',
    logo: openaiLogo,
    keyUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'soniox',
    keyId: 'soniox',
    name: 'Soniox',
    model: 'Soniox speech-to-text',
    logo: sonioxLogo,
    keyUrl: 'https://console.soniox.com'
  }
]

function isVoiceProvider(value: unknown): value is VoiceProvider {
  return PROVIDERS.some((p) => p.id === value)
}

/**
 * Onboarding: how speech becomes text. Cloud (provider + API key), a local
 * model, or a self-hosted server. Without one of these, dictation can't work,
 * so the step reports whether it is set up.
 */
export function SpeechSetup({
  languages,
  onReadyChange
}: {
  languages: string[]
  onReadyChange: (ready: boolean) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [engine, setEngine] = useState<AIEngine>('cloud')
  const [provider, setProvider] = useState<VoiceProvider>('whisper')
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<KeyTestResult | null>(null)

  useEffect(() => {
    Promise.all([
      window.tapwisper.store.get('voiceProvider'),
      window.tapwisper.store.get('apiKeys')
    ])
      .then(([voice, stored]) => {
        if (isVoiceProvider(voice)) setProvider(voice)
        if (stored && typeof stored === 'object') setKeys(stored as Record<string, string>)
      })
      .catch(() => {})
  }, [])

  const current = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0]
  const key = keys[current.keyId] ?? ''
  const ready = engine !== 'cloud' || key.trim().length > 0

  useEffect(() => onReadyChange(ready), [ready, onReadyChange])

  // A different key or provider needs a fresh test
  useEffect(() => setResult(null), [provider, key])

  const saveKey = (keyId: string, value: string): void => {
    const next = { ...keys, [keyId]: value }
    setKeys(next)
    void window.tapwisper.store.set('apiKeys', { ...next, [keyId]: value.trim() })
  }

  const chooseProvider = (id: VoiceProvider): void => {
    setProvider(id)
    void window.tapwisper.store.set('voiceProvider', id)
  }

  const runTest = async (): Promise<void> => {
    setTesting(true)
    setResult(await testApiKey(current.keyId, key))
    setTesting(false)
  }

  const cloud = (
    <div className="space-y-4">
      <div
        role="radiogroup"
        aria-label={t('settings.selectProvider', 'Select Provider')}
        className="grid grid-cols-3 gap-2"
      >
        {PROVIDERS.map((p) => {
          const selected = p.id === provider
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => chooseProvider(p.id)}
              className={`relative flex flex-col items-start gap-2 rounded-xl border p-3 text-start transition-[border-color,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 ${
                selected
                  ? 'border-signal bg-signal-tint/40'
                  : 'border-hairline bg-raised hover:border-hairline-strong'
              }`}
            >
              <img src={p.logo} alt="" className="h-6 w-6 rounded-md object-contain" />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ink">{p.name}</span>
                <span className="block truncate text-[11.5px] text-ink-soft">{p.model}</span>
              </span>
              {selected && (
                <Check
                  className="absolute end-2.5 top-2.5 h-3.5 w-3.5 text-signal"
                  strokeWidth={2.5}
                />
              )}
            </button>
          )
        })}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <label htmlFor="onboarding-api-key" className="text-[13px] font-medium text-ink">
            {t('settings.providerApiKey', '{{provider}} API Key', { provider: current.name })}
          </label>
          <a
            href={current.keyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[12px] text-signal hover:underline"
          >
            {t('onboarding.getKey', 'Get a key')}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="onboarding-api-key"
            type={showKey ? 'text' : 'password'}
            value={key}
            onChange={(e) => saveKey(current.keyId, e.target.value)}
            placeholder={t('settings.apiKeyPlaceholder', 'Enter your API key')}
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
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
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={!key.trim() || testing}
            className="btn-secondary btn-sm h-8 shrink-0"
          >
            {testing && <Spinner className="h-3 w-3" />}
            {t('settings.testKey', 'Test key')}
          </button>
        </div>
        <p
          role="status"
          className={`mt-2 flex items-center gap-1.5 text-[12px] ${
            result ? (result.ok ? 'text-success' : 'text-danger') : 'text-ink-soft'
          }`}
        >
          {result ? (
            result.message
          ) : (
            <>
              <Lock className="h-3 w-3 shrink-0" />
              {t('settings.apiPrivacyNote', 'Encrypted on this device; only sent to the provider.')}
            </>
          )}
        </p>
      </div>
    </div>
  )

  return (
    <EngineSettings
      kind="stt"
      cloud={cloud}
      languages={languages}
      selfHostedKey={keys[SELF_HOSTED_KEY_IDS.stt] ?? ''}
      onSelfHostedKeyChange={(value) => saveKey(SELF_HOSTED_KEY_IDS.stt, value)}
      onEngineChange={setEngine}
    />
  )
}
