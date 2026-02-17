import { type JSX, useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Globe, Shield, Info, Monitor, Moon, Sun, Keyboard, RotateCcw,
  Eye, EyeOff, Check, AlertCircle, Cpu, Settings2, Mic, Search, X
} from 'lucide-react'
import { updateDirection } from '../i18n'
import appLogo from '../assets/logo.png'
import geminiLogo from '../assets/google.png'
import openaiLogo from '../assets/openai.png'
import claudeLogo from '../assets/claude.png'
import togetherLogo from '../assets/together.png'
import sonioxLogo from '../assets/soniox.png'

// ── Constants ────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' }
]

type Theme = 'system' | 'dark' | 'light'
type SettingsTab = 'general' | 'ai-provider' | 'shortcuts' | 'about'
import type { LLMProvider, VoiceProvider } from '../constants/providers'

interface ShortcutsConfig {
  record: string
}

const DEFAULT_SHORTCUTS: ShortcutsConfig = {
  record: 'Option+Space'
}

type ProviderSubTab = 'ai' | 'transcription'

// ── Provider Logos (inline SVGs) ────────────────────────────────

function GeminiLogo({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M12 2C12 2 14.5 7.5 17.5 10.5C20.5 13.5 22 12 22 12C22 12 20.5 14.5 17.5 17.5C14.5 20.5 12 22 12 22C12 22 9.5 20.5 6.5 17.5C3.5 14.5 2 12 2 12C2 12 3.5 9.5 6.5 6.5C9.5 3.5 12 2 12 2Z" fill="url(#gemini-grad)"/>
      <defs>
        <linearGradient id="gemini-grad" x1="2" y1="2" x2="22" y2="22">
          <stop stopColor="#4285F4"/><stop offset="0.5" stopColor="#9B72CB"/><stop offset="1" stopColor="#D96570"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function OpenAILogo({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
    </svg>
  )
}

function ClaudeLogo({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.709 15.955l4.72-2.756.08-.053-.08-.053-4.72-2.756C3.077 9.437 2 7.985 2 6.265A4.265 4.265 0 0 1 6.265 2c1.72 0 3.172 1.077 4.072 2.709L12 8.44l1.663-3.731C14.563 3.077 16.015 2 17.735 2A4.265 4.265 0 0 1 22 6.265c0 1.72-1.077 3.172-2.709 4.072L14.571 13.1l.08.053 4.64 2.802C20.923 16.855 22 18.307 22 20.027A3.973 3.973 0 0 1 18.027 24c-1.72 0-3.172-1.077-4.072-2.709L12 17.56l-1.955 3.731C9.145 22.923 7.693 24 5.973 24A3.973 3.973 0 0 1 2 20.027c0-1.72 1.077-3.172 2.709-4.072z"/>
    </svg>
  )
}

function TogetherLogo({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18L19.82 8 12 11.82 4.18 8 12 4.18zM4 9.18l7 3.5V19.5l-7-3.5V9.18zm16 0v6.82l-7 3.5v-6.82l7-3.5z"/>
    </svg>
  )
}

function WhisperLogo({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
    </svg>
  )
}

function SonioxLogo({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM8 11a1 1 0 0 0-2 0 6 6 0 0 0 12 0 1 1 0 0 0-2 0 4 4 0 0 1-8 0zm5 8.94A7 7 0 0 0 19 13h-2a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.94V23h2v-3.06z"/>
    </svg>
  )
}

const PROVIDER_LOGOS: Record<string, (props: { className?: string }) => JSX.Element> = {
  gemini: GeminiLogo,
  openai: OpenAILogo,
  claude: ClaudeLogo,
  together: TogetherLogo,
  whisper: WhisperLogo,
  soniox: SonioxLogo
}

/** Provider logo images (use when available; otherwise fall back to SVG in PROVIDER_LOGOS) */
const PROVIDER_LOGO_IMAGES: Partial<Record<string, string>> = {
  gemini: geminiLogo,
  openai: openaiLogo,
  claude: claudeLogo,
  together: togetherLogo,
  whisper: togetherLogo, // Together Whisper — use Together logo
  soniox: sonioxLogo
}

const LLM_PROVIDERS: { id: LLMProvider; label: string; shortLabel: string; color: string }[] = [
  { id: 'gemini', label: 'Google Gemini', shortLabel: 'Gemini', color: '#4285F4' },
  { id: 'openai', label: 'OpenAI', shortLabel: 'OpenAI', color: '#10A37F' },
  { id: 'claude', label: 'Anthropic Claude', shortLabel: 'Claude', color: '#D97757' },
  { id: 'together', label: 'Together AI', shortLabel: 'Together', color: '#FF6B35' }
]

const VOICE_PROVIDERS: { id: VoiceProvider; label: string; shortLabel: string; description: string; color: string }[] = [
  { id: 'whisper', label: 'Together Whisper', shortLabel: 'Whisper', description: 'Whisper Large v3 via Together AI', color: '#10A37F' },
  { id: 'soniox', label: 'Soniox', shortLabel: 'Soniox', description: 'Soniox STT Async v3', color: '#7EB6E0' }
]

const PROVIDER_MODELS: Record<LLMProvider, { id: string; label: string; description: string }[]> = {
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Fast & efficient' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Advanced reasoning' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)', description: 'Next-gen speed' },
    { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (Preview)', description: 'Next-gen quality' }
  ],
  together: [
    { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo', description: 'Fast open-source' },
    { id: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8', label: 'Llama 4 Maverick', description: '1M context, 128 experts' },
    { id: 'moonshotai/Kimi-K2.5', label: 'Kimi K2.5', description: '1T params, 256K context' },
    { id: 'moonshotai/Kimi-K2-Instruct-0905', label: 'Kimi K2 Instruct', description: '262K context' },
    { id: 'moonshotai/Kimi-K2-Thinking', label: 'Kimi K2 Thinking', description: 'Reasoning model' },
    { id: 'MiniMaxAI/MiniMax-M2.5', label: 'MiniMax M2.5', description: '228K context' },
    { id: 'deepseek-ai/DeepSeek-V3.1', label: 'DeepSeek V3.1', description: '128K context' },
    { id: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1', description: 'Reasoning model' },
    { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', description: 'Open-source GPT' },
    { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', description: 'Lightweight open GPT' },
    { id: 'zai-org/GLM-5', label: 'GLM-5', description: '202K context' },
    { id: 'zai-org/GLM-4.7', label: 'GLM 4.7', description: '202K context' },
    { id: 'Qwen/Qwen3-235B-A22B-Thinking-2507', label: 'Qwen3 235B Thinking', description: 'Reasoning, 262K context' },
    { id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8', label: 'Qwen3-Coder 480B', description: 'Coding specialist' },
    { id: 'Qwen/Qwen3-Coder-Next-FP8', label: 'Qwen3-Coder-Next', description: 'Next-gen coding' },
    { id: 'Qwen/Qwen3-235B-A22B-Instruct-2507-tput', label: 'Qwen3 235B Instruct', description: 'Large multilingual' },
    { id: 'Qwen/Qwen3-Next-80B-A3B-Instruct', label: 'Qwen3-Next 80B Instruct', description: 'Efficient MoE' },
    { id: 'Qwen/Qwen3-Next-80B-A3B-Thinking', label: 'Qwen3-Next 80B Thinking', description: 'Reasoning MoE' },
    { id: 'deepcogito/cogito-v2-1-671b', label: 'Cogito v2.1 671B', description: 'Deep reasoning' },
    { id: 'mistralai/Ministral-3-14B-Instruct-2512', label: 'Ministral 3 14B', description: '262K context' },
    { id: 'mistralai/Mistral-Small-24B-Instruct-2501', label: 'Mistral Small 3 24B', description: 'Balanced performance' },
    { id: 'nvidia/NVIDIA-Nemotron-Nano-9B-v2', label: 'Nemotron Nano 9B v2', description: '131K context' },
    { id: 'google/gemma-3n-E4B-it', label: 'Gemma 3N E4B', description: 'Lightweight Google' },
    { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', label: 'Llama 3.1 8B Turbo', description: 'Fast & light' },
    { id: 'Qwen/Qwen2.5-7B-Instruct-Turbo', label: 'Qwen 2.5 7B Turbo', description: 'Compact multilingual' },
    { id: 'meta-llama/Llama-3.2-3B-Instruct-Turbo', label: 'Llama 3.2 3B Turbo', description: 'Ultra-light' },
    { id: 'essentialai/rnj-1-instruct', label: 'Rnj-1 Instruct', description: '32K context' }
  ],
  openai: [
    { id: 'gpt-4.1', label: 'GPT-4.1', description: 'Flagship model' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', description: 'Balanced performance' },
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', description: 'Ultra-fast' },
    { id: 'gpt-5-mini', label: 'GPT-5 Mini', description: 'Next-gen compact' },
    { id: 'gpt-5', label: 'GPT-5', description: 'Most capable' },
    { id: 'gpt-5.2', label: 'GPT-5.2', description: 'Latest flagship' }
  ],
  claude: [
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', description: 'Best balance' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', description: 'Fast & light' },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', description: 'Most capable' }
  ]
}

const VOICE_PROVIDER_MODELS: Record<VoiceProvider, { id: string; label: string; description: string }[]> = {
  whisper: [
    { id: 'openai/whisper-large-v3', label: 'Whisper Large v3', description: 'Best accuracy' },
    { id: 'mistralai/Voxtral-Mini-3B-2507', label: 'Voxtral Mini 3B', description: 'Fast multilingual STT' }
  ],
  soniox: [
    { id: 'soniox-stt-async-v3', label: 'Soniox STT Async v3', description: 'Real-time streaming' }
  ]
}

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  gemini: 'gemini-2.5-flash',
  together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  openai: 'gpt-4.1',
  claude: 'claude-sonnet-4-5'
}

const DEFAULT_VOICE_MODELS: Record<VoiceProvider, string> = {
  whisper: 'openai/whisper-large-v3',
  soniox: 'soniox-stt-async-v3'
}

const LLM_API_KEY_LABELS: Record<LLMProvider, string> = {
  gemini: 'Google Gemini API Key',
  together: 'Together AI API Key',
  openai: 'OpenAI API Key',
  claude: 'Anthropic API Key'
}

const VOICE_API_KEY_LABELS: Record<VoiceProvider, string> = {
  whisper: 'Together AI API Key',
  soniox: 'Soniox API Key'
}

/** Which API key ID to use for a voice provider (whisper shares together's key) */
const VOICE_API_KEY_ID: Record<VoiceProvider, string> = {
  whisper: 'together',
  soniox: 'soniox'
}

// ── Helpers for displaying shortcut strings ─────────────────────

const isMac = navigator.platform.toUpperCase().includes('MAC')

function formatShortcutForDisplay(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => {
      const upper = part.toUpperCase()
      if (upper === 'FN') return '🌐'
      if (upper === 'COMMANDORCONTROL' || upper === 'CMDORCTRL') return isMac ? '⌘' : 'Ctrl'
      if (upper === 'CTRL' || upper === 'CONTROL') return isMac ? '⌃' : 'Ctrl'
      if (upper === 'CMD' || upper === 'COMMAND' || upper === 'META' || upper === 'SUPER')
        return isMac ? '⌘' : 'Super'
      if (upper === 'SHIFT') return isMac ? '⇧' : 'Shift'
      if (upper === 'ALT' || upper === 'OPTION') return isMac ? '⌥' : 'Alt'
      if (upper === 'SPACE') return 'Space'
      if (upper === 'ESCAPE') return 'Esc'
      if (upper === 'ENTER') return '↵'
      if (upper === 'BACKSPACE') return '⌫'
      if (upper === 'TAB') return '⇥'
      if (upper === 'MINUS') return '-'
      if (upper === 'EQUAL') return '='
      if (upper === 'BRACKETLEFT') return '['
      if (upper === 'BRACKETRIGHT') return ']'
      if (upper === 'BACKSLASH') return '\\'
      if (upper === 'SEMICOLON') return ';'
      if (upper === 'QUOTE') return "'"
      if (upper === 'BACKQUOTE') return '`'
      if (upper === 'COMMA') return ','
      if (upper === 'PERIOD') return '.'
      if (upper === 'SLASH') return '/'
      return part.toUpperCase()
    })
    .join(isMac ? '' : ' + ')
}

/**
 * Convert a DOM KeyboardEvent into an Electron accelerator string.
 */
function keyEventToAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = []

  // At least one modifier is required
  const hasModifier = e.ctrlKey || e.metaKey || e.shiftKey || e.altKey
  if (!hasModifier) return null

  // Distinguish Ctrl and Cmd so shortcuts like Ctrl+Space work properly on macOS
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.metaKey) parts.push('Command')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Option')

  // Use e.code as the primary source — it represents the physical key
  // regardless of what character the modifier combo produces.
  // e.g. Option+Space gives e.key = '\u00A0' (non-breaking space)
  //      but e.code = 'Space' which is what we want.
  const key = e.key
  const code = e.code

  // Ignore bare modifier keys
  if (['Control', 'Meta', 'Shift', 'Alt', 'OS'].includes(key)) return null
  if (['ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight',
       'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight'].includes(code)) return null

  // Map physical key code to accelerator name
  const codeMap: Record<string, string> = {
    Space: 'Space',
    Enter: 'Enter',
    NumpadEnter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Escape: 'Escape',
    Minus: 'Minus',
    Equal: 'Equal',
    BracketLeft: 'BracketLeft',
    BracketRight: 'BracketRight',
    Backslash: 'Backslash',
    Semicolon: 'Semicolon',
    Quote: 'Quote',
    Backquote: 'Backquote',
    Comma: 'Comma',
    Period: 'Period',
    Slash: 'Slash'
  }

  let keyName = codeMap[code]
  if (!keyName) {
    // Letters (KeyA → A, KeyB → B, ...)
    if (code.startsWith('Key')) {
      keyName = code.replace('Key', '')
    } else if (code.startsWith('Digit')) {
      keyName = code.replace('Digit', '')
    } else if (/^F\d{1,2}$/.test(code)) {
      keyName = code // F1–F24
    } else {
      return null // Unknown key
    }
  }

  parts.push(keyName)
  return parts.join('+')
}

// ── Shortcut Recorder Component ─────────────────────────────────

function ShortcutRecorder({
  label,
  description,
  value,
  onChange,
  disabled,
  pressKeysText
}: {
  label: string
  description: string
  value: string
  onChange: (newValue: string) => void
  disabled?: boolean
  pressKeysText?: string
}) {
  const [isRecording, setIsRecording] = useState(false)
  const [pendingKeys, setPendingKeys] = useState<string | null>(null)
  const recorderRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isRecording) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()

      const accelerator = keyEventToAccelerator(e)
      if (accelerator) {
        setPendingKeys(accelerator)
      }
    }

    const handleKeyUp = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()

      // When keys are released and we have a pending combo, save it
      if (pendingKeys) {
        onChange(pendingKeys)
        setPendingKeys(null)
        setIsRecording(false)
      }
    }

    const handleBlur = (): void => {
      setPendingKeys(null)
      setIsRecording(false)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
      window.removeEventListener('blur', handleBlur)
    }
  }, [isRecording, pendingKeys, onChange])

  const handleClick = (): void => {
    if (disabled) return
    if (isRecording) {
      setIsRecording(false)
      setPendingKeys(null)
    } else {
      setIsRecording(true)
    }
  }

  const displayValue = isRecording
    ? pendingKeys
      ? formatShortcutForDisplay(pendingKeys)
      : (pressKeysText || 'Press keys...')
    : formatShortcutForDisplay(value)

  return (
    <div className="flex items-center justify-between p-4 bg-theme-card rounded-xl border border-theme-border/50">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-theme-text">{label}</p>
        <p className="text-xs text-theme-text-tertiary mt-0.5">{description}</p>
      </div>
      <button
        ref={recorderRef}
        onClick={handleClick}
        disabled={disabled}
        className={`
          ms-4 px-4 py-2 rounded-lg text-sm font-mono transition-all flex-shrink-0
          ${
            isRecording
              ? 'bg-sky-accent/20 border-sky-accent/60 text-sky-accent border animate-pulse'
              : 'bg-theme-surface border-theme-border/50 text-theme-text-secondary border hover:border-theme-border hover:text-theme-text'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {displayValue}
      </button>
    </div>
  )
}

// ── Tab Definitions ─────────────────────────────────────────────

const TABS: { id: SettingsTab; labelKey: string; icon: React.ReactNode }[] = [
  { id: 'general', labelKey: 'settings.tabGeneral', icon: <Settings2 className="w-4 h-4" /> },
  { id: 'ai-provider', labelKey: 'settings.tabAIProvider', icon: <Cpu className="w-4 h-4" /> },
  { id: 'shortcuts', labelKey: 'settings.tabShortcuts', icon: <Keyboard className="w-4 h-4" /> },
  { id: 'about', labelKey: 'settings.tabAbout', icon: <Info className="w-4 h-4" /> }
]

// ── Main Settings Component ─────────────────────────────────────

export function Settings(): JSX.Element {
  const { t, i18n } = useTranslation()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  // General tab state
  const [language, setLanguage] = useState('en')
  const [theme, setTheme] = useState<Theme>('system')
  const [autoLaunch, setAutoLaunch] = useState(false)

  // AI Provider tab state
  const [providerSubTab, setProviderSubTab] = useState<ProviderSubTab>('ai')
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
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})
  const [modelSearch, setModelSearch] = useState('')
  const [voiceModelSearch, setVoiceModelSearch] = useState('')

  // Shortcuts tab state
  const [shortcuts, setShortcuts] = useState<ShortcutsConfig>(DEFAULT_SHORTCUTS)

  // About tab state
  const [platformInfo, setPlatformInfo] = useState<{
    platform: string
    isMac: boolean
    version: string
  } | null>(null)

  // ── Theme handling ──────────────────────────────────────────

  const applyTheme = useCallback((value: Theme) => {
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
  }, [])

  // ── Load all config on mount ───────────────────────────────

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
      setPlatformInfo(platform as any)
      if (sc) setShortcuts({ ...DEFAULT_SHORTCUTS, ...sc } as ShortcutsConfig)
      if (llm) setSelectedLLM(llm as LLMProvider)
      if (voice) setSelectedVoice(voice as VoiceProvider)
      if (keys) setApiKeys(keys as Record<string, string>)
      if (mdls) setModels({ ...DEFAULT_MODELS, ...(mdls as Record<string, string>) })
      if (vMdls) setVoiceModels({ ...DEFAULT_VOICE_MODELS, ...(vMdls as Record<string, string>) })
    })
  }, [applyTheme, i18n])

  // Listen for OS theme changes when "system" is selected
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = (): void => {
      if (theme === 'system') {
        applyTheme('system')
      }
    }
    mediaQuery.addEventListener('change', handleSystemThemeChange)
    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange)
    }
  }, [theme, applyTheme])

  // ── General tab handlers ───────────────────────────────────

  const handleLanguageChange = useCallback((code: string) => {
    setLanguage(code)
    window.tapwisper.store.set('language', code)
    i18n.changeLanguage(code)
    updateDirection(code)
  }, [i18n])

  const handleThemeChange = useCallback(
    (value: Theme) => {
      setTheme(value)
      window.tapwisper.store.set('theme', value)
      applyTheme(value)
    },
    [applyTheme]
  )

  const handleAutoLaunchChange = useCallback((value: boolean) => {
    setAutoLaunch(value)
    window.tapwisper.store.set('autoLaunch', value)
    window.tapwisper.app.setAutoLaunch(value)
  }, [])

  // ── AI Provider tab handlers ───────────────────────────────

  const handleSelectLLM = useCallback((provider: LLMProvider) => {
    setSelectedLLM(provider)
    setModelSearch('')
    window.tapwisper.store.set('aiProvider', provider)
  }, [])

  const handleSelectVoice = useCallback((provider: VoiceProvider) => {
    setSelectedVoice(provider)
    setVoiceModelSearch('')
    window.tapwisper.store.set('voiceProvider', provider)
  }, [])

  const handleModelChange = useCallback((provider: string, modelId: string) => {
    const updated = { ...models, [provider]: modelId }
    setModels(updated)
    window.tapwisper.store.set('models', updated)
  }, [models])

  const handleVoiceModelChange = useCallback((provider: string, modelId: string) => {
    const updated = { ...voiceModels, [provider]: modelId }
    setVoiceModels(updated)
    window.tapwisper.store.set('voiceModels', updated)
  }, [voiceModels])

  const handleKeyChange = useCallback((provider: string, value: string) => {
    const updated = { ...apiKeys, [provider]: value }
    setApiKeys(updated)
    window.tapwisper.store.set('apiKeys', updated)
  }, [apiKeys])

  const toggleKeyVisibility = useCallback((provider: string) => {
    setVisibleKeys((prev) => ({ ...prev, [provider]: !prev[provider] }))
  }, [])

  // ── Shortcuts tab handlers ─────────────────────────────────

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

  // ── Tab content renderers ──────────────────────────────────

  const renderGeneralTab = (): JSX.Element => (
    <>
      {/* Language */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="w-4 h-4 text-theme-text-secondary" />
          <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider">
            {t('settings.language')}
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={`
                flex items-center justify-between p-3 rounded-xl border transition-all
                ${
                  language === lang.code
                    ? 'border-sky-accent/50 bg-sky-accent/5'
                    : 'border-theme-border/50 bg-theme-card hover:border-theme-border'
                }
              `}
            >
              <div className="text-start">
                <p className="text-sm text-theme-text">{lang.label}</p>
                <p className="text-xs text-theme-text-tertiary">{lang.nativeLabel}</p>
              </div>
              {language === lang.code && <div className="w-2 h-2 rounded-full bg-sky-accent" />}
            </button>
          ))}
        </div>
      </section>

      {/* Theme */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Monitor className="w-4 h-4 text-theme-text-secondary" />
          <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider">
            {t('settings.appearance')}
          </h2>
        </div>
        <div className="flex gap-2">
          {[
            {
              value: 'system' as Theme,
              labelKey: 'settings.system',
              icon: <Monitor className="w-4 h-4" />
            },
            { value: 'dark' as Theme, labelKey: 'settings.dark', icon: <Moon className="w-4 h-4" /> },
            { value: 'light' as Theme, labelKey: 'settings.light', icon: <Sun className="w-4 h-4" /> }
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => handleThemeChange(option.value)}
              className={`
                flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border transition-all text-sm
                ${
                  theme === option.value
                    ? 'border-sky-accent/50 bg-sky-accent/5 text-sky-accent'
                    : 'border-theme-border/50 bg-theme-card text-theme-text-secondary hover:text-theme-text'
                }
              `}
            >
              {option.icon}
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </section>

      {/* Auto Launch */}
      <section className="mb-8">
        <div className="flex items-center justify-between p-4 bg-theme-card rounded-xl border border-theme-border/50">
          <div>
            <p className="text-sm text-theme-text">{t('settings.launchAtStartup')}</p>
            <p className="text-xs text-theme-text-tertiary mt-0.5">{t('settings.launchHint')}</p>
          </div>
          <button
            onClick={() => handleAutoLaunchChange(!autoLaunch)}
            className={`
              w-11 h-6 rounded-full transition-all relative
              ${autoLaunch ? 'bg-sky-accent' : 'bg-theme-surface'}
            `}
          >
            <div
              className={`
                w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all
                ${autoLaunch ? 'ltr:left-[22px] rtl:right-[22px]' : 'ltr:left-0.5 rtl:right-0.5'}
              `}
            />
          </button>
        </div>
      </section>

      {/* Privacy */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-theme-text-secondary" />
          <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider">
            {t('settings.privacy')}
          </h2>
        </div>
        <div className="bg-theme-card rounded-xl p-4 border border-theme-border/50 space-y-2">
          <p className="text-sm text-theme-text-secondary">{t('settings.privacyText')}</p>
          <ul className="space-y-1.5 text-xs text-theme-text-tertiary">
            <li>• {t('settings.privacyEncrypted', 'API keys are encrypted and stored locally')}</li>
            <li>• {t('settings.privacyAudio', 'Audio recordings are deleted after transcription')}</li>
            <li>• {t('settings.privacyNoTelemetry', 'No telemetry or analytics data is collected')}</li>
            <li>• {t('settings.privacyDirect', 'All AI requests go directly to your configured provider')}</li>
          </ul>
        </div>
      </section>
    </>
  )

  const renderAIProviderTab = (): JSX.Element => {
    const currentLLMProvider = LLM_PROVIDERS.find((p) => p.id === selectedLLM)!
    const currentVoiceProvider = VOICE_PROVIDERS.find((p) => p.id === selectedVoice)!

    // Determine which API key fields to show based on selected sub-tab
    const activeApiKeyId = providerSubTab === 'ai' ? selectedLLM : VOICE_API_KEY_ID[selectedVoice]
    const activeApiKeyLabel = providerSubTab === 'ai'
      ? LLM_API_KEY_LABELS[selectedLLM]
      : VOICE_API_KEY_LABELS[selectedVoice]

    return (
      <>
        {/* Sub-tab toggle: AI Provider / Transcription Provider */}
        <div className="flex gap-6 border-b border-theme-border/30 mb-6">
          <button
            onClick={() => setProviderSubTab('ai')}
            className={`
              flex items-center gap-2 pb-2.5 text-sm font-medium transition-all border-b-2 -mb-px
              ${providerSubTab === 'ai'
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
              ${providerSubTab === 'transcription'
                ? 'border-theme-text text-theme-text'
                : 'border-transparent text-theme-text-secondary hover:text-theme-text'
              }
            `}
          >
            <Mic className="w-4 h-4" />
            {t('settings.transcriptionProvider', 'Transcription')}
          </button>
        </div>

        {/* ── AI Provider sub-tab ────────────────────────────── */}
        {providerSubTab === 'ai' && (
          <>
            {/* Provider tabs with logos */}
            <section className="mb-6">
              <h2 className="text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider mb-3">
                {t('settings.selectProvider', 'Select Provider')}
              </h2>
              <div className="grid grid-cols-4 gap-2">
                {LLM_PROVIDERS.map((provider) => {
                  const LogoComponent = PROVIDER_LOGOS[provider.id]
                  const logoImage = PROVIDER_LOGO_IMAGES[provider.id]
                  const isSelected = selectedLLM === provider.id
                  return (
                    <button
                      key={provider.id}
                      onClick={() => handleSelectLLM(provider.id)}
                      className={`
                        relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all
                        ${isSelected
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
                        {logoImage
                          ? <img src={logoImage} alt="" className="w-8 h-8 object-contain rounded-xl" />
                          : <LogoComponent className="w-8 h-8" />
                        }
                      </div>
                      <span className={`text-xs font-medium ${isSelected ? 'text-sky-accent' : 'text-theme-text-secondary'}`}>
                        {provider.shortLabel}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Model selection for the active provider */}
            <section className="mb-6">
              <h2 className="text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider mb-3">
                {t('settings.llm', 'LLM')} — {currentLLMProvider.shortLabel}
              </h2>
              {PROVIDER_MODELS[selectedLLM].length > 5 && (
                <div className="relative mb-2">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-text-muted pointer-events-none" />
                  <input
                    type="text"
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    placeholder={t('settings.searchModels', 'Search models...')}
                    className="w-full bg-theme-surface/50 rounded-lg ps-9 pe-9 py-2 text-sm text-theme-text placeholder-theme-text-muted outline-none focus:ring-1 focus:ring-sky-accent/30 border border-theme-border/30"
                  />
                  {modelSearch && (
                    <button
                      onClick={() => setModelSearch('')}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-theme-text-muted hover:text-theme-text transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
              <div className="bg-theme-card rounded-xl border border-theme-border/50 overflow-hidden divide-y divide-theme-border/30 max-h-80 overflow-y-auto">
                {PROVIDER_MODELS[selectedLLM]
                  .filter((model) => {
                    if (!modelSearch) return true
                    const q = modelSearch.toLowerCase()
                    return model.label.toLowerCase().includes(q) || model.description.toLowerCase().includes(q) || model.id.toLowerCase().includes(q)
                  })
                  .map((model) => {
                  const isSelected = (models[selectedLLM] || DEFAULT_MODELS[selectedLLM]) === model.id
                  return (
                    <button
                      key={model.id}
                      onClick={() => handleModelChange(selectedLLM, model.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-start transition-all hover:bg-theme-surface/30"
                    >
                      <div className={`
                        w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0
                        ${isSelected
                          ? 'border-sky-accent bg-sky-accent'
                          : 'border-theme-border'
                        }
                      `}>
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
                {modelSearch && PROVIDER_MODELS[selectedLLM].filter((m) => {
                  const q = modelSearch.toLowerCase()
                  return m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
                }).length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-theme-text-muted">
                    {t('settings.noModelsFound', 'No models found')}
                  </div>
                )}
              </div>
            </section>

            {/* API Key for selected provider */}
            <section>
              <h2 className="text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider mb-3">
                {t('settings.apiKey', 'API Key')}
              </h2>
              <div className="bg-theme-card rounded-xl p-4 border border-theme-border/50">
                <label className="block text-xs text-theme-text-secondary mb-2">{activeApiKeyLabel}</label>
                <div className="flex items-center gap-2">
                  <input
                    type={visibleKeys[activeApiKeyId] ? 'text' : 'password'}
                    value={apiKeys[activeApiKeyId] || ''}
                    onChange={(e) => handleKeyChange(activeApiKeyId, e.target.value)}
                    placeholder={`Enter your API key`}
                    className="flex-1 bg-theme-surface/50 rounded-lg px-3 py-2 text-sm text-theme-text placeholder-theme-text-muted outline-none focus:ring-1 focus:ring-sky-accent/30 font-mono"
                  />
                  <button
                    onClick={() => toggleKeyVisibility(activeApiKeyId)}
                    className="w-9 h-9 rounded-lg bg-theme-surface/30 flex items-center justify-center text-theme-text-tertiary hover:text-theme-text transition-all"
                  >
                    {visibleKeys[activeApiKeyId] ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {apiKeys[activeApiKeyId] && (
                  <div className="flex items-center gap-1 mt-2">
                    <Check className="w-3 h-3 text-green-accent" />
                    <span className="text-xs text-green-accent/70">{t('settings.keySaved', 'Key saved')}</span>
                  </div>
                )}
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
          </>
        )}

        {/* ── Transcription Provider sub-tab ─────────────────── */}
        {providerSubTab === 'transcription' && (
          <>
            {/* Provider tabs with logos */}
            <section className="mb-6">
              <h2 className="text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider mb-3">
                {t('settings.selectProvider', 'Select Provider')}
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {VOICE_PROVIDERS.map((provider) => {
                  const LogoComponent = PROVIDER_LOGOS[provider.id]
                  const logoImage = PROVIDER_LOGO_IMAGES[provider.id]
                  const isSelected = selectedVoice === provider.id
                  return (
                    <button
                      key={provider.id}
                      onClick={() => handleSelectVoice(provider.id)}
                      className={`
                        relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                        ${isSelected
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
                        {logoImage
                          ? <img src={logoImage} alt="" className="w-10 h-10 object-contain rounded-xl" />
                          : <LogoComponent className="w-10 h-10" />
                        }
                      </div>
                      <div className="text-center">
                        <span className={`text-sm font-medium ${isSelected ? 'text-sky-accent' : 'text-theme-text'}`}>
                          {provider.shortLabel}
                        </span>
                        <p className="text-[10px] text-theme-text-tertiary mt-0.5">{provider.description}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Model selection for the active voice provider */}
            <section className="mb-6">
              <h2 className="text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider mb-3">
                {t('settings.selectModel', 'Select Model')} — {currentVoiceProvider.shortLabel}
              </h2>
              {VOICE_PROVIDER_MODELS[selectedVoice].length > 5 && (
                <div className="relative mb-2">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-text-muted pointer-events-none" />
                  <input
                    type="text"
                    value={voiceModelSearch}
                    onChange={(e) => setVoiceModelSearch(e.target.value)}
                    placeholder={t('settings.searchModels', 'Search models...')}
                    className="w-full bg-theme-surface/50 rounded-lg ps-9 pe-9 py-2 text-sm text-theme-text placeholder-theme-text-muted outline-none focus:ring-1 focus:ring-sky-accent/30 border border-theme-border/30"
                  />
                  {voiceModelSearch && (
                    <button
                      onClick={() => setVoiceModelSearch('')}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-theme-text-muted hover:text-theme-text transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
              <div className="bg-theme-card rounded-xl border border-theme-border/50 overflow-hidden divide-y divide-theme-border/30 max-h-80 overflow-y-auto">
                {VOICE_PROVIDER_MODELS[selectedVoice]
                  .filter((model) => {
                    if (!voiceModelSearch) return true
                    const q = voiceModelSearch.toLowerCase()
                    return model.label.toLowerCase().includes(q) || model.description.toLowerCase().includes(q) || model.id.toLowerCase().includes(q)
                  })
                  .map((model) => {
                  const isSelected = (voiceModels[selectedVoice] || DEFAULT_VOICE_MODELS[selectedVoice]) === model.id
                  return (
                    <button
                      key={model.id}
                      onClick={() => handleVoiceModelChange(selectedVoice, model.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-start transition-all hover:bg-theme-surface/30"
                    >
                      <div className={`
                        w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0
                        ${isSelected
                          ? 'border-sky-accent bg-sky-accent'
                          : 'border-theme-border'
                        }
                      `}>
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
                {voiceModelSearch && VOICE_PROVIDER_MODELS[selectedVoice].filter((m) => {
                  const q = voiceModelSearch.toLowerCase()
                  return m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
                }).length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-theme-text-muted">
                    {t('settings.noModelsFound', 'No models found')}
                  </div>
                )}
              </div>
            </section>

            {/* API Key for selected voice provider */}
            <section>
              <h2 className="text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider mb-3">
                {t('settings.apiKey', 'API Key')}
              </h2>
              <div className="bg-theme-card rounded-xl p-4 border border-theme-border/50">
                <label className="block text-xs text-theme-text-secondary mb-2">{activeApiKeyLabel}</label>
                <div className="flex items-center gap-2">
                  <input
                    type={visibleKeys[activeApiKeyId] ? 'text' : 'password'}
                    value={apiKeys[activeApiKeyId] || ''}
                    onChange={(e) => handleKeyChange(activeApiKeyId, e.target.value)}
                    placeholder={`Enter your API key`}
                    className="flex-1 bg-theme-surface/50 rounded-lg px-3 py-2 text-sm text-theme-text placeholder-theme-text-muted outline-none focus:ring-1 focus:ring-sky-accent/30 font-mono"
                  />
                  <button
                    onClick={() => toggleKeyVisibility(activeApiKeyId)}
                    className="w-9 h-9 rounded-lg bg-theme-surface/30 flex items-center justify-center text-theme-text-tertiary hover:text-theme-text transition-all"
                  >
                    {visibleKeys[activeApiKeyId] ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {apiKeys[activeApiKeyId] && (
                  <div className="flex items-center gap-1 mt-2">
                    <Check className="w-3 h-3 text-green-accent" />
                    <span className="text-xs text-green-accent/70">{t('settings.keySaved', 'Key saved')}</span>
                  </div>
                )}
                {selectedVoice === 'whisper' && (
                  <p className="text-[10px] text-theme-text-muted mt-2 italic">
                    {t('settings.whisperSharesKey', 'Whisper uses the same API key as Together AI.')}
                  </p>
                )}
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
          </>
        )}
      </>
    )
  }

  const FN_COMBO_KEYS = [
    { key: 'Space', label: 'Space' },
    { key: 'S', label: 'S' },
    { key: 'R', label: 'R' },
    { key: 'D', label: 'D' },
    { key: 'F', label: 'F' },
    { key: 'J', label: 'J' },
    { key: 'K', label: 'K' }
  ]

  const renderShortcutsTab = (): JSX.Element => {
    const isFnBased = shortcuts.record.toUpperCase().startsWith('FN+')
    const fnSecondKey = isFnBased ? shortcuts.record.split('+').slice(1).join('+') : ''

    return (
      <>
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-theme-text-secondary" />
              <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider">
                {t('settings.keyboardShortcuts')}
              </h2>
            </div>
            <button
              onClick={handleResetShortcuts}
              className="flex items-center gap-1.5 text-xs text-theme-text-tertiary hover:text-theme-text-secondary transition-colors"
              title={t('settings.reset')}
            >
              <RotateCcw className="w-3 h-3" />
              {t('settings.reset')}
            </button>
          </div>
          <div className="space-y-4">
            <ShortcutRecorder
              label={t('settings.shortcutRecord')}
              description={t('settings.shortcutRecordDesc')}
              value={shortcuts.record}
              onChange={(v) => handleShortcutChange('record', v)}
              pressKeysText={t('settings.pressKeys')}
              disabled={isFnBased}
            />
          </div>

          {/* Fn (Globe) key combos — macOS only */}
          {isMac && (
            <div className="mt-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">🌐</span>
                <p className="text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider">
                  {t('settings.fnKey', 'Fn (Globe) Key')}
                </p>
              </div>
              <p className="text-xs text-theme-text-tertiary mb-3">
                {t('settings.fnKeyDesc', 'Use the Globe/Fn key combined with another key to start and stop recording')}
              </p>
              <div className="flex flex-wrap gap-2">
                {FN_COMBO_KEYS.map((combo) => {
                  const comboValue = `Fn+${combo.key}`
                  const isActive = shortcuts.record.toUpperCase() === comboValue.toUpperCase()
                  return (
                    <button
                      key={combo.key}
                      onClick={() => {
                        if (isActive) {
                          handleShortcutChange('record', DEFAULT_SHORTCUTS.record)
                        } else {
                          handleShortcutChange('record', comboValue)
                        }
                      }}
                      className={`
                        px-3 py-2 rounded-lg text-sm font-mono transition-all border
                        ${isActive
                          ? 'bg-sky-accent/15 border-sky-accent/50 text-sky-accent'
                          : 'bg-theme-card border-theme-border/50 text-theme-text-secondary hover:border-theme-border hover:text-theme-text'
                        }
                      `}
                    >
                      🌐 + {combo.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      </>
    )
  }

  const renderAboutTab = (): JSX.Element => (
    <>
      <section>
        <div className="bg-theme-card rounded-xl p-4 border border-theme-border/50">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center">
              <img src={appLogo} alt="TapWisper" className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="text-sm font-medium text-theme-text">TapWisper Desktop</p>
              <p className="text-xs text-theme-text-tertiary">Version 1.0.0</p>
            </div>
          </div>
          <div className="space-y-1 text-xs text-theme-text-muted">
            <p>Platform: {platformInfo?.platform || 'Loading...'}</p>
            <p>Electron: {platformInfo?.version || 'Loading...'}</p>
          </div>
        </div>
      </section>

      {/* Privacy (also shown in About for quick access) */}
      <section className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-theme-text-secondary" />
          <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider">
            {t('settings.privacy')}
          </h2>
        </div>
        <div className="bg-theme-card rounded-xl p-4 border border-theme-border/50 space-y-2">
          <p className="text-sm text-theme-text-secondary">{t('settings.privacyText')}</p>
          <ul className="space-y-1.5 text-xs text-theme-text-tertiary">
            <li>• {t('settings.privacyEncrypted', 'API keys are encrypted and stored locally')}</li>
            <li>• {t('settings.privacyAudio', 'Audio recordings are deleted after transcription')}</li>
            <li>• {t('settings.privacyNoTelemetry', 'No telemetry or analytics data is collected')}</li>
            <li>• {t('settings.privacyDirect', 'All AI requests go directly to your configured provider')}</li>
          </ul>
        </div>
      </section>
    </>
  )

  // ── Render ─────────────────────────────────────────────────

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
            <span className="hidden sm:inline">{t(tab.labelKey, tab.id === 'general' ? 'General' : tab.id === 'ai-provider' ? 'AI Provider' : tab.id === 'shortcuts' ? 'Shortcuts' : 'About')}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'general' && renderGeneralTab()}
      {activeTab === 'ai-provider' && renderAIProviderTab()}
      {activeTab === 'shortcuts' && renderShortcutsTab()}
      {activeTab === 'about' && renderAboutTab()}
    </div>
  )
}
