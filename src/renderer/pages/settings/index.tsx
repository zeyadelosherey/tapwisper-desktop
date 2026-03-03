import { type JSX, useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings2, Cpu, Keyboard, Info } from 'lucide-react'
import { updateDirection } from '../../i18n'
import type { Theme, SettingsTab, ShortcutsConfig, LLMProvider, VoiceProvider } from './types'
import { DEFAULT_SHORTCUTS } from './types'
import { DEFAULT_MODELS, DEFAULT_VOICE_MODELS } from './provider-data'
import { GeneralTab } from './general-tab'
import { AIProviderTab } from './ai-provider-tab'
import { ShortcutsTab } from './shortcuts-tab'
import { AboutTab } from './about-tab'

const TABS: { id: SettingsTab; labelKey: string; icon: React.ReactNode }[] = [
  { id: 'general', labelKey: 'settings.tabGeneral', icon: <Settings2 className="w-4 h-4" /> },
  { id: 'ai-provider', labelKey: 'settings.tabAIProvider', icon: <Cpu className="w-4 h-4" /> },
  { id: 'shortcuts', labelKey: 'settings.tabShortcuts', icon: <Keyboard className="w-4 h-4" /> },
  { id: 'about', labelKey: 'settings.tabAbout', icon: <Info className="w-4 h-4" /> }
]

function applyTheme(value: Theme): void {
  if (value === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  } else if (value === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

export function Settings(): JSX.Element {
  const { t, i18n } = useTranslation()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  // General tab state
  const [language, setLanguage] = useState('en')
  const [theme, setTheme] = useState<Theme>('system')
  const [autoLaunch, setAutoLaunch] = useState(false)

  // AI Provider tab state
  const [selectedLLM, setSelectedLLM] = useState<LLMProvider>('gemini')
  const [selectedVoice, setSelectedVoice] = useState<VoiceProvider>('whisper')
  const [models, setModels] = useState<Record<string, string>>(DEFAULT_MODELS)
  const [voiceModels, setVoiceModels] = useState<Record<string, string>>(DEFAULT_VOICE_MODELS)
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({
    gemini: '',
    together: '',
    openai: '',
    claude: '',
    soniox: ''
  })

  // Shortcuts tab state
  const [shortcuts, setShortcuts] = useState<ShortcutsConfig>(DEFAULT_SHORTCUTS)

  // About tab state
  const [platformInfo, setPlatformInfo] = useState<{
    platform: string
    isMac: boolean
    version: string
  } | null>(null)

  // ── Load all config on mount ────────────────────────────────────

  useEffect(() => {
    Promise.all([
      window.tapwisper.store.get('language'),
      window.tapwisper.store.get('theme'),
      window.tapwisper.store.get('autoLaunch'),
      window.tapwisper.platform.info(),
      window.tapwisper.shortcuts.get(),
      window.tapwisper.store.get('aiProvider'),
      window.tapwisper.store.get('voiceProvider'),
      window.tapwisper.store.get('apiKeys'),
      window.tapwisper.store.get('models'),
      window.tapwisper.store.get('voiceModels')
    ]).then(([lang, th, auto, platform, sc, llm, voice, keys, mdls, vMdls]) => {
      if (lang) {
        setLanguage(lang as string)
        i18n.changeLanguage(lang as string)
        updateDirection(lang as string)
      }
      if (th) {
        setTheme(th as Theme)
        applyTheme(th as Theme)
      }
      if (auto !== undefined) setAutoLaunch(auto as boolean)
      setPlatformInfo(platform as { platform: string; isMac: boolean; version: string })
      if (sc) setShortcuts({ ...DEFAULT_SHORTCUTS, ...(sc as ShortcutsConfig) })
      if (llm) setSelectedLLM(llm as LLMProvider)
      if (voice) setSelectedVoice(voice as VoiceProvider)
      if (keys) setApiKeys(keys as Record<string, string>)
      if (mdls) setModels({ ...DEFAULT_MODELS, ...(mdls as Record<string, string>) })
      if (vMdls) setVoiceModels({ ...DEFAULT_VOICE_MODELS, ...(vMdls as Record<string, string>) })
    })
  }, [i18n])

  // Listen for OS theme changes when "system" is selected
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = (): void => {
      if (theme === 'system') applyTheme('system')
    }
    mediaQuery.addEventListener('change', handleSystemThemeChange)
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
  }, [theme])

  // ── General tab handlers ────────────────────────────────────────

  const handleLanguageChange = useCallback(
    (code: string) => {
      setLanguage(code)
      window.tapwisper.store.set('language', code)
      i18n.changeLanguage(code)
      updateDirection(code)
    },
    [i18n]
  )

  const handleThemeChange = useCallback((value: Theme) => {
    setTheme(value)
    window.tapwisper.store.set('theme', value)
    applyTheme(value)
  }, [])

  const handleAutoLaunchChange = useCallback((value: boolean) => {
    setAutoLaunch(value)
    window.tapwisper.store.set('autoLaunch', value)
    window.tapwisper.app.setAutoLaunch(value)
  }, [])

  // ── AI Provider tab handlers ────────────────────────────────────

  const handleSelectLLM = useCallback((provider: LLMProvider) => {
    setSelectedLLM(provider)
    window.tapwisper.store.set('aiProvider', provider)
  }, [])

  const handleSelectVoice = useCallback((provider: VoiceProvider) => {
    setSelectedVoice(provider)
    window.tapwisper.store.set('voiceProvider', provider)
  }, [])

  const handleModelChange = useCallback(
    (provider: string, modelId: string) => {
      const updated = { ...models, [provider]: modelId }
      setModels(updated)
      window.tapwisper.store.set('models', updated)
    },
    [models]
  )

  const handleVoiceModelChange = useCallback(
    (provider: string, modelId: string) => {
      const updated = { ...voiceModels, [provider]: modelId }
      setVoiceModels(updated)
      window.tapwisper.store.set('voiceModels', updated)
    },
    [voiceModels]
  )

  const handleKeyChange = useCallback(
    (provider: string, value: string) => {
      const updated = { ...apiKeys, [provider]: value }
      setApiKeys(updated)
      window.tapwisper.store.set('apiKeys', updated)
    },
    [apiKeys]
  )

  // ── Shortcuts tab handlers ──────────────────────────────────────

  const handleShortcutChange = useCallback(
    (key: keyof ShortcutsConfig, value: string) => {
      const updated = { ...shortcuts, [key]: value }
      setShortcuts(updated)
      window.tapwisper.shortcuts.update(updated)
    },
    [shortcuts]
  )

  const handleResetShortcuts = useCallback(() => {
    window.tapwisper.shortcuts.reset().then((defaults: unknown) => {
      if (defaults) setShortcuts(defaults as ShortcutsConfig)
    })
  }, [])

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="drag-region mb-6">
        <h1 className="text-2xl font-bold text-theme-text">{t('settings.title')}</h1>
        <p className="text-sm text-theme-text-secondary mt-1">{t('settings.subtitle')}</p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-6 mb-8 border-b border-theme-border/30">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 pb-2.5 text-sm font-medium transition-all border-b-2 -mb-px
              ${
                activeTab === tab.id
                  ? 'border-theme-text text-theme-text'
                  : 'border-transparent text-theme-text-secondary hover:text-theme-text'
              }
            `}
          >
            {tab.icon}
            <span className="hidden sm:inline">
              {t(
                tab.labelKey,
                tab.id === 'general'
                  ? 'General'
                  : tab.id === 'ai-provider'
                    ? 'AI Provider'
                    : tab.id === 'shortcuts'
                      ? 'Shortcuts'
                      : 'About'
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'general' && (
        <GeneralTab
          language={language}
          theme={theme}
          autoLaunch={autoLaunch}
          onLanguageChange={handleLanguageChange}
          onThemeChange={handleThemeChange}
          onAutoLaunchChange={handleAutoLaunchChange}
        />
      )}
      {activeTab === 'ai-provider' && (
        <AIProviderTab
          selectedLLM={selectedLLM}
          selectedVoice={selectedVoice}
          models={models}
          voiceModels={voiceModels}
          apiKeys={apiKeys}
          onSelectLLM={handleSelectLLM}
          onSelectVoice={handleSelectVoice}
          onModelChange={handleModelChange}
          onVoiceModelChange={handleVoiceModelChange}
          onKeyChange={handleKeyChange}
        />
      )}
      {activeTab === 'shortcuts' && (
        <ShortcutsTab
          shortcuts={shortcuts}
          onShortcutChange={handleShortcutChange}
          onResetShortcuts={handleResetShortcuts}
        />
      )}
      {activeTab === 'about' && <AboutTab platformInfo={platformInfo} />}
    </div>
  )
}
