import { type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Eye, EyeOff, AlertCircle, Cpu, Mic, Search, X } from 'lucide-react'
import type { LLMProvider, VoiceProvider, ProviderSubTab } from './types'
import {
  LLM_PROVIDERS,
  VOICE_PROVIDERS,
  PROVIDER_MODELS,
  VOICE_PROVIDER_MODELS,
  DEFAULT_MODELS,
  DEFAULT_VOICE_MODELS,
  LLM_API_KEY_LABELS,
  VOICE_API_KEY_LABELS,
  VOICE_API_KEY_ID,
  PROVIDER_LOGO_IMAGES
} from './provider-data'

interface AIProviderTabProps {
  selectedLLM: LLMProvider
  selectedVoice: VoiceProvider
  models: Record<string, string>
  voiceModels: Record<string, string>
  apiKeys: Record<string, string>
  onSelectLLM: (provider: LLMProvider) => void
  onSelectVoice: (provider: VoiceProvider) => void
  onModelChange: (provider: string, modelId: string) => void
  onVoiceModelChange: (provider: string, modelId: string) => void
  onKeyChange: (provider: string, value: string) => void
}

export function AIProviderTab({
  selectedLLM,
  selectedVoice,
  models,
  voiceModels,
  apiKeys,
  onSelectLLM,
  onSelectVoice,
  onModelChange,
  onVoiceModelChange,
  onKeyChange
}: AIProviderTabProps): JSX.Element {
  const { t } = useTranslation()
  const [providerSubTab, setProviderSubTab] = useState<ProviderSubTab>('ai')
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})
  const [modelSearch, setModelSearch] = useState('')
  const [voiceModelSearch, setVoiceModelSearch] = useState('')

  const toggleKeyVisibility = (provider: string): void => {
    setVisibleKeys((prev) => ({ ...prev, [provider]: !prev[provider] }))
  }

  const handleSelectLLM = (provider: LLMProvider): void => {
    onSelectLLM(provider)
    setModelSearch('')
  }

  const handleSelectVoice = (provider: VoiceProvider): void => {
    onSelectVoice(provider)
    setVoiceModelSearch('')
  }

  const currentLLMProvider = LLM_PROVIDERS.find((p) => p.id === selectedLLM)!
  const currentVoiceProvider = VOICE_PROVIDERS.find((p) => p.id === selectedVoice)!

  const activeApiKeyId = providerSubTab === 'ai' ? selectedLLM : VOICE_API_KEY_ID[selectedVoice]
  const activeApiKeyLabel =
    providerSubTab === 'ai' ? LLM_API_KEY_LABELS[selectedLLM] : VOICE_API_KEY_LABELS[selectedVoice]

  return (
    <>
      {/* Sub-tab toggle */}
      <div className="flex gap-6 border-b border-theme-border/30 mb-6">
        <button
          onClick={() => setProviderSubTab('ai')}
          className={`
            flex items-center gap-2 pb-2.5 text-sm font-medium transition-all border-b-2 -mb-px
            ${
              providerSubTab === 'ai'
                ? 'border-theme-text text-theme-text'
                : 'border-transparent text-theme-text-secondary hover:text-theme-text'
            }
          `}
        >
          <Cpu className="w-4 h-4" />
          {t('settings.aiProvider', 'AI Provider')}
        </button>
        <button
          onClick={() => setProviderSubTab('transcription')}
          className={`
            flex items-center gap-2 pb-2.5 text-sm font-medium transition-all border-b-2 -mb-px
            ${
              providerSubTab === 'transcription'
                ? 'border-theme-text text-theme-text'
                : 'border-transparent text-theme-text-secondary hover:text-theme-text'
            }
          `}
        >
          <Mic className="w-4 h-4" />
          {t('settings.transcriptionProvider', 'Transcription')}
        </button>
      </div>

      {/* ── AI Provider sub-tab ── */}
      {providerSubTab === 'ai' && (
        <>
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider mb-3">
              {t('settings.selectProvider', 'Select Provider')}
            </h2>
            <div className="grid grid-cols-4 gap-2">
              {LLM_PROVIDERS.map((provider) => {
                const logoImage = PROVIDER_LOGO_IMAGES[provider.id]
                const isSelected = selectedLLM === provider.id
                return (
                  <button
                    key={provider.id}
                    onClick={() => handleSelectLLM(provider.id)}
                    className={`
                      relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all
                      ${
                        isSelected
                          ? 'border-sky-accent bg-sky-accent/5'
                          : 'border-theme-border/30 bg-theme-card hover:border-theme-border hover:bg-theme-surface/30'
                      }
                    `}
                  >
                    {isSelected && (
                      <div className="absolute top-1.5 end-1.5 w-4 h-4 rounded-full bg-sky-accent flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden"
                      style={{ backgroundColor: logoImage ? 'transparent' : `${provider.color}15` }}
                    >
                      <img src={logoImage} alt="" className="w-8 h-8 object-contain rounded-xl" />
                    </div>
                    <span
                      className={`text-xs font-medium ${isSelected ? 'text-sky-accent' : 'text-theme-text-secondary'}`}
                    >
                      {provider.shortLabel}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <ModelList
            title={`${t('settings.llm', 'LLM')} — ${currentLLMProvider.shortLabel}`}
            models={PROVIDER_MODELS[selectedLLM]}
            selectedModel={models[selectedLLM] || DEFAULT_MODELS[selectedLLM]}
            search={modelSearch}
            onSearchChange={setModelSearch}
            onSelect={(id) => onModelChange(selectedLLM, id)}
            noResultsText={t('settings.noModelsFound', 'No models found')}
            searchPlaceholder={t('settings.searchModels', 'Search models...')}
          />

          <ApiKeySection
            label={activeApiKeyLabel}
            value={apiKeys[activeApiKeyId] || ''}
            visible={!!visibleKeys[activeApiKeyId]}
            onToggleVisibility={() => toggleKeyVisibility(activeApiKeyId)}
            onChange={(v) => onKeyChange(activeApiKeyId, v)}
          />
        </>
      )}

      {/* ── Transcription Provider sub-tab ── */}
      {providerSubTab === 'transcription' && (
        <>
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider mb-3">
              {t('settings.selectProvider', 'Select Provider')}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {VOICE_PROVIDERS.map((provider) => {
                const logoImage = PROVIDER_LOGO_IMAGES[provider.id]
                const isSelected = selectedVoice === provider.id
                return (
                  <button
                    key={provider.id}
                    onClick={() => handleSelectVoice(provider.id)}
                    className={`
                      relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                      ${
                        isSelected
                          ? 'border-sky-accent bg-sky-accent/5'
                          : 'border-theme-border/30 bg-theme-card hover:border-theme-border hover:bg-theme-surface/30'
                      }
                    `}
                  >
                    {isSelected && (
                      <div className="absolute top-1.5 end-1.5 w-4 h-4 rounded-full bg-sky-accent flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                    <div
                      className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden"
                      style={{ backgroundColor: logoImage ? 'transparent' : `${provider.color}15` }}
                    >
                      <img src={logoImage} alt="" className="w-10 h-10 object-contain rounded-xl" />
                    </div>
                    <div className="text-center">
                      <span
                        className={`text-sm font-medium ${isSelected ? 'text-sky-accent' : 'text-theme-text'}`}
                      >
                        {provider.shortLabel}
                      </span>
                      <p className="text-[10px] text-theme-text-tertiary mt-0.5">{provider.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <ModelList
            title={`${t('settings.selectModel', 'Select Model')} — ${currentVoiceProvider.shortLabel}`}
            models={VOICE_PROVIDER_MODELS[selectedVoice]}
            selectedModel={voiceModels[selectedVoice] || DEFAULT_VOICE_MODELS[selectedVoice]}
            search={voiceModelSearch}
            onSearchChange={setVoiceModelSearch}
            onSelect={(id) => onVoiceModelChange(selectedVoice, id)}
            noResultsText={t('settings.noModelsFound', 'No models found')}
            searchPlaceholder={t('settings.searchModels', 'Search models...')}
          />

          <ApiKeySection
            label={activeApiKeyLabel}
            value={apiKeys[activeApiKeyId] || ''}
            visible={!!visibleKeys[activeApiKeyId]}
            onToggleVisibility={() => toggleKeyVisibility(activeApiKeyId)}
            onChange={(v) => onKeyChange(activeApiKeyId, v)}
            whisperNote={
              selectedVoice === 'whisper'
                ? t('settings.whisperSharesKey', 'Whisper uses the same API key as Together AI.')
                : undefined
            }
          />
        </>
      )}
    </>
  )
}

// ── Shared sub-components ────────────────────────────────────────

interface ModelListProps {
  title: string
  models: { id: string; label: string; description: string }[]
  selectedModel: string
  search: string
  onSearchChange: (v: string) => void
  onSelect: (id: string) => void
  noResultsText: string
  searchPlaceholder: string
}

function ModelList({
  title,
  models,
  selectedModel,
  search,
  onSearchChange,
  onSelect,
  noResultsText,
  searchPlaceholder
}: ModelListProps): JSX.Element {
  const filtered = search
    ? models.filter((m) => {
        const q = search.toLowerCase()
        return (
          m.label.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q)
        )
      })
    : models

  return (
    <section className="mb-6">
      <h2 className="text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider mb-3">{title}</h2>
      {models.length > 5 && (
        <div className="relative mb-2">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-text-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-theme-surface/50 rounded-lg ps-9 pe-9 py-2 text-sm text-theme-text placeholder-theme-text-muted outline-none focus:ring-1 focus:ring-sky-accent/30 border border-theme-border/30"
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-theme-text-muted hover:text-theme-text transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
      <div className="bg-theme-card rounded-xl border border-theme-border/50 overflow-hidden divide-y divide-theme-border/30 max-h-80 overflow-y-auto">
        {filtered.map((model) => {
          const isSelected = selectedModel === model.id
          return (
            <button
              key={model.id}
              onClick={() => onSelect(model.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-start transition-all hover:bg-theme-surface/30"
            >
              <div
                className={`
                  w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0
                  ${isSelected ? 'border-sky-accent bg-sky-accent' : 'border-theme-border'}
                `}
              >
                {isSelected && <Check className="w-3 h-3 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${isSelected ? 'text-sky-accent' : 'text-theme-text'}`}>
                  {model.label}
                </p>
                <p className="text-xs text-theme-text-tertiary">{model.description}</p>
              </div>
            </button>
          )
        })}
        {search && filtered.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-theme-text-muted">{noResultsText}</div>
        )}
      </div>
    </section>
  )
}

interface ApiKeySectionProps {
  label: string
  value: string
  visible: boolean
  onToggleVisibility: () => void
  onChange: (v: string) => void
  whisperNote?: string
}

function ApiKeySection({
  label,
  value,
  visible,
  onToggleVisibility,
  onChange,
  whisperNote
}: ApiKeySectionProps): JSX.Element {
  const { t } = useTranslation()
  return (
    <section>
      <h2 className="text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider mb-3">
        {t('settings.apiKey', 'API Key')}
      </h2>
      <div className="bg-theme-card rounded-xl p-4 border border-theme-border/50">
        <label className="block text-xs text-theme-text-secondary mb-2">{label}</label>
        <div className="flex items-center gap-2">
          <input
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter your API key"
            className="flex-1 bg-theme-surface/50 rounded-lg px-3 py-2 text-sm text-theme-text placeholder-theme-text-muted outline-none focus:ring-1 focus:ring-sky-accent/30 font-mono"
          />
          <button
            onClick={onToggleVisibility}
            className="w-9 h-9 rounded-lg bg-theme-surface/30 flex items-center justify-center text-theme-text-tertiary hover:text-theme-text transition-all"
          >
            {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {value && (
          <div className="flex items-center gap-1 mt-2">
            <Check className="w-3 h-3 text-green-accent" />
            <span className="text-xs text-green-accent/70">{t('settings.keySaved', 'Key saved')}</span>
          </div>
        )}
        {whisperNote && <p className="text-[10px] text-theme-text-muted mt-2 italic">{whisperNote}</p>}
      </div>
      <div className="flex items-start gap-2 mt-3 p-3 bg-sky-accent/5 rounded-xl">
        <AlertCircle className="w-4 h-4 text-sky-accent/50 mt-0.5 shrink-0" />
        <p className="text-xs text-theme-text-tertiary leading-relaxed">
          {t(
            'settings.apiPrivacyNote',
            'API keys are stored locally on your device and encrypted. They are never sent to any server other than the respective AI provider.'
          )}
        </p>
      </div>
    </section>
  )
}
