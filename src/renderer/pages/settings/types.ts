import type { LLMProvider, VoiceProvider } from '../../constants/providers'

export type Theme = 'system' | 'dark' | 'light'
export type SettingsTab = 'general' | 'ai-provider' | 'shortcuts' | 'about'
export type ProviderSubTab = 'ai' | 'transcription'

export interface ShortcutsConfig {
  record: string
}

export const DEFAULT_SHORTCUTS: ShortcutsConfig = {
  record: 'Option+Space'
}

export const LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' }
]

export type { LLMProvider, VoiceProvider }
