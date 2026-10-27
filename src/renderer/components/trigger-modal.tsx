import { useState, useEffect, useCallback } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  X, ChevronLeft, ChevronRight, Search, Bot, Terminal, Keyboard,
  Smartphone, AppWindow, Rocket, Check, Plus, Trash2
} from 'lucide-react'
import type {
  Trigger,
  TriggerActionType,
  TriggerActionConfig,
  WebSearchConfig,
  AIChatConfig,
  TerminalConfig,
  KeyboardConfig,
  AppleShortcutConfig,
  WindowConfig,
  LaunchAppConfig,
  SearchEngine,
  BrowserChoice,
  WindowAction,
  ActionTypeMeta
} from '../models/trigger'
import {
  ACTION_TYPE_META,
  getAvailableActionTypes,
  getDefaultActionConfig
} from '../models/trigger'

const IS_MAC = window.tapwisper.platform.os === 'darwin'

/** Translated label/description/example for an action type (model data stays English) */
function actionTypeText(
  t: TFunction,
  meta: ActionTypeMeta
): { label: string; description: string; example: string } {
  return {
    label: t(`triggerTypes.${meta.id}.label`, meta.label),
    description: t(`triggerTypes.${meta.id}.description`, meta.description),
    example: t(`triggerTypes.${meta.id}.example`, meta.example)
  }
}

function actionTypeLabel(t: TFunction, type: TriggerActionType): string {
  const meta = ACTION_TYPE_META.find((m) => m.id === type)
  return meta ? actionTypeText(t, meta).label : type
}

// ── Props ───────────────────────────────────────────────────────

interface TriggerModalProps {
  trigger: Trigger | null
  onSave: (trigger: Trigger) => void
  onClose: () => void
}

type Step = 'action-type' | 'configure' | 'trigger-phrase'

// ── Action type icons for the grid ──────────────────────────────

const ACTION_ICONS: Record<TriggerActionType, React.ReactNode> = {
  'web-search': <Search className="w-5 h-5" />,
  'ai-chat': <Bot className="w-5 h-5" />,
  'terminal': <Terminal className="w-5 h-5" />,
  'keyboard': <Keyboard className="w-5 h-5" />,
  'apple-shortcut': <Smartphone className="w-5 h-5" />,
  'window': <AppWindow className="w-5 h-5" />,
  'launch-app': <Rocket className="w-5 h-5" />
}

// ── Main Component ──────────────────────────────────────────────

export function TriggerModal({ trigger, onSave, onClose }: TriggerModalProps): JSX.Element {
  const { t } = useTranslation()
  const isEditing = !!trigger
  const [step, setStep] = useState<Step>(isEditing ? 'configure' : 'action-type')
  const [actionType, setActionType] = useState<TriggerActionType>(trigger?.actionType || 'web-search')
  const [actionConfig, setActionConfig] = useState<TriggerActionConfig>(
    trigger?.actionConfig || getDefaultActionConfig('web-search')
  )
  const [triggerPhrase, setTriggerPhrase] = useState(trigger?.triggerPhrase || '')
  const [triggerType, setTriggerType] = useState<'exact' | 'prefix'>(trigger?.triggerType || 'prefix')
  const [name, setName] = useState(trigger?.name || '')

  // Escape closes the dialog
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const handleActionTypeSelect = useCallback((type: TriggerActionType) => {
    setActionType(type)
    setActionConfig(getDefaultActionConfig(type))
    const meta = ACTION_TYPE_META.find((m) => m.id === type)
    setTriggerType(meta?.defaultTriggerType || 'prefix')
    setStep('configure')
  }, [])

  const handleNext = useCallback(() => {
    if (step === 'action-type') return
    if (step === 'configure') {
      setStep('trigger-phrase')
    }
  }, [step])

  const handleBack = useCallback(() => {
    if (step === 'configure' && !isEditing) {
      setStep('action-type')
    } else if (step === 'trigger-phrase') {
      setStep('configure')
    }
  }, [step, isEditing])

  const handleSave = useCallback(() => {
    const finalName = name || `${actionTypeLabel(t, actionType)} - ${triggerPhrase}`

    onSave({
      id: trigger?.id || Date.now().toString(),
      name: finalName,
      triggerPhrase: triggerPhrase.trim().toLowerCase(),
      triggerType,
      actionType,
      actionConfig,
      enabled: trigger?.enabled ?? true,
      createdAt: trigger?.createdAt || Date.now()
    })
  }, [trigger, name, actionType, actionConfig, triggerPhrase, triggerType, onSave, t])

  const isValid = triggerPhrase.trim().length >= 2

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(18_17_16/0.38)] backdrop-blur-[3px] animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trigger-modal-title"
        className="shadow-pop bg-raised border border-hairline rounded-xl w-[600px] max-w-[calc(100vw-32px)] max-h-[85vh] flex flex-col overflow-hidden animate-scale-up"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-theme-border/40">
          <div>
            <h2 id="trigger-modal-title" className="font-display text-[16px] leading-tight text-ink">
              {isEditing
                ? t('triggerModal.editTitle', 'Edit Trigger')
                : t('triggerModal.newTitle', 'New Trigger')}
            </h2>
            <p className="text-xs text-theme-text-muted mt-0.5">
              {step === 'action-type' &&
                t('triggerModal.stepActionType', 'Choose what action this trigger performs')}
              {step === 'configure' &&
                t('triggerModal.stepConfigure', 'Configure the action and set your trigger phrase')}
              {step === 'trigger-phrase' &&
                t('triggerModal.stepPhrase', 'Set the phrase that activates this trigger')}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close', 'Close')}
            title={t('common.close', 'Close')}
            className="icon-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {step === 'action-type' && (
            <ActionTypeStep
              selected={actionType}
              onSelect={handleActionTypeSelect}
            />
          )}
          {step === 'configure' && (
            <ConfigureStep
              actionType={actionType}
              config={actionConfig}
              onChange={setActionConfig}
            />
          )}
          {step === 'trigger-phrase' && (
            <TriggerPhraseStep
              triggerPhrase={triggerPhrase}
              triggerType={triggerType}
              name={name}
              actionType={actionType}
              onPhraseChange={setTriggerPhrase}
              onTypeChange={setTriggerType}
              onNameChange={setName}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-theme-border/40">
          <div>
            {(step === 'configure' || step === 'trigger-phrase') && (
              <button
                onClick={handleBack}
                className="flex items-center gap-1.5 text-sm text-theme-text-secondary hover:text-theme-text transition-colors"
              >
                <ChevronLeft className="w-4 h-4 rtl-flip" />
                {t('common.back', 'Back')}
              </button>
            )}
            {step === 'action-type' && (
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 text-sm text-theme-text-secondary hover:text-theme-text transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                {t('common.cancel', 'Cancel')}
              </button>
            )}
          </div>

          {step === 'configure' && (
            <button
              onClick={handleNext}
              className="btn-primary"
            >
              {t('common.continue', 'Continue')}
              <ChevronRight className="w-4 h-4 rtl-flip" />
            </button>
          )}

          {step === 'trigger-phrase' && (
            <button
              onClick={handleSave}
              disabled={!isValid}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                isValid
                  ? 'bg-theme-text text-theme-bg hover:bg-theme-text/90'
                  : 'bg-theme-surface text-theme-text-muted cursor-not-allowed'
              }`}
            >
              <Check className="w-4 h-4" />
              {isEditing
                ? t('triggerModal.saveChanges', 'Save Changes')
                : t('triggerModal.createTrigger', 'Create Trigger')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Step 1: Action Type Selection ───────────────────────────────

function ActionTypeStep({
  selected,
  onSelect
}: {
  selected: TriggerActionType
  onSelect: (type: TriggerActionType) => void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5">
        {getAvailableActionTypes(window.tapwisper.platform.os).map((meta) => {
          const isActive = selected === meta.id
          const text = actionTypeText(t, meta)
          return (
            <button
              key={meta.id}
              onClick={() => onSelect(meta.id)}
              className={`
                relative flex flex-col items-center text-center p-4 rounded-xl border transition-all
                ${isActive
                  ? 'border-signal bg-signal-tint/40 ring-4 ring-signal/10'
                  : 'border-hairline bg-raised hover:border-hairline-strong'
                }
              `}
            >
              {isActive && (
                <div className="absolute top-2 end-2">
                  <Check className="w-3.5 h-3.5 text-sky-accent" />
                </div>
              )}
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2.5 border ${
                  isActive
                    ? 'border-signal/30 bg-signal-tint text-signal'
                    : 'border-hairline bg-panel text-ink-muted'
                }`}
              >
                {ACTION_ICONS[meta.id]}
              </div>
              <p className="text-[13px] font-semibold text-theme-text">{text.label}</p>
              <p className="text-[11px] text-theme-text-tertiary mt-1 leading-tight line-clamp-2">
                {text.description}
              </p>
              <p className="text-[10px] mt-2 font-mono leading-tight text-ink-soft">
                {text.example}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Step 2: Configure Action ────────────────────────────────────

function ConfigureStep({
  actionType,
  config,
  onChange
}: {
  actionType: TriggerActionType
  config: TriggerActionConfig
  onChange: (config: TriggerActionConfig) => void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div>
      <h3 className="text-sm font-semibold text-theme-text mb-1">
        {t('triggerModal.configureTitle', 'Configure Action')}
      </h3>
      <p className="text-xs text-theme-text-muted mb-5">
        {t('triggerModal.configureSubtitle', 'Set up how this action should work')}
      </p>

      {actionType === 'web-search' && (
        <WebSearchConfigForm
          config={config as WebSearchConfig}
          onChange={onChange}
        />
      )}
      {actionType === 'ai-chat' && (
        <AIChatConfigForm
          config={config as AIChatConfig}
          onChange={onChange}
        />
      )}
      {actionType === 'terminal' && (
        <TerminalConfigForm
          config={config as TerminalConfig}
          onChange={onChange}
        />
      )}
      {actionType === 'keyboard' && (
        <KeyboardConfigForm
          config={config as KeyboardConfig}
          onChange={onChange}
        />
      )}
      {actionType === 'apple-shortcut' && (
        <AppleShortcutConfigForm
          config={config as AppleShortcutConfig}
          onChange={onChange}
        />
      )}
      {actionType === 'window' && (
        <WindowConfigForm
          config={config as WindowConfig}
          onChange={onChange}
        />
      )}
      {actionType === 'launch-app' && (
        <LaunchAppConfigForm
          config={config as LaunchAppConfig}
          onChange={onChange}
        />
      )}
    </div>
  )
}

// ── Step 3: Trigger Phrase ──────────────────────────────────────

function TriggerPhraseStep({
  triggerPhrase,
  triggerType,
  name,
  actionType,
  onPhraseChange,
  onTypeChange,
  onNameChange
}: {
  triggerPhrase: string
  triggerType: 'exact' | 'prefix'
  name: string
  actionType: TriggerActionType
  onPhraseChange: (v: string) => void
  onTypeChange: (v: 'exact' | 'prefix') => void
  onNameChange: (v: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  const isValid = triggerPhrase.trim().length >= 2
  const phrase = triggerPhrase.trim() || t('triggerModal.phraseWord', 'phrase')

  return (
    <div className="space-y-4">
      {/* Example usage */}
      {triggerType === 'prefix' && (
        <div className="bg-theme-surface/30 rounded-xl p-4">
          <p className="text-xs font-medium text-theme-text-muted mb-2">
            {t('triggerModal.exampleUsage', 'Example Usage')}
          </p>
          <p className="text-sm text-sky-accent font-mono">
            {t('common.quoted', '“{{text}}”', {
              text: t('triggerModal.prefixExample', '{{phrase}} [your question or command]', {
                phrase
              })
            })}
          </p>
          <p className="text-xs text-theme-text-muted mt-2">
            {t(
              'triggerModal.prefixExplanation',
              'Start with the trigger phrase, then say your input. Everything after the phrase is passed to the action. Multi-word phrases also work mid-sentence.'
            )}
          </p>
        </div>
      )}

      {triggerType === 'exact' && (
        <div className="bg-theme-surface/30 rounded-xl p-4">
          <p className="text-xs font-medium text-theme-text-muted mb-2">
            {t('triggerModal.exampleUsage', 'Example Usage')}
          </p>
          <p className="text-sm text-sky-accent font-mono">
            {t('common.quoted', '“{{text}}”', { text: phrase })}
          </p>
          <p className="text-xs text-theme-text-muted mt-2">
            {t(
              'triggerModal.exactExplanation',
              'Say only this phrase, e.g. just “open spotify”. The trigger fires only when your whole utterance is the phrase, so it never runs in the middle of normal dictation.'
            )}
          </p>
        </div>
      )}

      {/* Trigger Phrase */}
      <div>
        <label htmlFor="trigger-phrase" className="text-sm font-medium text-theme-text block mb-2">
          {t('triggerModal.phraseLabel', 'Trigger Phrase')}
        </label>
        <p className="text-xs text-theme-text-muted mb-3">
          {t('triggerModal.phraseHint', 'The phrase that activates this trigger when spoken')}
        </p>
        <input
          id="trigger-phrase"
          type="text"
          value={triggerPhrase}
          onChange={(e) => onPhraseChange(e.target.value)}
          placeholder={t('triggerModal.phrasePlaceholder', 'e.g. google, ask ai, open spotify')}
          className="w-full px-3 py-2.5 rounded-lg bg-theme-surface/40 border border-theme-border/30 text-sm text-theme-text placeholder:text-theme-text-muted/50 focus:outline-none focus:border-sky-accent/50 transition-colors"
        />
        {isValid && (
          <div className="flex items-center gap-1.5 mt-2">
            <Check className="w-3.5 h-3.5 text-green-400" />
            <span className="text-xs text-green-400 font-medium">
              {t('triggerModal.validPhrase', 'Valid trigger phrase')}
            </span>
          </div>
        )}
      </div>

      {/* Trigger Type */}
      <div>
        <label className="text-sm font-medium text-theme-text block mb-2">
          {t('triggerModal.typeLabel', 'Trigger Type')}
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => onTypeChange('prefix')}
            className={`flex-1 px-3 py-2.5 rounded-lg border text-sm transition-all ${
              triggerType === 'prefix'
                ? 'border-sky-accent/50 bg-sky-accent/8 text-sky-accent font-medium'
                : 'border-theme-border/30 text-theme-text-secondary hover:border-theme-border/50'
            }`}
          >
            {t('triggerModal.typePrefix', 'Prefix (phrase + speech)')}
          </button>
          <button
            onClick={() => onTypeChange('exact')}
            className={`flex-1 px-3 py-2.5 rounded-lg border text-sm transition-all ${
              triggerType === 'exact'
                ? 'border-sky-accent/50 bg-sky-accent/8 text-sky-accent font-medium'
                : 'border-theme-border/30 text-theme-text-secondary hover:border-theme-border/50'
            }`}
          >
            {t('triggerModal.typeExact', 'Exact (phrase only)')}
          </button>
        </div>
      </div>

      {/* Name (optional) */}
      <div>
        <label htmlFor="trigger-name" className="text-sm font-medium text-theme-text block mb-2">
          {t('triggerModal.nameLabel', 'Name')}{' '}
          <span className="text-theme-text-muted font-normal">
            {t('triggerModal.optional', '(optional)')}
          </span>
        </label>
        <input
          id="trigger-name"
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={`${actionTypeLabel(t, actionType)} - ${triggerPhrase || '...'}`}
          className="w-full px-3 py-2.5 rounded-lg bg-theme-surface/40 border border-theme-border/30 text-sm text-theme-text placeholder:text-theme-text-muted/50 focus:outline-none focus:border-sky-accent/50 transition-colors"
        />
      </div>
    </div>
  )
}

// ── Config Forms ────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return <label className="text-xs font-semibold text-theme-text-secondary uppercase tracking-wide block mb-2">{children}</label>
}

function OptionGroup<T extends string>({
  options,
  value,
  onChange,
  labels
}: {
  options: T[]
  value: T
  onChange: (v: T) => void
  labels?: Record<T, string>
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
            value === opt
              ? 'bg-sky-accent text-white'
              : 'bg-theme-surface/40 text-theme-text-secondary hover:bg-theme-surface/60'
          }`}
        >
          {labels?.[opt] || opt.charAt(0).toUpperCase() + opt.slice(1).replace(/-/g, ' ')}
        </button>
      ))}
    </div>
  )
}

// ── Web Search Config ───────────────────────────────────────────

function WebSearchConfigForm({
  config,
  onChange
}: {
  config: WebSearchConfig
  onChange: (c: TriggerActionConfig) => void
}): JSX.Element {
  const { t } = useTranslation()
  const update = (partial: Partial<WebSearchConfig>) => {
    onChange({ ...config, ...partial })
  }

  return (
    <div className="space-y-3">
      {/* How it works */}
      <div className="bg-theme-surface/30 rounded-xl p-4">
        <p className="text-xs font-medium text-theme-text-muted mb-1">
          {t('triggerModal.howItWorks', 'How it works')}
        </p>
        <p className="text-xs text-theme-text-secondary">
          {t(
            'triggerModal.webSearchHow',
            'Say the trigger phrase followed by your search query. For example, say “Google best coffee shops” to search for “best coffee shops”.'
          )}
        </p>
      </div>

      {/* Search Engine */}
      <div>
        <SectionLabel>{t('triggerModal.searchEngine', 'Search Engine')}</SectionLabel>
        <OptionGroup<SearchEngine>
          options={['google', 'duckduckgo', 'bing', 'custom']}
          value={config.searchEngine}
          onChange={(v) => update({ searchEngine: v })}
          labels={{
            google: 'Google',
            duckduckgo: 'DuckDuckGo',
            bing: 'Bing',
            custom: t('triggerModal.customUrl', 'Custom URL')
          }}
        />
      </div>

      {config.searchEngine === 'custom' && (
        <div>
          <SectionLabel>{t('triggerModal.customSearchUrl', 'Custom Search URL')}</SectionLabel>
          <input
            type="text"
            value={config.customUrl || ''}
            onChange={(e) => update({ customUrl: e.target.value })}
            placeholder="https://example.com/search?q=%s"
            dir="ltr"
            className="w-full px-3 py-2.5 rounded-lg bg-theme-surface/40 border border-theme-border/30 text-sm text-theme-text placeholder:text-theme-text-muted/50 focus:outline-none focus:border-sky-accent/50"
          />
          <p className="text-xs text-theme-text-muted mt-1">
            {t('triggerModal.customUrlHint', 'Use %s as placeholder for the search query')}
          </p>
        </div>
      )}

      {/* Search Query */}
      <div>
        <SectionLabel>{t('triggerModal.searchQuery', 'Search Query')}</SectionLabel>
        <p className="text-xs text-theme-text-muted mb-2">
          {t(
            'triggerModal.searchQueryHint',
            'Build your search query by adding text before or after what you say'
          )}
        </p>
        <div className="grid grid-cols-3 gap-2 items-center">
          <input
            type="text"
            value={config.beforeText || ''}
            onChange={(e) => update({ beforeText: e.target.value })}
            placeholder={t('triggerModal.optionalPlaceholder', 'Optional')}
            aria-label={t('triggerModal.before', 'Before')}
            className="px-3 py-2 rounded-lg bg-theme-surface/40 border border-theme-border/30 text-sm text-theme-text placeholder:text-theme-text-muted/50 focus:outline-none focus:border-sky-accent/50"
          />
          <div className="px-3 py-2 rounded-lg bg-sky-accent/10 border border-sky-accent/30 text-sm text-sky-accent text-center font-medium">
            {t('triggerModal.yourSpeech', 'Your speech')}
          </div>
          <input
            type="text"
            value={config.afterText || ''}
            onChange={(e) => update({ afterText: e.target.value })}
            placeholder={t('triggerModal.optionalPlaceholder', 'Optional')}
            aria-label={t('triggerModal.after', 'After')}
            className="px-3 py-2 rounded-lg bg-theme-surface/40 border border-theme-border/30 text-sm text-theme-text placeholder:text-theme-text-muted/50 focus:outline-none focus:border-sky-accent/50"
          />
        </div>
        <div className="grid grid-cols-3 gap-2 mt-1">
          <span className="text-[10px] text-theme-text-muted text-center">
            {t('triggerModal.before', 'Before')}
          </span>
          <span className="text-[10px] text-theme-text-muted text-center">
            {t('triggerModal.whatYouSay', 'What you say')}
          </span>
          <span className="text-[10px] text-theme-text-muted text-center">
            {t('triggerModal.after', 'After')}
          </span>
        </div>
      </div>

      {/* Quick Presets */}
      <div>
        <p className="text-xs text-theme-text-muted mb-2">
          {t('triggerModal.quickPresets', 'Quick Presets (click to add as “Before” text)')}
        </p>
        <div className="flex flex-wrap gap-2">
          {/* The inserted text is part of the search query, so it stays English */}
          {[
            { id: 'reddit', label: 'Reddit', text: 'reddit ' },
            { id: 'github', label: 'GitHub', text: 'github ' },
            { id: 'stackoverflow', label: 'Stack Overflow', text: 'stack overflow ' },
            { id: 'pdf', label: t('triggerModal.presetPdf', 'PDF Files'), text: 'pdf files ' }
          ].map((preset) => (
            <button
              key={preset.id}
              onClick={() => update({ beforeText: preset.text })}
              className="px-2.5 py-1 rounded-md bg-sky-accent/10 text-xs font-medium text-sky-accent hover:bg-sky-accent/20 transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Browser — choosing a specific browser is only supported on macOS */}
      {IS_MAC && (
        <div>
          <SectionLabel>{t('triggerModal.browser', 'Browser')}</SectionLabel>
          <OptionGroup<BrowserChoice>
            options={['default', 'safari', 'chrome', 'firefox']}
            value={config.browser}
            onChange={(v) => update({ browser: v })}
            labels={{
              default: t('triggerModal.defaultBrowser', 'Default Browser'),
              safari: 'Safari',
              chrome: 'Chrome',
              firefox: 'Firefox'
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── AI Chat Config ──────────────────────────────────────────────

function AIChatConfigForm({
  config,
  onChange
}: {
  config: AIChatConfig
  onChange: (c: TriggerActionConfig) => void
}): JSX.Element {
  const { t } = useTranslation()
  const update = (partial: Partial<AIChatConfig>) => {
    onChange({ ...config, ...partial })
  }

  return (
    <div className="space-y-3">
      {/* AI Provider */}
      <div>
        <SectionLabel>{t('triggerModal.aiProvider', 'AI Provider')}</SectionLabel>
        <p className="text-xs text-theme-text-muted mb-2">
          {t('triggerModal.aiProviderHint', 'Uses your configured API key from Settings')}
        </p>
        <OptionGroup
          options={['gemini', 'together', 'openai', 'claude'] as const}
          value={config.provider}
          onChange={(v) => update({ provider: v as AIChatConfig['provider'] })}
          labels={{ gemini: 'Gemini', together: 'Together AI', openai: 'OpenAI', claude: 'Claude' }}
        />
      </div>

      {/* Response Handling */}
      <div>
        <SectionLabel>{t('triggerModal.responseHandling', 'Response Handling')}</SectionLabel>
        <p className="text-xs text-theme-text-muted mb-2">
          {t('triggerModal.responseHandlingHint', 'How should the AI response be delivered?')}
        </p>
        <div className="space-y-2">
          {[
            {
              id: 'modal' as const,
              label: t('triggerModal.responseModal', 'Show in Panel'),
              desc: t('triggerModal.responseModalDesc', 'Display result in the floating panel')
            },
            {
              id: 'inject' as const,
              label: t('triggerModal.responseInject', 'Inject Text'),
              desc: t(
                'triggerModal.responseInjectDesc',
                'Insert AI response directly at cursor position'
              )
            },
            {
              id: 'clipboard' as const,
              label: t('triggerModal.responseClipboard', 'Copy to Clipboard'),
              desc: t(
                'triggerModal.responseClipboardDesc',
                'Copy response to clipboard for manual pasting'
              )
            }
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => update({ responseHandling: opt.id })}
              className={`w-full text-start px-4 py-3 rounded-xl border transition-all ${
                config.responseHandling === opt.id
                  ? 'border-sky-accent/50 bg-sky-accent/8'
                  : 'border-theme-border/30 hover:border-theme-border/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-theme-text">{opt.label}</p>
                  <p className="text-xs text-theme-text-muted mt-0.5">{opt.desc}</p>
                </div>
                {config.responseHandling === opt.id && (
                  <Check className="w-4 h-4 text-sky-accent shrink-0" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* System Prompt */}
      <div>
        <SectionLabel>{t('triggerModal.systemPrompt', 'System Prompt (optional)')}</SectionLabel>
        <textarea
          value={config.systemPrompt || ''}
          onChange={(e) => update({ systemPrompt: e.target.value })}
          placeholder={t('triggerModal.systemPromptPlaceholder', 'You are a helpful AI assistant...')}
          aria-label={t('triggerModal.systemPrompt', 'System Prompt (optional)')}
          rows={3}
          className="w-full px-3 py-2.5 rounded-lg bg-theme-surface/40 border border-theme-border/30 text-sm text-theme-text placeholder:text-theme-text-muted/50 focus:outline-none focus:border-sky-accent/50 resize-none"
        />
      </div>
    </div>
  )
}

// ── Terminal Config ─────────────────────────────────────────────

function TerminalConfigForm({
  config,
  onChange
}: {
  config: TerminalConfig
  onChange: (c: TriggerActionConfig) => void
}): JSX.Element {
  const { t } = useTranslation()
  const update = (partial: Partial<TerminalConfig>) => {
    onChange({ ...config, ...partial })
  }

  const addCommand = () => {
    update({ commands: [...config.commands, ''] })
  }

  const updateCommand = (index: number, value: string) => {
    const cmds = [...config.commands]
    cmds[index] = value
    update({ commands: cmds })
  }

  const removeCommand = (index: number) => {
    if (config.commands.length <= 1) return
    update({ commands: config.commands.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3">
      {/* Execution Mode */}
      <div>
        <SectionLabel>{t('triggerModal.executionMode', 'Execution Mode')}</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => update({ executionMode: 'background' })}
            className={`px-4 py-3 rounded-xl border text-start transition-all ${
              config.executionMode === 'background'
                ? 'border-sky-accent/50 bg-sky-accent/8'
                : 'border-theme-border/30 hover:border-theme-border/50'
            }`}
          >
            <p className="text-sm font-medium text-theme-text">
              {t('triggerModal.modeBackground', 'Background')}
            </p>
            <p className="text-xs text-theme-text-muted mt-0.5">
              {t('triggerModal.modeBackgroundDesc', 'Runs silently without opening any windows')}
            </p>
          </button>
          <button
            onClick={() => update({ executionMode: 'visual' })}
            className={`px-4 py-3 rounded-xl border text-start transition-all ${
              config.executionMode === 'visual'
                ? 'border-sky-accent/50 bg-sky-accent/8'
                : 'border-theme-border/30 hover:border-theme-border/50'
            }`}
          >
            <p className="text-sm font-medium text-theme-text">
              {t('triggerModal.modeVisual', 'Visual')}
            </p>
            <p className="text-xs text-theme-text-muted mt-0.5">
              {t('triggerModal.modeVisualDesc', 'Shows commands in your terminal app')}
            </p>
          </button>
        </div>
      </div>

      {/* Show Output */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-theme-text">
            {t('triggerModal.showOutput', 'Show output in panel')}
          </p>
          <p className="text-xs text-theme-text-muted">
            {t(
              'triggerModal.showOutputDesc',
              'Show the command output in the floating panel when it finishes'
            )}
          </p>
        </div>
        <button
          onClick={() => update({ showOutput: !config.showOutput })}
          role="switch"
          aria-checked={config.showOutput}
          aria-label={t('triggerModal.showOutput', 'Show output in panel')}
          className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
            config.showOutput ? 'bg-sky-accent' : 'bg-theme-surface/60'
          }`}
        >
          <div
            className={`absolute top-1 start-0 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
              config.showOutput
                ? 'ltr:translate-x-5 rtl:-translate-x-5'
                : 'ltr:translate-x-1 rtl:-translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Commands */}
      <div>
        <SectionLabel>{t('triggerModal.commands', 'Commands')}</SectionLabel>
        <div className="space-y-2">
          {config.commands.map((cmd, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                type="text"
                value={cmd}
                onChange={(e) => updateCommand(idx, e.target.value)}
                placeholder={t('triggerModal.commandPlaceholder', 'Add a command...')}
                aria-label={t('triggerModal.commandLabel', 'Command {{number}}', {
                  number: idx + 1
                })}
                dir="ltr"
                className="flex-1 px-3 py-2.5 rounded-lg bg-theme-surface/40 border border-theme-border/30 text-sm text-theme-text font-mono placeholder:text-theme-text-muted/50 focus:outline-none focus:border-sky-accent/50"
              />
              {config.commands.length > 1 && (
                <button
                  onClick={() => removeCommand(idx)}
                  aria-label={t('triggerModal.removeCommand', 'Remove command')}
                  title={t('triggerModal.removeCommand', 'Remove command')}
                  className="icon-btn h-9 w-9 shrink-0 self-center hover:!text-danger"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={addCommand}
          className="mt-2 text-xs text-sky-accent hover:text-sky-accent/80 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          {t('triggerModal.addCommand', 'Add command')}
        </button>
        <p className="text-xs text-theme-text-muted mt-2">
          <Trans
            i18nKey="triggerModal.speechInputHint"
            defaults="Use <code>$SPEECH_INPUT</code> to access voice input"
            components={{
              code: (
                <code
                  className="px-1 py-0.5 rounded bg-theme-surface/50 font-mono text-[11px]"
                  dir="ltr"
                />
              )
            }}
          />
        </p>
      </div>
    </div>
  )
}

// ── Keyboard Config ─────────────────────────────────────────────

function KeyboardConfigForm({
  config,
  onChange
}: {
  config: KeyboardConfig
  onChange: (c: TriggerActionConfig) => void
}): JSX.Element {
  const { t } = useTranslation()
  const update = (partial: Partial<KeyboardConfig>) => {
    onChange({ ...config, ...partial })
  }

  return (
    <div className="space-y-3">
      <div>
        <SectionLabel>{t('triggerModal.keyboardShortcut', 'Keyboard Shortcut')}</SectionLabel>
        <p className="text-xs text-theme-text-muted mb-2">
          {t(
            'triggerModal.keyboardShortcutHint',
            'Enter the shortcut to simulate (e.g. Cmd+K, Ctrl+Shift+P)'
          )}
        </p>
        <input
          type="text"
          dir="ltr"
          value={config.shortcut}
          onChange={(e) => update({ shortcut: e.target.value })}
          aria-label={t('triggerModal.keyboardShortcut', 'Keyboard Shortcut')}
          placeholder={t('triggerModal.keyboardShortcutPlaceholder', 'e.g. Cmd+K or Ctrl+Shift+P')}
          className="w-full px-3 py-2.5 rounded-lg bg-theme-surface/40 border border-theme-border/30 text-sm text-theme-text font-mono placeholder:text-theme-text-muted/50 focus:outline-none focus:border-sky-accent/50"
        />
      </div>

      <div>
        <SectionLabel>{t('triggerModal.delay', 'Delay (ms)')}</SectionLabel>
        <p className="text-xs text-theme-text-muted mb-2">
          {t('triggerModal.delayHint', 'Optional delay before executing the shortcut')}
        </p>
        <input
          type="number"
          aria-label={t('triggerModal.delay', 'Delay (ms)')}
          value={config.delay || 0}
          onChange={(e) => update({ delay: parseInt(e.target.value) || 0 })}
          min={0}
          max={10000}
          className="w-32 px-3 py-2.5 rounded-lg bg-theme-surface/40 border border-theme-border/30 text-sm text-theme-text focus:outline-none focus:border-sky-accent/50"
        />
      </div>
    </div>
  )
}

// ── Apple Shortcut Config ───────────────────────────────────────

function AppleShortcutConfigForm({
  config,
  onChange
}: {
  config: AppleShortcutConfig
  onChange: (c: TriggerActionConfig) => void
}): JSX.Element {
  const [shortcuts, setShortcuts] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.tapwisper.triggers.listShortcuts()
      .then(setShortcuts)
      .finally(() => setLoading(false))
  }, [])

  const { t } = useTranslation()
  const update = (partial: Partial<AppleShortcutConfig>) => {
    onChange({ ...config, ...partial })
  }

  return (
    <div className="space-y-3">
      <div>
        <SectionLabel>{actionTypeLabel(t, 'apple-shortcut')}</SectionLabel>
        <p className="text-xs text-theme-text-muted mb-2">
          {t(
            'triggerModal.appleShortcutHint',
            'Select a shortcut from your Shortcuts app, or type its name'
          )}
        </p>

        <input
          type="text"
          value={config.shortcutName}
          onChange={(e) => update({ shortcutName: e.target.value })}
          placeholder={t('triggerModal.shortcutNamePlaceholder', 'Type shortcut name...')}
          aria-label={t('triggerModal.shortcutNamePlaceholder', 'Type shortcut name...')}
          className="w-full px-3 py-2.5 rounded-lg bg-theme-surface/40 border border-theme-border/30 text-sm text-theme-text placeholder:text-theme-text-muted/50 focus:outline-none focus:border-sky-accent/50"
        />

        {loading ? (
          <p className="text-xs text-theme-text-muted mt-2">
            {t('triggerModal.loadingShortcuts', 'Loading shortcuts...')}
          </p>
        ) : shortcuts.length > 0 ? (
          <div className="mt-3 max-h-40 overflow-y-auto space-y-1 rounded-lg border border-theme-border/20 p-2">
            {shortcuts
              .filter((s) => !config.shortcutName || s.toLowerCase().includes(config.shortcutName.toLowerCase()))
              .slice(0, 20)
              .map((s) => (
                <button
                  key={s}
                  onClick={() => update({ shortcutName: s })}
                  className={`w-full text-start px-3 py-1.5 rounded-md text-sm transition-colors ${
                    config.shortcutName === s
                      ? 'bg-sky-accent/10 text-sky-accent'
                      : 'text-theme-text-secondary hover:bg-theme-surface/40'
                  }`}
                >
                  {s}
                </button>
              ))}
          </div>
        ) : (
          <p className="text-xs text-theme-text-muted mt-2">
            {t(
              'triggerModal.noShortcuts',
              'No shortcuts found. Make sure you have shortcuts in the Shortcuts app.'
            )}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Window Config ───────────────────────────────────────────────

function WindowLayoutIcon({ action, active }: { action: WindowAction; active: boolean }): JSX.Element {
  const base = active ? 'bg-sky-accent' : 'bg-theme-text-muted/30'
  const inactive = active ? 'bg-sky-accent/20' : 'bg-theme-surface/40'

  const cellClass = (highlighted: boolean): string =>
    `rounded-[2px] transition-colors ${highlighted ? base : inactive}`

  switch (action) {
    case 'left-half':
      return (
        <div className="w-8 h-6 grid grid-cols-2 gap-0.5">
          <div className={cellClass(true)} />
          <div className={cellClass(false)} />
        </div>
      )
    case 'right-half':
      return (
        <div className="w-8 h-6 grid grid-cols-2 gap-0.5">
          <div className={cellClass(false)} />
          <div className={cellClass(true)} />
        </div>
      )
    case 'top-half':
      return (
        <div className="w-8 h-6 grid grid-rows-2 gap-0.5">
          <div className={cellClass(true)} />
          <div className={cellClass(false)} />
        </div>
      )
    case 'bottom-half':
      return (
        <div className="w-8 h-6 grid grid-rows-2 gap-0.5">
          <div className={cellClass(false)} />
          <div className={cellClass(true)} />
        </div>
      )
    case 'top-left-quarter':
      return (
        <div className="w-8 h-6 grid grid-cols-2 grid-rows-2 gap-0.5">
          <div className={cellClass(true)} />
          <div className={cellClass(false)} />
          <div className={cellClass(false)} />
          <div className={cellClass(false)} />
        </div>
      )
    case 'top-right-quarter':
      return (
        <div className="w-8 h-6 grid grid-cols-2 grid-rows-2 gap-0.5">
          <div className={cellClass(false)} />
          <div className={cellClass(true)} />
          <div className={cellClass(false)} />
          <div className={cellClass(false)} />
        </div>
      )
    case 'bottom-left-quarter':
      return (
        <div className="w-8 h-6 grid grid-cols-2 grid-rows-2 gap-0.5">
          <div className={cellClass(false)} />
          <div className={cellClass(false)} />
          <div className={cellClass(true)} />
          <div className={cellClass(false)} />
        </div>
      )
    case 'bottom-right-quarter':
      return (
        <div className="w-8 h-6 grid grid-cols-2 grid-rows-2 gap-0.5">
          <div className={cellClass(false)} />
          <div className={cellClass(false)} />
          <div className={cellClass(false)} />
          <div className={cellClass(true)} />
        </div>
      )
    case 'center':
      return (
        <div className="w-8 h-6 flex items-center justify-center">
          <div className={`w-5 h-4 rounded-[2px] transition-colors ${base}`} />
        </div>
      )
    case 'maximize':
      return (
        <div className={`w-8 h-6 rounded-[2px] transition-colors ${base}`} />
      )
    case 'fullscreen':
      return (
        <div className={`w-8 h-6 rounded-[2px] transition-colors ${base} ring-1 ring-inset ${active ? 'ring-sky-accent/50' : 'ring-theme-text-muted/20'}`} />
      )
    default:
      return <div className="w-8 h-6" />
  }
}

function WindowConfigForm({
  config,
  onChange
}: {
  config: WindowConfig
  onChange: (c: TriggerActionConfig) => void
}): JSX.Element {
  const { t } = useTranslation()
  const update = (partial: Partial<WindowConfig>) => {
    onChange({ ...config, ...partial })
  }

  // Screen areas are physical, so left/right stay left/right in RTL too
  const actions: { id: WindowAction; label: string; desc: string }[] = [
    {
      id: 'left-half',
      label: t('triggerModal.window.leftHalf', 'Left Half'),
      desc: t('triggerModal.window.leftHalfDesc', 'Snap to left 50% of screen')
    },
    {
      id: 'right-half',
      label: t('triggerModal.window.rightHalf', 'Right Half'),
      desc: t('triggerModal.window.rightHalfDesc', 'Snap to right 50% of screen')
    },
    {
      id: 'top-half',
      label: t('triggerModal.window.topHalf', 'Top Half'),
      desc: t('triggerModal.window.topHalfDesc', 'Snap to top 50% of screen')
    },
    {
      id: 'bottom-half',
      label: t('triggerModal.window.bottomHalf', 'Bottom Half'),
      desc: t('triggerModal.window.bottomHalfDesc', 'Snap to bottom 50% of screen')
    },
    {
      id: 'top-left-quarter',
      label: t('triggerModal.window.topLeftQuarter', 'Top Left Quarter'),
      desc: t('triggerModal.window.topLeftQuarterDesc', 'Snap to top-left 25% corner')
    },
    {
      id: 'top-right-quarter',
      label: t('triggerModal.window.topRightQuarter', 'Top Right Quarter'),
      desc: t('triggerModal.window.topRightQuarterDesc', 'Snap to top-right 25% corner')
    },
    {
      id: 'bottom-left-quarter',
      label: t('triggerModal.window.bottomLeftQuarter', 'Bottom Left Quarter'),
      desc: t('triggerModal.window.bottomLeftQuarterDesc', 'Snap to bottom-left 25% corner')
    },
    {
      id: 'bottom-right-quarter',
      label: t('triggerModal.window.bottomRightQuarter', 'Bottom Right Quarter'),
      desc: t('triggerModal.window.bottomRightQuarterDesc', 'Snap to bottom-right 25% corner')
    },
    {
      id: 'center',
      label: t('triggerModal.window.center', 'Center'),
      desc: t('triggerModal.window.centerDesc', 'Center on screen (keeps current size)')
    },
    {
      id: 'maximize',
      label: t('triggerModal.window.maximize', 'Maximize'),
      desc: t('triggerModal.window.maximizeDesc', 'Fill entire screen (respects menu bar)')
    },
    {
      id: 'fullscreen',
      label: t('triggerModal.window.fullscreen', 'Fullscreen'),
      desc: t('triggerModal.window.fullscreenDesc', 'Enter macOS fullscreen mode')
    }
  ]

  return (
    <div className="space-y-3">
      {/* How it works */}
      <div className="bg-theme-surface/30 rounded-xl p-4">
        <p className="text-xs font-medium text-theme-text-muted mb-1">
          {t('triggerModal.howItWorks', 'How it works')}
        </p>
        <p className="text-xs text-theme-text-secondary">
          {t(
            'triggerModal.windowHow',
            'Saying the trigger phrase moves the frontmost window to the layout you pick below. For example, a “window left” trigger for the left half and a “window full” trigger for fullscreen.'
          )}
        </p>
      </div>

      <div>
        <SectionLabel>{t('triggerModal.windowManagement', 'Window Management')}</SectionLabel>
        <p className="text-xs text-theme-text-muted mb-3">
          {t('triggerModal.windowManagementHint', 'Select which layout this trigger will apply')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {actions.map((a) => {
            const isActive = config.action === a.id
            return (
              <button
                key={a.id}
                onClick={() => update({ action: a.id })}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl border text-start transition-all ${
                  isActive
                    ? 'border-sky-accent/50 bg-sky-accent/8'
                    : 'border-theme-border/30 hover:border-theme-border/50'
                }`}
              >
                <WindowLayoutIcon action={a.id} active={isActive} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-theme-text">{a.label}</p>
                  <p className="text-[11px] text-theme-text-muted mt-0.5 leading-tight">{a.desc}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Launch App Config ───────────────────────────────────────────

function LaunchAppConfigForm({
  config,
  onChange
}: {
  config: LaunchAppConfig
  onChange: (c: TriggerActionConfig) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [apps, setApps] = useState<{ name: string; path: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    window.tapwisper.triggers.listApps()
      .then(setApps)
      .finally(() => setLoading(false))
  }, [])

  const update = (partial: Partial<LaunchAppConfig>) => {
    onChange({ ...config, ...partial })
  }

  const filteredApps = apps.filter((a) =>
    !filter || a.name.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="space-y-3">
      <div>
        <SectionLabel>{t('triggerModal.application', 'Application')}</SectionLabel>
        <p className="text-xs text-theme-text-muted mb-2">
          {t('triggerModal.applicationHint', 'Select an application to launch or type its name')}
        </p>

        <input
          type="text"
          value={config.appName}
          onChange={(e) => {
            setFilter(e.target.value)
            update({ appName: e.target.value, appPath: '' })
          }}
          placeholder={t('triggerModal.searchApps', 'Search apps...')}
          aria-label={t('triggerModal.searchApps', 'Search apps...')}
          className="w-full px-3 py-2.5 rounded-lg bg-theme-surface/40 border border-theme-border/30 text-sm text-theme-text placeholder:text-theme-text-muted/50 focus:outline-none focus:border-sky-accent/50"
        />

        {loading ? (
          <p className="text-xs text-theme-text-muted mt-2">
            {t('triggerModal.loadingApps', 'Loading installed apps...')}
          </p>
        ) : (
          <div className="mt-3 max-h-48 overflow-y-auto space-y-0.5 rounded-lg border border-theme-border/20 p-2">
            {filteredApps.slice(0, 30).map((app) => (
              <button
                key={app.path}
                onClick={() => {
                  update({ appName: app.name, appPath: app.path })
                  setFilter(app.name)
                }}
                className={`w-full text-start px-3 py-2 rounded-md text-sm transition-colors ${
                  config.appName === app.name
                    ? 'bg-sky-accent/10 text-sky-accent'
                    : 'text-theme-text-secondary hover:bg-theme-surface/40'
                }`}
              >
                {app.name}
              </button>
            ))}
            {filteredApps.length === 0 && (
              <p className="text-xs text-theme-text-muted text-center py-4">
                {t('triggerModal.noApps', 'No matching apps found')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
