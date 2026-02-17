import { useState, useEffect, useCallback } from 'react'
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
  WindowAction
} from '../models/trigger'
import { ACTION_TYPE_META, getDefaultActionConfig } from '../models/trigger'

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

const ACTION_COLORS: Record<TriggerActionType, string> = {
  'web-search': '#7EB6E0',
  'ai-chat': '#B07CD8',
  'terminal': '#4DC778',
  'keyboard': '#E8A838',
  'apple-shortcut': '#E86B6B',
  'window': '#6BB5E8',
  'launch-app': '#E8A838'
}

// ── Main Component ──────────────────────────────────────────────

export function TriggerModal({ trigger, onSave, onClose }: TriggerModalProps): JSX.Element {
  const isEditing = !!trigger
  const [step, setStep] = useState<Step>(isEditing ? 'configure' : 'action-type')
  const [actionType, setActionType] = useState<TriggerActionType>(trigger?.actionType || 'web-search')
  const [actionConfig, setActionConfig] = useState<TriggerActionConfig>(
    trigger?.actionConfig || getDefaultActionConfig('web-search')
  )
  const [triggerPhrase, setTriggerPhrase] = useState(trigger?.triggerPhrase || '')
  const [triggerType, setTriggerType] = useState<'exact' | 'prefix'>(trigger?.triggerType || 'prefix')
  const [name, setName] = useState(trigger?.name || '')

  // Auto-set name from trigger phrase if not manually set
  useEffect(() => {
    if (!isEditing && triggerPhrase && !name) {
      // Will be set on save
    }
  }, [triggerPhrase, name, isEditing])

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
    const finalName = name || `${ACTION_TYPE_META.find((m) => m.id === actionType)?.label} - ${triggerPhrase}`

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
  }, [trigger, name, actionType, actionConfig, triggerPhrase, triggerType, onSave])

  const isValid = triggerPhrase.trim().length >= 2

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0D0D0D] border border-white/[0.06] rounded-2xl shadow-2xl w-[580px] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {isEditing ? 'Edit Trigger' : 'New Trigger'}
            </h2>
            <p className="text-xs text-white/30 mt-0.5">
              {step === 'action-type' && 'Choose what action this trigger performs'}
              {step === 'configure' && 'Configure the action and set your trigger phrase'}
              {step === 'trigger-phrase' && 'Set the phrase that activates this trigger'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center"
          >
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
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
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06]">
          <div>
            {(step === 'configure' || step === 'trigger-phrase') && (
              <button
                onClick={handleBack}
                className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
            {step === 'action-type' && (
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            )}
          </div>

          {step === 'configure' && (
            <button
              onClick={handleNext}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-[#0D0D0D] text-sm font-semibold hover:bg-white/90 transition-all"
            >
              Continue
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {step === 'trigger-phrase' && (
            <button
              onClick={handleSave}
              disabled={!isValid}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                isValid
                  ? 'bg-white text-[#0D0D0D] hover:bg-white/90'
                  : 'bg-white/10 text-white/30 cursor-not-allowed'
              }`}
            >
              <Check className="w-4 h-4" />
              {isEditing ? 'Save Changes' : 'Create Trigger'}
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
  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5">
        {ACTION_TYPE_META.map((meta) => {
          const isActive = selected === meta.id
          const color = ACTION_COLORS[meta.id]
          return (
            <button
              key={meta.id}
              onClick={() => onSelect(meta.id)}
              className={`
                relative flex flex-col items-center text-center p-4 rounded-xl border transition-all
                ${isActive
                  ? 'border-sky-accent/50 bg-[#111111]'
                  : 'border-white/[0.04] bg-[#080808] hover:border-white/[0.08] hover:bg-[#0F0F0F]'
                }
              `}
            >
              {isActive && (
                <div className="absolute top-2 right-2">
                  <Check className="w-3.5 h-3.5 text-sky-accent" />
                </div>
              )}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-2.5"
                style={{ backgroundColor: `${color}15` }}
              >
                <span style={{ color }}>{ACTION_ICONS[meta.id]}</span>
              </div>
              <p className="text-[13px] font-semibold text-white">{meta.label}</p>
              <p className="text-[11px] text-white/40 mt-1 leading-tight line-clamp-2">{meta.description}</p>
              <p className="text-[10px] mt-2 font-mono leading-tight" style={{ color: `${color}99` }}>
                {meta.example}
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
  return (
    <div>
      <h3 className="text-sm font-semibold text-theme-text mb-1">Configure Action</h3>
      <p className="text-xs text-theme-text-muted mb-5">
        Set up how this action should work
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
  const isValid = triggerPhrase.trim().length >= 2

  const meta = ACTION_TYPE_META.find((m) => m.id === actionType)

  return (
    <div className="space-y-6">
      {/* Example usage */}
      {triggerType === 'prefix' && (
        <div className="bg-theme-surface/30 rounded-xl p-4">
          <p className="text-xs font-medium text-theme-text-muted mb-2">Example Usage</p>
          <p className="text-sm text-sky-accent font-mono">
            &ldquo;{triggerPhrase || 'phrase'} [your question or command]&rdquo;
          </p>
          <p className="text-xs text-theme-text-muted mt-2">
            Everything after the trigger phrase will be passed as input. This is a prefix trigger — say the wake word followed by your input.
          </p>
        </div>
      )}

      {triggerType === 'exact' && (
        <div className="bg-theme-surface/30 rounded-xl p-4">
          <p className="text-xs font-medium text-theme-text-muted mb-2">Example Usage</p>
          <p className="text-sm text-sky-accent font-mono">
            &ldquo;Could you {triggerPhrase || 'phrase'} about this?&rdquo;
          </p>
          <p className="text-xs text-theme-text-muted mt-2">
            Say this phrase anywhere in your sentence. The entire message will be passed to the action.
          </p>
        </div>
      )}

      {/* Trigger Phrase */}
      <div>
        <label className="text-sm font-medium text-theme-text block mb-2">
          Trigger Phrase
        </label>
        <p className="text-xs text-theme-text-muted mb-3">
          The phrase that activates this trigger when spoken
        </p>
        <input
          type="text"
          value={triggerPhrase}
          onChange={(e) => onPhraseChange(e.target.value)}
          placeholder="e.g. google, ask ai, open spotify"
          className="w-full px-3 py-2.5 rounded-lg bg-theme-surface/40 border border-theme-border/30 text-sm text-theme-text placeholder:text-theme-text-muted/50 focus:outline-none focus:border-sky-accent/50 transition-colors"
        />
        {isValid && (
          <div className="flex items-center gap-1.5 mt-2">
            <Check className="w-3.5 h-3.5 text-green-400" />
            <span className="text-xs text-green-400 font-medium">Valid trigger phrase</span>
          </div>
        )}
      </div>

      {/* Trigger Type */}
      <div>
        <label className="text-sm font-medium text-theme-text block mb-2">
          Trigger Type
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
            Prefix (phrase + speech)
          </button>
          <button
            onClick={() => onTypeChange('exact')}
            className={`flex-1 px-3 py-2.5 rounded-lg border text-sm transition-all ${
              triggerType === 'exact'
                ? 'border-sky-accent/50 bg-sky-accent/8 text-sky-accent font-medium'
                : 'border-theme-border/30 text-theme-text-secondary hover:border-theme-border/50'
            }`}
          >
            Exact (phrase only)
          </button>
        </div>
      </div>

      {/* Name (optional) */}
      <div>
        <label className="text-sm font-medium text-theme-text block mb-2">
          Name <span className="text-theme-text-muted font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={`${meta?.label || 'Trigger'} - ${triggerPhrase || '...'}`}
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
  const update = (partial: Partial<WebSearchConfig>) => {
    onChange({ ...config, ...partial })
  }

  return (
    <div className="space-y-5">
      {/* How it works */}
      <div className="bg-theme-surface/30 rounded-xl p-4">
        <p className="text-xs font-medium text-theme-text-muted mb-1">How it works</p>
        <p className="text-xs text-theme-text-secondary">
          Say the trigger phrase followed by your search query. For example, say &ldquo;Google best coffee shops&rdquo; to search for &ldquo;best coffee shops&rdquo;.
        </p>
      </div>

      {/* Search Engine */}
      <div>
        <SectionLabel>Search Engine</SectionLabel>
        <OptionGroup<SearchEngine>
          options={['google', 'duckduckgo', 'bing', 'custom']}
          value={config.searchEngine}
          onChange={(v) => update({ searchEngine: v })}
          labels={{ google: 'Google', duckduckgo: 'DuckDuckGo', bing: 'Bing', custom: 'Custom URL' }}
        />
      </div>

      {config.searchEngine === 'custom' && (
        <div>
          <SectionLabel>Custom Search URL</SectionLabel>
          <input
            type="text"
            value={config.customUrl || ''}
            onChange={(e) => update({ customUrl: e.target.value })}
            placeholder="https://example.com/search?q=%s"
            className="w-full px-3 py-2.5 rounded-lg bg-theme-surface/40 border border-theme-border/30 text-sm text-theme-text placeholder:text-theme-text-muted/50 focus:outline-none focus:border-sky-accent/50"
          />
          <p className="text-xs text-theme-text-muted mt-1">Use %s as placeholder for the search query</p>
        </div>
      )}

      {/* Search Query */}
      <div>
        <SectionLabel>Search Query</SectionLabel>
        <p className="text-xs text-theme-text-muted mb-2">Build your search query by adding text before or after what you say</p>
        <div className="grid grid-cols-3 gap-2 items-center">
          <input
            type="text"
            value={config.beforeText || ''}
            onChange={(e) => update({ beforeText: e.target.value })}
            placeholder="Optional"
            className="px-3 py-2 rounded-lg bg-theme-surface/40 border border-theme-border/30 text-sm text-theme-text placeholder:text-theme-text-muted/50 focus:outline-none focus:border-sky-accent/50"
          />
          <div className="px-3 py-2 rounded-lg bg-sky-accent/10 border border-sky-accent/30 text-sm text-sky-accent text-center font-medium">
            Your speech
          </div>
          <input
            type="text"
            value={config.afterText || ''}
            onChange={(e) => update({ afterText: e.target.value })}
            placeholder="Optional"
            className="px-3 py-2 rounded-lg bg-theme-surface/40 border border-theme-border/30 text-sm text-theme-text placeholder:text-theme-text-muted/50 focus:outline-none focus:border-sky-accent/50"
          />
        </div>
        <div className="grid grid-cols-3 gap-2 mt-1">
          <span className="text-[10px] text-theme-text-muted text-center">Before</span>
          <span className="text-[10px] text-theme-text-muted text-center">What you say</span>
          <span className="text-[10px] text-theme-text-muted text-center">After</span>
        </div>
      </div>

      {/* Quick Presets */}
      <div>
        <p className="text-xs text-theme-text-muted mb-2">Quick Presets (click to add as &ldquo;Before&rdquo; text)</p>
        <div className="flex flex-wrap gap-2">
          {['Reddit', 'GitHub', 'Stack Overflow', 'PDF Files'].map((preset) => (
            <button
              key={preset}
              onClick={() => update({ beforeText: preset.toLowerCase() + ' ' })}
              className="px-2.5 py-1 rounded-md bg-sky-accent/10 text-xs font-medium text-sky-accent hover:bg-sky-accent/20 transition-colors"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Browser */}
      <div>
        <SectionLabel>Browser</SectionLabel>
        <OptionGroup<BrowserChoice>
          options={['default', 'safari', 'chrome', 'firefox']}
          value={config.browser}
          onChange={(v) => update({ browser: v })}
          labels={{ default: 'Default Browser', safari: 'Safari', chrome: 'Chrome', firefox: 'Firefox' }}
        />
      </div>
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
  const update = (partial: Partial<AIChatConfig>) => {
    onChange({ ...config, ...partial })
  }

  return (
    <div className="space-y-5">
      {/* AI Provider */}
      <div>
        <SectionLabel>AI Provider</SectionLabel>
        <p className="text-xs text-theme-text-muted mb-2">Uses your configured API key from Settings</p>
        <OptionGroup
          options={['gemini', 'together', 'openai', 'claude'] as const}
          value={config.provider}
          onChange={(v) => update({ provider: v as AIChatConfig['provider'] })}
          labels={{ gemini: 'Gemini', together: 'Together AI', openai: 'OpenAI', claude: 'Claude' }}
        />
      </div>

      {/* Response Handling */}
      <div>
        <SectionLabel>Response Handling</SectionLabel>
        <p className="text-xs text-theme-text-muted mb-2">How should the AI response be delivered?</p>
        <div className="space-y-2">
          {([
            { id: 'modal' as const, label: 'Show in Panel', desc: 'Display result in the floating panel' },
            { id: 'inject' as const, label: 'Inject Text', desc: 'Insert AI response directly at cursor position' },
            { id: 'clipboard' as const, label: 'Copy to Clipboard', desc: 'Copy response to clipboard for manual pasting' }
          ]).map((opt) => (
            <button
              key={opt.id}
              onClick={() => update({ responseHandling: opt.id })}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
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
        <SectionLabel>System Prompt (optional)</SectionLabel>
        <textarea
          value={config.systemPrompt || ''}
          onChange={(e) => update({ systemPrompt: e.target.value })}
          placeholder="You are a helpful AI assistant..."
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
    <div className="space-y-5">
      {/* Execution Mode */}
      <div>
        <SectionLabel>Execution Mode</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => update({ executionMode: 'background' })}
            className={`px-4 py-3 rounded-xl border text-left transition-all ${
              config.executionMode === 'background'
                ? 'border-sky-accent/50 bg-sky-accent/8'
                : 'border-theme-border/30 hover:border-theme-border/50'
            }`}
          >
            <p className="text-sm font-medium text-theme-text">Background</p>
            <p className="text-xs text-theme-text-muted mt-0.5">Runs silently without opening any windows</p>
          </button>
          <button
            onClick={() => update({ executionMode: 'visual' })}
            className={`px-4 py-3 rounded-xl border text-left transition-all ${
              config.executionMode === 'visual'
                ? 'border-sky-accent/50 bg-sky-accent/8'
                : 'border-theme-border/30 hover:border-theme-border/50'
            }`}
          >
            <p className="text-sm font-medium text-theme-text">Visual</p>
            <p className="text-xs text-theme-text-muted mt-0.5">Shows commands in your terminal app</p>
          </button>
        </div>
      </div>

      {/* Show Output */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-theme-text">Show output in panel</p>
          <p className="text-xs text-theme-text-muted">Stream command output to the floating bar while executing</p>
        </div>
        <button
          onClick={() => update({ showOutput: !config.showOutput })}
          className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
            config.showOutput ? 'bg-sky-accent' : 'bg-theme-surface/60'
          }`}
        >
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
            config.showOutput ? 'translate-x-5' : 'translate-x-1'
          }`} />
        </button>
      </div>

      {/* Commands */}
      <div>
        <SectionLabel>Commands</SectionLabel>
        <div className="space-y-2">
          {config.commands.map((cmd, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                type="text"
                value={cmd}
                onChange={(e) => updateCommand(idx, e.target.value)}
                placeholder="Add a command..."
                className="flex-1 px-3 py-2.5 rounded-lg bg-theme-surface/40 border border-theme-border/30 text-sm text-theme-text font-mono placeholder:text-theme-text-muted/50 focus:outline-none focus:border-sky-accent/50"
              />
              {config.commands.length > 1 && (
                <button
                  onClick={() => removeCommand(idx)}
                  className="w-9 h-9 rounded-lg hover:bg-red-500/10 flex items-center justify-center shrink-0 self-center"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
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
          Add command
        </button>
        <p className="text-xs text-theme-text-muted mt-2">
          Use <code className="px-1 py-0.5 rounded bg-theme-surface/50 font-mono text-[11px]">$SPEECH_INPUT</code> to access voice input
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
  const update = (partial: Partial<KeyboardConfig>) => {
    onChange({ ...config, ...partial })
  }

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Keyboard Shortcut</SectionLabel>
        <p className="text-xs text-theme-text-muted mb-2">
          Enter the shortcut to simulate (e.g. Cmd+K, Ctrl+Shift+P)
        </p>
        <input
          type="text"
          value={config.shortcut}
          onChange={(e) => update({ shortcut: e.target.value })}
          placeholder="e.g. Cmd+K or Ctrl+Shift+P"
          className="w-full px-3 py-2.5 rounded-lg bg-theme-surface/40 border border-theme-border/30 text-sm text-theme-text font-mono placeholder:text-theme-text-muted/50 focus:outline-none focus:border-sky-accent/50"
        />
      </div>

      <div>
        <SectionLabel>Delay (ms)</SectionLabel>
        <p className="text-xs text-theme-text-muted mb-2">Optional delay before executing the shortcut</p>
        <input
          type="number"
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

  const update = (partial: Partial<AppleShortcutConfig>) => {
    onChange({ ...config, ...partial })
  }

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Apple Shortcut</SectionLabel>
        <p className="text-xs text-theme-text-muted mb-2">
          Select a shortcut from your Shortcuts app, or type its name
        </p>

        <input
          type="text"
          value={config.shortcutName}
          onChange={(e) => update({ shortcutName: e.target.value })}
          placeholder="Type shortcut name..."
          className="w-full px-3 py-2.5 rounded-lg bg-theme-surface/40 border border-theme-border/30 text-sm text-theme-text placeholder:text-theme-text-muted/50 focus:outline-none focus:border-sky-accent/50"
        />

        {loading ? (
          <p className="text-xs text-theme-text-muted mt-2">Loading shortcuts...</p>
        ) : shortcuts.length > 0 ? (
          <div className="mt-3 max-h-40 overflow-y-auto space-y-1 rounded-lg border border-theme-border/20 p-2">
            {shortcuts
              .filter((s) => !config.shortcutName || s.toLowerCase().includes(config.shortcutName.toLowerCase()))
              .slice(0, 20)
              .map((s) => (
                <button
                  key={s}
                  onClick={() => update({ shortcutName: s })}
                  className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
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
            No shortcuts found. Make sure you have shortcuts in the Shortcuts app.
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
  const update = (partial: Partial<WindowConfig>) => {
    onChange({ ...config, ...partial })
  }

  const actions: { id: WindowAction; label: string; desc: string }[] = [
    { id: 'left-half', label: 'Left Half', desc: 'Snap to left 50% of screen' },
    { id: 'right-half', label: 'Right Half', desc: 'Snap to right 50% of screen' },
    { id: 'top-half', label: 'Top Half', desc: 'Snap to top 50% of screen' },
    { id: 'bottom-half', label: 'Bottom Half', desc: 'Snap to bottom 50% of screen' },
    { id: 'top-left-quarter', label: 'Top Left Quarter', desc: 'Snap to top-left 25% corner' },
    { id: 'top-right-quarter', label: 'Top Right Quarter', desc: 'Snap to top-right 25% corner' },
    { id: 'bottom-left-quarter', label: 'Bottom Left Quarter', desc: 'Snap to bottom-left 25% corner' },
    { id: 'bottom-right-quarter', label: 'Bottom Right Quarter', desc: 'Snap to bottom-right 25% corner' },
    { id: 'center', label: 'Center', desc: 'Center on screen (keeps current size)' },
    { id: 'maximize', label: 'Maximize', desc: 'Fill entire screen (respects menu bar)' },
    { id: 'fullscreen', label: 'Fullscreen', desc: 'Enter macOS fullscreen mode' }
  ]

  return (
    <div className="space-y-5">
      {/* How it works */}
      <div className="bg-theme-surface/30 rounded-xl p-4">
        <p className="text-xs font-medium text-theme-text-muted mb-1">How it works</p>
        <p className="text-xs text-theme-text-secondary">
          This trigger will position the frontmost window to a predefined layout. For example, if your
          trigger is &ldquo;window&rdquo;, saying &ldquo;window left&rdquo; positions to left half, &ldquo;window right&rdquo; to right half,
          &ldquo;window full&rdquo; toggles fullscreen, etc.
        </p>
      </div>

      <div>
        <SectionLabel>Window Management</SectionLabel>
        <p className="text-xs text-theme-text-muted mb-3">Select which layout this trigger will apply</p>
        <div className="grid grid-cols-2 gap-2">
          {actions.map((a) => {
            const isActive = config.action === a.id
            return (
              <button
                key={a.id}
                onClick={() => update({ action: a.id })}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all ${
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
    <div className="space-y-5">
      <div>
        <SectionLabel>Application</SectionLabel>
        <p className="text-xs text-theme-text-muted mb-2">
          Select an application to launch or type its name
        </p>

        <input
          type="text"
          value={config.appName}
          onChange={(e) => {
            setFilter(e.target.value)
            update({ appName: e.target.value, appPath: '' })
          }}
          placeholder="Search apps..."
          className="w-full px-3 py-2.5 rounded-lg bg-theme-surface/40 border border-theme-border/30 text-sm text-theme-text placeholder:text-theme-text-muted/50 focus:outline-none focus:border-sky-accent/50"
        />

        {loading ? (
          <p className="text-xs text-theme-text-muted mt-2">Loading installed apps...</p>
        ) : (
          <div className="mt-3 max-h-48 overflow-y-auto space-y-0.5 rounded-lg border border-theme-border/20 p-2">
            {filteredApps.slice(0, 30).map((app) => (
              <button
                key={app.path}
                onClick={() => {
                  update({ appName: app.name, appPath: app.path })
                  setFilter(app.name)
                }}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  config.appName === app.name
                    ? 'bg-sky-accent/10 text-sky-accent'
                    : 'text-theme-text-secondary hover:bg-theme-surface/40'
                }`}
              >
                {app.name}
              </button>
            ))}
            {filteredApps.length === 0 && (
              <p className="text-xs text-theme-text-muted text-center py-4">No matching apps found</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
