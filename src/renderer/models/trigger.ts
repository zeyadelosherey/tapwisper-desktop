// ── Trigger Action Types ────────────────────────────────────────

export type TriggerActionType =
  | 'web-search'
  | 'ai-chat'
  | 'terminal'
  | 'keyboard'
  | 'apple-shortcut'
  | 'window'
  | 'launch-app'

// ── Action Config Shapes ────────────────────────────────────────

export type SearchEngine = 'google' | 'duckduckgo' | 'bing' | 'custom'
export type BrowserChoice = 'default' | 'safari' | 'chrome' | 'firefox'
export type ResponseHandling = 'modal' | 'inject' | 'clipboard'
export type ExecutionMode = 'background' | 'visual'
export type ScreenshotQuality = 'none' | 'low' | 'high'
export type WindowAction =
  | 'left-half'
  | 'right-half'
  | 'top-half'
  | 'bottom-half'
  | 'top-left-quarter'
  | 'top-right-quarter'
  | 'bottom-left-quarter'
  | 'bottom-right-quarter'
  | 'center'
  | 'maximize'
  | 'fullscreen'

export interface WebSearchConfig {
  type: 'web-search'
  searchEngine: SearchEngine
  customUrl?: string
  beforeText?: string
  afterText?: string
  browser: BrowserChoice
}

export interface AIChatConfig {
  type: 'ai-chat'
  provider: 'gemini' | 'together' | 'openai' | 'claude'
  model: string
  responseHandling: ResponseHandling
  systemPrompt?: string
}

export interface TerminalConfig {
  type: 'terminal'
  commands: string[]
  executionMode: ExecutionMode
  showOutput: boolean
  screenshot: ScreenshotQuality
}

export interface KeyboardConfig {
  type: 'keyboard'
  shortcut: string
  delay?: number
}

export interface AppleShortcutConfig {
  type: 'apple-shortcut'
  shortcutName: string
}

export interface WindowConfig {
  type: 'window'
  action: WindowAction
}

export interface LaunchAppConfig {
  type: 'launch-app'
  appPath: string
  appName: string
}

export type TriggerActionConfig =
  | WebSearchConfig
  | AIChatConfig
  | TerminalConfig
  | KeyboardConfig
  | AppleShortcutConfig
  | WindowConfig
  | LaunchAppConfig

// ── Trigger Model ───────────────────────────────────────────────

export interface Trigger {
  id: string
  name: string
  triggerPhrase: string
  triggerType: 'exact' | 'prefix'
  actionType: TriggerActionType
  actionConfig: TriggerActionConfig
  enabled: boolean
  createdAt: number
}

// ── Trigger Match Result ────────────────────────────────────────

export interface TriggerMatch {
  trigger: Trigger
  speechInput: string // remaining text after trigger phrase (for prefix triggers)
  prefixText: string  // text spoken before the trigger phrase (for mid-sentence triggers)
}

// ── Action Type Metadata (for UI) ───────────────────────────────

export interface ActionTypeMeta {
  id: TriggerActionType
  label: string
  description: string
  icon: string
  example: string
  defaultTriggerType: 'exact' | 'prefix'
}

export const ACTION_TYPE_META: ActionTypeMeta[] = [
  {
    id: 'web-search',
    label: 'Web Search',
    description: 'Search the web with Google, DuckDuckGo, or custom engines',
    icon: 'search',
    example: '"google best coffee shops"',
    defaultTriggerType: 'prefix'
  },
  {
    id: 'ai-chat',
    label: 'AI Chat',
    description: 'Use AI to process and transform your dictation',
    icon: 'bot',
    example: '"ask ai to summarize this"',
    defaultTriggerType: 'prefix'
  },
  {
    id: 'terminal',
    label: 'Terminal',
    description: 'Run terminal commands silently or in your terminal app',
    icon: 'terminal',
    example: '"run build command"',
    defaultTriggerType: 'exact'
  },
  {
    id: 'keyboard',
    label: 'Keyboard',
    description: 'Simulate keyboard shortcuts with optional delays',
    icon: 'keyboard',
    example: '"press command k"',
    defaultTriggerType: 'exact'
  },
  {
    id: 'apple-shortcut',
    label: 'Apple Shortcut',
    description: 'Run a specific Apple Shortcut',
    icon: 'smartphone',
    example: '"select a shortcut to run"',
    defaultTriggerType: 'exact'
  },
  {
    id: 'window',
    label: 'Window',
    description: 'Snap windows to halves, quarters, center, or fullscreen',
    icon: 'app-window',
    example: '"window top left"',
    defaultTriggerType: 'exact'
  },
  {
    id: 'launch-app',
    label: 'Launch App',
    description: 'Open an application on your computer',
    icon: 'rocket',
    example: '"open spotify"',
    defaultTriggerType: 'exact'
  }
]

// ── Default Configs ─────────────────────────────────────────────

export function getDefaultActionConfig(actionType: TriggerActionType): TriggerActionConfig {
  switch (actionType) {
    case 'web-search':
      return {
        type: 'web-search',
        searchEngine: 'google',
        beforeText: '',
        afterText: '',
        browser: 'default'
      }
    case 'ai-chat':
      return {
        type: 'ai-chat',
        provider: 'gemini',
        model: '',
        responseHandling: 'modal',
        systemPrompt: ''
      }
    case 'terminal':
      return {
        type: 'terminal',
        commands: [''],
        executionMode: 'background',
        showOutput: false,
        screenshot: 'none'
      }
    case 'keyboard':
      return {
        type: 'keyboard',
        shortcut: '',
        delay: 0
      }
    case 'apple-shortcut':
      return {
        type: 'apple-shortcut',
        shortcutName: ''
      }
    case 'window':
      return {
        type: 'window',
        action: 'left-half'
      }
    case 'launch-app':
      return {
        type: 'launch-app',
        appPath: '',
        appName: ''
      }
  }
}

// ── Search Engine URL Builders ──────────────────────────────────

const SEARCH_URLS: Record<SearchEngine, string> = {
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  bing: 'https://www.bing.com/search?q=',
  custom: ''
}

export function buildSearchUrl(config: WebSearchConfig, query: string): string {
  const before = config.beforeText || ''
  const after = config.afterText || ''
  const fullQuery = `${before}${query}${after}`.trim()
  const encoded = encodeURIComponent(fullQuery)

  if (config.searchEngine === 'custom' && config.customUrl) {
    return config.customUrl.replace('%s', encoded)
  }

  return `${SEARCH_URLS[config.searchEngine]}${encoded}`
}
