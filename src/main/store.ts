import Store from 'electron-store'

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
  lastUsedAction: string | null

  // App settings
  language: string
  theme: 'system' | 'dark' | 'light'
  autoLaunch: boolean
  showRecordingPill: boolean

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
    soniox: 'soniox-stt-async-v3'
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
          prompt: 'Detect the language of the following text and translate it to English. If it is already in English, translate it to Arabic. Only return the translated text, nothing else.',
          isBuiltIn: true
        },
        {
          id: 'translate-ar-en',
          label: 'Arabic → English',
          prompt: 'Translate the following Arabic text to English. Only return the translated text, nothing else.',
          isBuiltIn: true
        },
        {
          id: 'translate-en-ar',
          label: 'English → Arabic',
          prompt: 'Translate the following English text to Arabic. Only return the translated text, nothing else.',
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
        { id: 'rephrase-professional', label: 'Professional', prompt: 'Rephrase the following text in a professional tone. Only return the rephrased text.', isBuiltIn: true },
        { id: 'rephrase-casual', label: 'Casual', prompt: 'Rephrase the following text in a casual, friendly tone. Only return the rephrased text.', isBuiltIn: true },
        { id: 'rephrase-friendly', label: 'Friendly', prompt: 'Rephrase the following text in a warm, friendly tone. Only return the rephrased text.', isBuiltIn: true },
        { id: 'rephrase-formal', label: 'Formal', prompt: 'Rephrase the following text in a formal tone. Only return the rephrased text.', isBuiltIn: true },
        { id: 'rephrase-concise', label: 'Concise', prompt: 'Make the following text more concise while keeping the meaning. Only return the rephrased text.', isBuiltIn: true },
        { id: 'rephrase-expand', label: 'Expand', prompt: 'Expand the following text with more detail while keeping the same meaning. Only return the expanded text.', isBuiltIn: true },
        { id: 'rephrase-shorten', label: 'Shorten', prompt: 'Shorten the following text while preserving key information. Only return the shortened text.', isBuiltIn: true }
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
        { id: 'format-email', label: 'Email', prompt: 'Format the following text as a professional email. Only return the formatted text.', isBuiltIn: true },
        { id: 'format-formal-letter', label: 'Formal Letter', prompt: 'Format the following text as a formal letter. Only return the formatted text.', isBuiltIn: true },
        { id: 'format-casual-message', label: 'Casual Message', prompt: 'Format the following text as a casual message. Only return the formatted text.', isBuiltIn: true },
        { id: 'format-business-report', label: 'Business Report', prompt: 'Format the following text as a business report. Only return the formatted text.', isBuiltIn: true },
        { id: 'format-social-media', label: 'Social Media', prompt: 'Format the following text as a social media post. Keep it engaging and concise. Only return the formatted text.', isBuiltIn: true }
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
        { id: 'grammar-fix', label: 'Fix Grammar', prompt: 'Fix all grammar errors in the following text. Only return the corrected text.', isBuiltIn: true },
        { id: 'grammar-spelling', label: 'Fix Spelling', prompt: 'Fix all spelling errors in the following text. Only return the corrected text.', isBuiltIn: true },
        { id: 'grammar-simplify', label: 'Simplify', prompt: 'Simplify the following text to make it easier to understand. Only return the simplified text.', isBuiltIn: true }
      ]
    }
  ],

  lastUsedAction: null,

  language: 'en',
  theme: 'system',
  autoLaunch: false,
  showRecordingPill: true,

  shortcuts: {
    record: 'Option+Space'
  },

  snippets: [
    { id: '1', trigger: '/addr', expansion: '123 Main Street, City, State 12345' },
    { id: '2', trigger: '/sig', expansion: 'Best regards,\nJohn Doe\nSenior Developer' },
    { id: '3', trigger: '/email', expansion: 'john.doe@company.com' }
  ],

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
