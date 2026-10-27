import Store from 'electron-store'
import { safeStorage } from 'electron'

export interface TriggerEntry {
  id: string
  name: string
  triggerPhrase: string
  triggerType: 'exact' | 'prefix'
  actionType: string
  actionConfig: Record<string, unknown>
  enabled: boolean
  createdAt: number
}

export interface AppConfig {
  // AI Provider settings
  aiProvider: 'gemini' | 'together' | 'openai' | 'claude'
  voiceProvider: 'whisper' | 'openai-whisper' | 'soniox'

  // API Keys
  apiKeys: {
    gemini: string
    together: string
    openai: string
    claude: string
    soniox: string
  }

  // Models
  models: {
    gemini: string
    together: string
    openai: string
    claude: string
  }

  // Voice Models
  voiceModels: {
    whisper: string
    'openai-whisper': string
    soniox: string
  }

  // Actions configuration
  actions: ActionCategory[]

  // App settings
  /** UI language (i18n). Not used for speech recognition — see speechLanguage. */
  language: string
  theme: 'system' | 'dark' | 'light'
  autoLaunch: boolean

  // Speech recognition
  /**
   * ISO-639-1 codes of the languages the user dictates in. Empty = auto-detect.
   * Several entries = code-switching (e.g. ['ar', 'en'] for Arabic mixed with English).
   */
  speechLanguages: string[]
  /** Personal dictionary: terms to recognise + wrong spellings to correct */
  dictionary: DictionaryEntryConfig[]
  /** Keep the microphone open between recordings for instant start (mic indicator stays on) */
  keepMicWarm: boolean
  /** Input device id from navigator.mediaDevices ('' = system default) */
  microphoneDeviceId: string
  /** Keep recent dictation audio so history entries can be replayed / re-transcribed */
  keepRecordings: boolean

  // Notetaker (meeting notes)
  /** Offer to take notes when a call app (Zoom, Meet, Teams…) is in the foreground */
  recognizeMeetings: boolean
  /** Record the meeting's audio (other participants), not only the microphone */
  captureMeetingAudio: boolean
  /** Generate the summary automatically when a meeting ends */
  autoSummarizeMeetings: boolean
  /** Live-translate meeting transcripts into this language ('' = off) */
  meetingTranslateTo: string
  /** Paste dictation translated into this language ('' = off) */
  dictationTranslateTo: string

  // Smart Formatting (LLM clean-up pass after transcription)
  smartFormatting: boolean
  /** Tone per app category, used by Smart Formatting */
  writingStyles: Record<'messages' | 'work' | 'email' | 'other', 'formal' | 'casual' | 'very-casual'>

  /** @deprecated migrated to speechLanguages */
  speechLanguage?: string
  /** @deprecated migrated to dictionary */
  speechVocabulary?: string

  // Shortcut customization
  shortcuts: {
    record: string
  }

  // Snippets
  snippets: SnippetEntry[]

  // Voice Triggers
  triggers: TriggerEntry[]

  // Onboarding
  onboardingCompleted: boolean

  /**
   * API keys encrypted with the OS keychain (safeStorage), base64. When set,
   * `apiKeys` on disk is blanked and keys are only exposed through
   * getConfigValue / getAllConfig.
   */
  apiKeysEncrypted?: string
}

export interface DictionaryEntryConfig {
  id: string
  term: string
  aliases: string[]
  createdAt: number
}

export interface SnippetEntry {
  id: string
  trigger: string
  expansion: string
}

export interface ActionCategory {
  id: string
  label: string
  icon: string
  color: string
  isBuiltIn: boolean
  isVisible: boolean
  order: number
  actions: ActionItem[]
  /** Built-in actions the user hid; kept so they can be shown again */
  hiddenActions?: ActionItem[]
}

export interface ActionItem {
  id: string
  label: string
  prompt: string
  isBuiltIn: boolean
}

const defaultConfig: AppConfig = {
  aiProvider: 'gemini',
  voiceProvider: 'whisper',

  apiKeys: {
    gemini: '',
    together: '',
    openai: '',
    claude: '',
    soniox: ''
  },

  models: {
    gemini: 'gemini-2.5-flash',
    together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    openai: 'gpt-4.1',
    claude: 'claude-sonnet-4-5'
  },

  voiceModels: {
    whisper: 'openai/whisper-large-v3',
    'openai-whisper': 'whisper-1',
    soniox: 'stt-async-v4'
  },

  actions: [
    {
      id: 'translate',
      label: 'Translate',
      icon: 'globe',
      color: '#7EB6E0',
      isBuiltIn: true,
      isVisible: true,
      order: 0,
      actions: [
        {
          id: 'translate-auto',
          label: 'Auto Detect',
          prompt:
            'Detect the language of the following text and translate it to English. If it is already in English, translate it to Arabic. Only return the translated text, nothing else.',
          isBuiltIn: true
        },
        {
          id: 'translate-ar-en',
          label: 'Arabic → English',
          prompt:
            'Translate the following Arabic text to English. Only return the translated text, nothing else.',
          isBuiltIn: true
        },
        {
          id: 'translate-en-ar',
          label: 'English → Arabic',
          prompt:
            'Translate the following English text to Arabic. Only return the translated text, nothing else.',
          isBuiltIn: true
        }
      ]
    },
    {
      id: 'rephrase',
      label: 'Rephrase',
      icon: 'sparkles',
      color: '#B07CD8',
      isBuiltIn: true,
      isVisible: true,
      order: 1,
      actions: [
        {
          id: 'rephrase-professional',
          label: 'Professional',
          prompt:
            'Rephrase the following text in a professional tone. Only return the rephrased text.',
          isBuiltIn: true
        },
        {
          id: 'rephrase-casual',
          label: 'Casual',
          prompt:
            'Rephrase the following text in a casual, friendly tone. Only return the rephrased text.',
          isBuiltIn: true
        },
        {
          id: 'rephrase-friendly',
          label: 'Friendly',
          prompt:
            'Rephrase the following text in a warm, friendly tone. Only return the rephrased text.',
          isBuiltIn: true
        },
        {
          id: 'rephrase-formal',
          label: 'Formal',
          prompt: 'Rephrase the following text in a formal tone. Only return the rephrased text.',
          isBuiltIn: true
        },
        {
          id: 'rephrase-concise',
          label: 'Concise',
          prompt:
            'Make the following text more concise while keeping the meaning. Only return the rephrased text.',
          isBuiltIn: true
        },
        {
          id: 'rephrase-expand',
          label: 'Expand',
          prompt:
            'Expand the following text with more detail while keeping the same meaning. Only return the expanded text.',
          isBuiltIn: true
        },
        {
          id: 'rephrase-shorten',
          label: 'Shorten',
          prompt:
            'Shorten the following text while preserving key information. Only return the shortened text.',
          isBuiltIn: true
        }
      ]
    },
    {
      id: 'format',
      label: 'Format',
      icon: 'file-text',
      color: '#E8A838',
      isBuiltIn: true,
      isVisible: true,
      order: 2,
      actions: [
        {
          id: 'format-email',
          label: 'Email',
          prompt:
            'Format the following text as a professional email. Only return the formatted text.',
          isBuiltIn: true
        },
        {
          id: 'format-formal-letter',
          label: 'Formal Letter',
          prompt: 'Format the following text as a formal letter. Only return the formatted text.',
          isBuiltIn: true
        },
        {
          id: 'format-casual-message',
          label: 'Casual Message',
          prompt: 'Format the following text as a casual message. Only return the formatted text.',
          isBuiltIn: true
        },
        {
          id: 'format-business-report',
          label: 'Business Report',
          prompt: 'Format the following text as a business report. Only return the formatted text.',
          isBuiltIn: true
        },
        {
          id: 'format-social-media',
          label: 'Social Media',
          prompt:
            'Format the following text as a social media post. Keep it engaging and concise. Only return the formatted text.',
          isBuiltIn: true
        }
      ]
    },
    {
      id: 'grammar',
      label: 'Grammar',
      icon: 'book-open',
      color: '#4DC778',
      isBuiltIn: true,
      isVisible: true,
      order: 3,
      actions: [
        {
          id: 'grammar-fix',
          label: 'Fix Grammar',
          prompt: 'Fix all grammar errors in the following text. Only return the corrected text.',
          isBuiltIn: true
        },
        {
          id: 'grammar-spelling',
          label: 'Fix Spelling',
          prompt: 'Fix all spelling errors in the following text. Only return the corrected text.',
          isBuiltIn: true
        },
        {
          id: 'grammar-simplify',
          label: 'Simplify',
          prompt:
            'Simplify the following text to make it easier to understand. Only return the simplified text.',
          isBuiltIn: true
        }
      ]
    }
  ],

  language: 'en',
  theme: 'system',
  autoLaunch: false,

  speechLanguages: [],
  dictionary: [],
  keepMicWarm: false,
  microphoneDeviceId: '',
  keepRecordings: true,

  recognizeMeetings: true,
  captureMeetingAudio: true,
  autoSummarizeMeetings: true,
  meetingTranslateTo: '',
  dictationTranslateTo: '',

  smartFormatting: false,
  writingStyles: { messages: 'casual', work: 'casual', email: 'formal', other: 'formal' },

  shortcuts: {
    record: 'Option+Space'
  },

  snippets: [],

  triggers: [],

  onboardingCompleted: false
}

let store: Store<AppConfig> | null = null

export function initStore(): Store<AppConfig> {
  store = new Store<AppConfig>({
    name: 'tapwisper-config',
    defaults: defaultConfig,
    encryptionKey: 'tapwisper-desktop-2026',
    clearInvalidConfig: true
  })
  return store
}

export function getStore(): Store<AppConfig> {
  if (!store) {
    return initStore()
  }
  return store
}

// ── API key protection ────────────────────────────────────────────
// electron-store's `encryptionKey` is hardcoded in the app bundle, so it only
// obscures the file. Keys are additionally encrypted with safeStorage, which
// is backed by the macOS Keychain / Windows DPAPI / Linux secret service.

type ApiKeys = AppConfig['apiKeys']

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function readApiKeys(): ApiKeys {
  const s = getStore()
  const encrypted = s.get('apiKeysEncrypted')
  if (encrypted && encryptionAvailable()) {
    try {
      const json = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
      return { ...defaultConfig.apiKeys, ...(JSON.parse(json) as Partial<ApiKeys>) }
    } catch {
      // Keychain entry unavailable (e.g. app re-signed) — fall through to plaintext
    }
  }
  return { ...defaultConfig.apiKeys, ...s.get('apiKeys') }
}

function writeApiKeys(keys: ApiKeys): void {
  const s = getStore()
  if (encryptionAvailable()) {
    s.set('apiKeysEncrypted', safeStorage.encryptString(JSON.stringify(keys)).toString('base64'))
    s.set('apiKeys', { ...defaultConfig.apiKeys })
  } else {
    s.set('apiKeys', keys)
  }
}

/** Read one config value, decrypting API keys. Use this for anything exposed over IPC. */
export function getConfigValue(key: string): unknown {
  if (key === 'apiKeys') return readApiKeys()
  if (key === 'apiKeysEncrypted') return undefined
  return getStore().get(key as keyof AppConfig)
}

/** Write one config value, encrypting API keys. */
export function setConfigValue(key: string, value: unknown): void {
  if (key === 'apiKeysEncrypted') return
  if (key === 'apiKeys') {
    writeApiKeys({ ...defaultConfig.apiKeys, ...(value as Partial<ApiKeys>) })
    return
  }
  getStore().set(key as keyof AppConfig, value as AppConfig[keyof AppConfig])
}

/** Whole config with API keys decrypted and the ciphertext omitted. */
export function getAllConfig(): Omit<AppConfig, 'apiKeysEncrypted'> {
  const { apiKeysEncrypted: _omit, ...rest } = getStore().store
  return { ...rest, apiKeys: readApiKeys() }
}

/** One-time move of plaintext keys into safeStorage. Call after app 'ready'. */
export function migrateApiKeysToSafeStorage(): void {
  if (!encryptionAvailable()) return
  const s = getStore()
  const plain = s.get('apiKeys')
  if (plain && Object.values(plain).some((v) => typeof v === 'string' && v.length > 0)) {
    writeApiKeys({
      ...readApiKeys(),
      ...Object.fromEntries(
        Object.entries(plain).filter(([, v]) => typeof v === 'string' && v.length > 0)
      )
    } as ApiKeys)
  }
}

/** Whether API keys are protected by the OS keychain on this machine. */
export function isApiKeyEncryptionAvailable(): boolean {
  return encryptionAvailable()
}
