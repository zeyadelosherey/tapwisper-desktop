import { type JSX, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  Info,
  Monitor,
  Moon,
  Sun,
  Keyboard,
  RotateCcw,
  Eye,
  EyeOff,
  Check,
  Cpu,
  Settings2,
  Mic,
  Search,
  X,
  Mail,
  ShieldCheck,
  BookA,
  ArrowRight,
  Lock
} from 'lucide-react'
import { updateDirection } from '../i18n'
import { testApiKey, type KeyProvider, type KeyTestResult } from '../services/key-test'
import appLogo from '../assets/logo.png'
import geminiLogo from '../assets/google.png'
import openaiLogo from '../assets/openai.png'
import claudeLogo from '../assets/claude.png'
import togetherLogo from '../assets/together.png'
import sonioxLogo from '../assets/soniox.png'
import type { LLMProvider, VoiceProvider } from '../constants/providers'
import { UI_LANGUAGES, languageName, normalizeSpeechLanguages } from '../constants/speech-languages'
import { DEFAULT_RECORD_SHORTCUT, shortcutParts } from '../utils/shortcuts'
import { useRecordShortcut } from '../hooks/use-record-shortcut'
import { ShortcutKeys, Keycap } from '../components/ui/keycap'
import {
  Callout,
  Page,
  PageHeader,
  Row,
  RowGroup,
  Section,
  Segmented,
  Switch
} from '../components/ui/primitives'
import { ShortcutPicker } from '../components/shortcut-picker'
import { SpeechLanguagePicker } from '../components/speech-language-picker'
import { MicrophonePicker } from '../components/microphone-picker'
import type { Navigate } from './main-window'

type Theme = 'system' | 'dark' | 'light'
export type SettingsTab = 'general' | 'speech' | 'ai-provider' | 'shortcuts' | 'about'
type ProviderSubTab = 'ai' | 'transcription'

// ── Provider Logos (inline SVGs) ────────────────────────────────

function GeminiLogo({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2C12 2 14.5 7.5 17.5 10.5C20.5 13.5 22 12 22 12C22 12 20.5 14.5 17.5 17.5C14.5 20.5 12 22 12 22C12 22 9.5 20.5 6.5 17.5C3.5 14.5 2 12 2 12C2 12 3.5 9.5 6.5 6.5C9.5 3.5 12 2 12 2Z"
        fill="url(#gemini-grad)"
      />
      <defs>
        <linearGradient id="gemini-grad" x1="2" y1="2" x2="22" y2="22">
          <stop stopColor="#4285F4" />
          <stop offset="0.5" stopColor="#9B72CB" />
          <stop offset="1" stopColor="#D96570" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function OpenAILogo({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  )
}

function ClaudeLogo({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.709 15.955l4.72-2.756.08-.053-.08-.053-4.72-2.756C3.077 9.437 2 7.985 2 6.265A4.265 4.265 0 0 1 6.265 2c1.72 0 3.172 1.077 4.072 2.709L12 8.44l1.663-3.731C14.563 3.077 16.015 2 17.735 2A4.265 4.265 0 0 1 22 6.265c0 1.72-1.077 3.172-2.709 4.072L14.571 13.1l.08.053 4.64 2.802C20.923 16.855 22 18.307 22 20.027A3.973 3.973 0 0 1 18.027 24c-1.72 0-3.172-1.077-4.072-2.709L12 17.56l-1.955 3.731C9.145 22.923 7.693 24 5.973 24A3.973 3.973 0 0 1 2 20.027c0-1.72 1.077-3.172 2.709-4.072z" />
    </svg>
  )
}

function TogetherLogo({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18L19.82 8 12 11.82 4.18 8 12 4.18zM4 9.18l7 3.5V19.5l-7-3.5V9.18zm16 0v6.82l-7 3.5v-6.82l7-3.5z" />
    </svg>
  )
}

function WhisperLogo({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
    </svg>
  )
}

function SonioxLogo({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM8 11a1 1 0 0 0-2 0 6 6 0 0 0 12 0 1 1 0 0 0-2 0 4 4 0 0 1-8 0zm5 8.94A7 7 0 0 0 19 13h-2a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.94V23h2v-3.06z" />
    </svg>
  )
}

const PROVIDER_LOGOS: Record<string, (props: { className?: string }) => JSX.Element> = {
  gemini: GeminiLogo,
  openai: OpenAILogo,
  claude: ClaudeLogo,
  together: TogetherLogo,
  whisper: WhisperLogo,
  'openai-whisper': OpenAILogo,
  soniox: SonioxLogo
}

/** Provider logo images (use when available; otherwise fall back to SVG in PROVIDER_LOGOS) */
const PROVIDER_LOGO_IMAGES: Partial<Record<string, string>> = {
  gemini: geminiLogo,
  openai: openaiLogo,
  claude: claudeLogo,
  together: togetherLogo,
  whisper: togetherLogo,
  'openai-whisper': openaiLogo,
  soniox: sonioxLogo
}

const LLM_PROVIDERS: { id: LLMProvider; label: string; shortLabel: string; color: string }[] = [
  { id: 'gemini', label: 'Google Gemini', shortLabel: 'Gemini', color: '#4285F4' },
  { id: 'openai', label: 'OpenAI', shortLabel: 'OpenAI', color: '#10A37F' },
  { id: 'claude', label: 'Anthropic Claude', shortLabel: 'Claude', color: '#D97757' },
  { id: 'together', label: 'Together AI', shortLabel: 'Together', color: '#FF6B35' }
]

const VOICE_PROVIDERS: {
  id: VoiceProvider
  label: string
  shortLabel: string
  description: string
  color: string
}[] = [
  {
    id: 'whisper',
    label: 'Together Whisper',
    shortLabel: 'Whisper',
    description: 'Whisper Large v3 via Together AI',
    color: '#10A37F'
  },
  {
    id: 'openai-whisper',
    label: 'OpenAI Whisper',
    shortLabel: 'OpenAI',
    description: 'Whisper & GPT-4o Transcribe via OpenAI',
    color: '#412991'
  },
  {
    id: 'soniox',
    label: 'Soniox',
    shortLabel: 'Soniox',
    description: 'Soniox async speech-to-text',
    color: '#7EB6E0'
  }
]

const PROVIDER_MODELS: Record<LLMProvider, { id: string; label: string; description: string }[]> = {
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Fast & efficient' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Advanced reasoning' },
    {
      id: 'gemini-3-flash-preview',
      label: 'Gemini 3 Flash (Preview)',
      description: 'Next-gen speed'
    },
    { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (Preview)', description: 'Next-gen quality' }
  ],
  together: [
    {
      id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      label: 'Llama 3.3 70B Turbo',
      description: 'Fast open-source'
    },
    {
      id: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
      label: 'Llama 4 Maverick',
      description: '1M context, 128 experts'
    },
    { id: 'moonshotai/Kimi-K2.5', label: 'Kimi K2.5', description: '1T params, 256K context' },
    {
      id: 'moonshotai/Kimi-K2-Instruct-0905',
      label: 'Kimi K2 Instruct',
      description: '262K context'
    },
    {
      id: 'moonshotai/Kimi-K2-Thinking',
      label: 'Kimi K2 Thinking',
      description: 'Reasoning model'
    },
    { id: 'MiniMaxAI/MiniMax-M2.5', label: 'MiniMax M2.5', description: '228K context' },
    { id: 'deepseek-ai/DeepSeek-V3.1', label: 'DeepSeek V3.1', description: '128K context' },
    { id: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1', description: 'Reasoning model' },
    { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', description: 'Open-source GPT' },
    { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', description: 'Lightweight open GPT' },
    { id: 'zai-org/GLM-5', label: 'GLM-5', description: '202K context' },
    { id: 'zai-org/GLM-4.7', label: 'GLM 4.7', description: '202K context' },
    {
      id: 'Qwen/Qwen3-235B-A22B-Thinking-2507',
      label: 'Qwen3 235B Thinking',
      description: 'Reasoning, 262K context'
    },
    {
      id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8',
      label: 'Qwen3-Coder 480B',
      description: 'Coding specialist'
    },
    { id: 'Qwen/Qwen3-Coder-Next-FP8', label: 'Qwen3-Coder-Next', description: 'Next-gen coding' },
    {
      id: 'Qwen/Qwen3-235B-A22B-Instruct-2507-tput',
      label: 'Qwen3 235B Instruct',
      description: 'Large multilingual'
    },
    {
      id: 'Qwen/Qwen3-Next-80B-A3B-Instruct',
      label: 'Qwen3-Next 80B Instruct',
      description: 'Efficient MoE'
    },
    {
      id: 'Qwen/Qwen3-Next-80B-A3B-Thinking',
      label: 'Qwen3-Next 80B Thinking',
      description: 'Reasoning MoE'
    },
    { id: 'deepcogito/cogito-v2-1-671b', label: 'Cogito v2.1 671B', description: 'Deep reasoning' },
    {
      id: 'mistralai/Ministral-3-14B-Instruct-2512',
      label: 'Ministral 3 14B',
      description: '262K context'
    },
    {
      id: 'mistralai/Mistral-Small-24B-Instruct-2501',
      label: 'Mistral Small 3 24B',
      description: 'Balanced performance'
    },
    {
      id: 'nvidia/NVIDIA-Nemotron-Nano-9B-v2',
      label: 'Nemotron Nano 9B v2',
      description: '131K context'
    },
    { id: 'google/gemma-3n-E4B-it', label: 'Gemma 3N E4B', description: 'Lightweight Google' },
    {
      id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
      label: 'Llama 3.1 8B Turbo',
      description: 'Fast & light'
    },
    {
      id: 'Qwen/Qwen2.5-7B-Instruct-Turbo',
      label: 'Qwen 2.5 7B Turbo',
      description: 'Compact multilingual'
    },
    {
      id: 'meta-llama/Llama-3.2-3B-Instruct-Turbo',
      label: 'Llama 3.2 3B Turbo',
      description: 'Ultra-light'
    },
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

const VOICE_PROVIDER_MODELS: Record<
  VoiceProvider,
  { id: string; label: string; description: string }[]
> = {
  whisper: [
    { id: 'openai/whisper-large-v3', label: 'Whisper Large v3', description: 'Best accuracy' },
    {
      id: 'mistralai/Voxtral-Mini-3B-2507',
      label: 'Voxtral Mini 3B',
      description: 'Fast multilingual STT'
    }
  ],
  'openai-whisper': [
    { id: 'whisper-1', label: 'Whisper-1', description: 'Reliable, multilingual' },
    { id: 'gpt-4o-transcribe', label: 'GPT-4o Transcribe', description: 'Highest quality' },
    {
      id: 'gpt-4o-mini-transcribe',
      label: 'GPT-4o Mini Transcribe',
      description: 'Fast & affordable'
    }
  ],
  soniox: [
    { id: 'stt-async-v4', label: 'Soniox STT Async v4', description: 'Multilingual, high accuracy' }
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
  'openai-whisper': 'whisper-1',
  soniox: 'stt-async-v4'
}

/** Provider names shown in the "<provider> API Key" label */
const LLM_API_KEY_PROVIDERS: Record<LLMProvider, string> = {
  gemini: 'Google Gemini',
  together: 'Together AI',
  openai: 'OpenAI',
  claude: 'Anthropic'
}

const VOICE_API_KEY_PROVIDERS: Record<VoiceProvider, string> = {
  whisper: 'Together AI',
  'openai-whisper': 'OpenAI',
  soniox: 'Soniox'
}

/** Translation keys for the fixed model descriptions above (model names are never translated) */
const MODEL_DESCRIPTION_KEYS: Record<string, string> = {
  'Fast & efficient': 'fastEfficient',
  'Advanced reasoning': 'advancedReasoning',
  'Next-gen speed': 'nextGenSpeed',
  'Next-gen quality': 'nextGenQuality',
  'Fast open-source': 'fastOpenSource',
  'Reasoning model': 'reasoningModel',
  'Open-source GPT': 'openSourceGpt',
  'Lightweight open GPT': 'lightweightOpenGpt',
  'Coding specialist': 'codingSpecialist',
  'Next-gen coding': 'nextGenCoding',
  'Large multilingual': 'largeMultilingual',
  'Efficient MoE': 'efficientMoe',
  'Reasoning MoE': 'reasoningMoe',
  'Deep reasoning': 'deepReasoning',
  'Balanced performance': 'balancedPerformance',
  'Lightweight Google': 'lightweightGoogle',
  'Fast & light': 'fastLight',
  'Compact multilingual': 'compactMultilingual',
  'Ultra-light': 'ultraLight',
  'Flagship model': 'flagshipModel',
  'Ultra-fast': 'ultraFast',
  'Next-gen compact': 'nextGenCompact',
  'Most capable': 'mostCapable',
  'Latest flagship': 'latestFlagship',
  'Best balance': 'bestBalance',
  'Best accuracy': 'bestAccuracy',
  'Fast multilingual STT': 'fastMultilingualStt',
  'Reliable, multilingual': 'reliableMultilingual',
  'Highest quality': 'highestQuality',
  'Fast & affordable': 'fastAffordable',
  'Multilingual, high accuracy': 'multilingualHighAccuracy'
}

function modelDescription(t: TFunction, description: string): string {
  const key = MODEL_DESCRIPTION_KEYS[description]
  if (key) return t(`modelDescriptions.${key}`, description)
  let m = /^(\S+) context$/.exec(description)
  if (m) return t('modelDescriptions.context', '{{size}} context', { size: m[1] })
  m = /^(\S+) context, (\d+) experts$/.exec(description)
  if (m) {
    return t('modelDescriptions.contextExperts', '{{size}} context, {{experts}} experts', {
      size: m[1],
      experts: m[2]
    })
  }
  m = /^(\S+) params, (\S+) context$/.exec(description)
  if (m) {
    return t('modelDescriptions.paramsContext', '{{params}} params, {{size}} context', {
      params: m[1],
      size: m[2]
    })
  }
  m = /^Reasoning, (\S+) context$/.exec(description)
  if (m) {
    return t('modelDescriptions.reasoningContext', 'Reasoning, {{size}} context', { size: m[1] })
  }
  return description
}

/** Model search matches the id, the name and the description in either language */
function modelMatches(
  t: TFunction,
  model: { id: string; label: string; description: string },
  query: string
): boolean {
  const q = query.toLowerCase()
  return (
    model.label.toLowerCase().includes(q) ||
    model.description.toLowerCase().includes(q) ||
    modelDescription(t, model.description).toLowerCase().includes(q) ||
    model.id.toLowerCase().includes(q)
  )
}

/** Which API key ID to use for a voice provider (whisper shares together's key, openai-whisper shares openai's key) */
const VOICE_API_KEY_ID: Record<VoiceProvider, string> = {
  whisper: 'together',
  'openai-whisper': 'openai',
  soniox: 'soniox'
}

// ── Tabs ─────────────────────────────────────────────────────────

const TABS: { id: SettingsTab; labelKey: string; fallback: string; icon: ReactNode }[] = [
  {
    id: 'general',
    labelKey: 'settings.tabGeneral',
    fallback: 'General',
    icon: <Settings2 className="h-4 w-4" />
  },
  {
    id: 'speech',
    labelKey: 'settings.tabSpeech',
    fallback: 'Speech',
    icon: <Mic className="h-4 w-4" />
  },
  {
    id: 'ai-provider',
    labelKey: 'settings.tabAIProvider',
    fallback: 'AI Provider',
    icon: <Cpu className="h-4 w-4" />
  },
  {
    id: 'shortcuts',
    labelKey: 'settings.tabShortcuts',
    fallback: 'Shortcuts',
    icon: <Keyboard className="h-4 w-4" />
  },
  {
    id: 'about',
    labelKey: 'settings.tabAbout',
    fallback: 'About',
    icon: <Info className="h-4 w-4" />
  }
]

function applyTheme(value: Theme): void {
  const dark =
    value === 'dark' ||
    (value === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

// ── API key status + test ───────────────────────────────────────

function ApiKeyStatus({
  provider,
  apiKey
}: {
  provider: KeyProvider
  apiKey: string
}): JSX.Element {
  const { t } = useTranslation()
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<KeyTestResult | null>(null)

  // A different key or provider invalidates the previous result
  useEffect(() => setResult(null), [provider, apiKey])

  const runTest = async (): Promise<void> => {
    setTesting(true)
    setResult(await testApiKey(provider, apiKey))
    setTesting(false)
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2.5">
      <span className="inline-flex items-center gap-1.5 text-[12px] text-success">
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        {t('settings.keySaved', 'Key saved')}
      </span>
      <button type="button" onClick={runTest} disabled={testing} className="btn-secondary btn-sm">
        {testing ? t('settings.testingKey', 'Testing…') : t('settings.testKey', 'Test key')}
      </button>
      {result && (
        <span role="status" className={`text-[12px] ${result.ok ? 'text-success' : 'text-danger'}`}>
          {result.message}
        </span>
      )}
    </div>
  )
}

/** Provider tile with logo */
function ProviderTile({
  id,
  label,
  description,
  selected,
  onSelect
}: {
  id: string
  label: string
  description?: string
  selected: boolean
  onSelect: () => void
}): JSX.Element {
  const LogoComponent = PROVIDER_LOGOS[id]
  const logoImage = PROVIDER_LOGO_IMAGES[id]
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`relative flex flex-col items-center gap-2.5 rounded-xl border px-3 py-4 text-center transition-[border-color,box-shadow,background-color] duration-200 ease-out ${
        selected
          ? 'border-signal bg-signal-tint/40 ring-4 ring-signal/10'
          : 'border-hairline bg-raised hover:border-hairline-strong'
      }`}
    >
      {selected && (
        <span className="absolute end-2.5 top-2.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-signal text-on-signal">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
      <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl">
        {logoImage ? (
          <img src={logoImage} alt="" className="h-9 w-9 rounded-xl object-contain" />
        ) : (
          <LogoComponent className="h-8 w-8" />
        )}
      </span>
      <span className="block">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">
            {description}
          </span>
        )}
      </span>
    </button>
  )
}

/** Searchable radio list of models */
function ModelList({
  models,
  selectedId,
  onSelect,
  search,
  onSearch
}: {
  models: { id: string; label: string; description: string }[]
  selectedId: string
  onSelect: (id: string) => void
  search: string
  onSearch: (value: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  const visible = models.filter((m) => !search || modelMatches(t, m, search))
  return (
    <>
      {models.length > 5 && (
        <div className="relative mb-2.5">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t('settings.searchModels', 'Search models...')}
            aria-label={t('settings.searchModels', 'Search models...')}
            className="field h-9 pe-9 ps-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearch('')}
              aria-label={t('home.clearSearch', 'Clear search')}
              className="icon-btn absolute end-1 top-1/2 h-7 w-7 -translate-y-1/2"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      <div role="radiogroup" className="card max-h-80 divide-y divide-hairline overflow-y-auto">
        {visible.map((model) => {
          const isSelected = selectedId === model.id
          return (
            <button
              key={model.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(model.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors duration-200 hover:bg-panel"
            >
              <span
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${
                  isSelected ? 'border-signal bg-signal text-on-signal' : 'border-hairline-strong'
                }`}
              >
                {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-[13.5px] font-medium ${isSelected ? 'text-signal' : 'text-ink'}`}
                >
                  {model.label}
                </span>
                <span className="block text-[12px] text-ink-muted">
                  {modelDescription(t, model.description)}
                </span>
              </span>
            </button>
          )
        })}
        {visible.length === 0 && (
          <div className="px-3 py-4 text-center text-[13px] text-ink-muted">
            {t('settings.noModelsFound', 'No models found')}
          </div>
        )}
      </div>
    </>
  )
}

// ── Main Settings Component ─────────────────────────────────────

export function Settings({
  onNavigate,
  initialTab
}: {
  onNavigate?: Navigate
  initialTab?: SettingsTab
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? 'general')

  // General
  const [language, setLanguage] = useState('en')
  const [theme, setTheme] = useState<Theme>('system')
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [appVersion, setAppVersion] = useState('')

  // Speech
  const [speechLanguages, setSpeechLanguages] = useState<string[]>([])
  const [microphoneId, setMicrophoneId] = useState('')
  const [keepMicWarm, setKeepMicWarm] = useState(false)
  const [keepRecordings, setKeepRecordings] = useState(true)

  // AI Provider
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

  // Shortcuts
  const { shortcut, save: saveShortcut } = useRecordShortcut()

  // About
  const [platformInfo, setPlatformInfo] = useState<{
    platform: string
    isMac: boolean
    version: string
  } | null>(null)

  useEffect(() => {
    window.tapwisper.app
      .getVersion()
      .then(setAppVersion)
      .catch(() => {})
  }, [])

  // ── Load all config on mount ───────────────────────────────

  useEffect(() => {
    Promise.all([
      window.tapwisper.store.get('language'),
      window.tapwisper.store.get('theme'),
      window.tapwisper.store.get('autoLaunch'),
      window.tapwisper.platform.info(),
      window.tapwisper.store.get('aiProvider'),
      window.tapwisper.store.get('voiceProvider'),
      window.tapwisper.store.get('apiKeys'),
      window.tapwisper.store.get('models'),
      window.tapwisper.store.get('voiceModels'),
      window.tapwisper.store.get('speechLanguages'),
      window.tapwisper.store.get('keepMicWarm'),
      window.tapwisper.store.get('microphoneDeviceId'),
      window.tapwisper.store.get('keepRecordings')
    ]).then(
      ([lang, th, auto, platform, llm, voice, keys, mdls, vMdls, sLangs, warm, mic, keepRec]) => {
        setSpeechLanguages(normalizeSpeechLanguages(sLangs))
        if (typeof warm === 'boolean') setKeepMicWarm(warm)
        if (typeof mic === 'string') setMicrophoneId(mic)
        if (typeof keepRec === 'boolean') setKeepRecordings(keepRec)
        if (lang) setLanguage(lang as string)
        else setLanguage(i18n.language)
        if (th) setTheme(th as Theme)
        if (auto !== undefined) setAutoLaunch(auto as boolean)
        setPlatformInfo(platform as { platform: string; isMac: boolean; version: string })
        if (llm) setSelectedLLM(llm as LLMProvider)
        if (voice) setSelectedVoice(voice as VoiceProvider)
        if (keys) setApiKeys(keys as Record<string, string>)
        if (mdls) setModels({ ...DEFAULT_MODELS, ...(mdls as Record<string, string>) })
        if (vMdls) setVoiceModels({ ...DEFAULT_VOICE_MODELS, ...(vMdls as Record<string, string>) })
      }
    )
  }, [i18n])

  // Follow OS theme changes when "system" is selected
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = (): void => {
      if (theme === 'system') applyTheme('system')
    }
    mediaQuery.addEventListener('change', handleSystemThemeChange)
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
  }, [theme])

  // ── General handlers ───────────────────────────────────────

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

  // ── Speech handlers ────────────────────────────────────────

  const handleSpeechLanguagesChange = useCallback((codes: string[]) => {
    setSpeechLanguages(codes)
    window.tapwisper.store.set('speechLanguages', codes)
  }, [])

  const handleMicrophoneChange = useCallback((id: string) => {
    setMicrophoneId(id)
    window.tapwisper.store.set('microphoneDeviceId', id)
  }, [])

  const handleKeepMicWarmChange = useCallback((value: boolean) => {
    setKeepMicWarm(value)
    window.tapwisper.store.set('keepMicWarm', value)
  }, [])

  const handleKeepRecordingsChange = useCallback((value: boolean) => {
    setKeepRecordings(value)
    window.tapwisper.store.set('keepRecordings', value)
  }, [])

  // ── AI Provider handlers ───────────────────────────────────

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

  // Persist API keys debounced: every write re-encrypts the whole key set
  const pendingKeysRef = useRef<Record<string, string> | null>(null)
  const keySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushApiKeys = useCallback(() => {
    if (keySaveTimerRef.current) clearTimeout(keySaveTimerRef.current)
    keySaveTimerRef.current = null
    if (!pendingKeysRef.current) return
    // Pasted keys often carry stray whitespace/newlines, which providers reject with 401
    const trimmed = Object.fromEntries(
      Object.entries(pendingKeysRef.current).map(([k, v]) => [k, v.trim()])
    )
    pendingKeysRef.current = null
    window.tapwisper.store.set('apiKeys', trimmed)
  }, [])
  useEffect(() => flushApiKeys, [flushApiKeys])

  const handleKeyChange = useCallback(
    (provider: string, value: string) => {
      const updated = { ...apiKeys, [provider]: value }
      setApiKeys(updated)
      pendingKeysRef.current = updated
      if (keySaveTimerRef.current) clearTimeout(keySaveTimerRef.current)
      keySaveTimerRef.current = setTimeout(flushApiKeys, 400)
    },
    [apiKeys, flushApiKeys]
  )

  const toggleKeyVisibility = useCallback((provider: string) => {
    setVisibleKeys((prev) => ({ ...prev, [provider]: !prev[provider] }))
  }, [])

  // ── Tab renderers ──────────────────────────────────────────

  const renderGeneralTab = (): JSX.Element => (
    <>
      <Section title={t('settings.appearance', 'Appearance')}>
        <RowGroup>
          <Row
            title={t('settings.language', 'Language')}
            description={t('settings.languageHint', 'The language of TapWisper itself.')}
            htmlFor="ui-language"
            control={
              <select
                id="ui-language"
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="field h-9 w-56"
              >
                {UI_LANGUAGES.map((lang) => {
                  const localized = languageName(lang.code, i18n.language, lang.label)
                  return (
                    <option key={lang.code} value={lang.code}>
                      {localized === lang.nativeLabel
                        ? lang.nativeLabel
                        : `${lang.nativeLabel} — ${localized}`}
                    </option>
                  )
                })}
              </select>
            }
          />
          <Row
            title={t('settings.theme', 'Theme')}
            control={
              <Segmented<Theme>
                label={t('settings.theme', 'Theme')}
                value={theme}
                onChange={handleThemeChange}
                options={[
                  {
                    value: 'system',
                    label: t('settings.system', 'System'),
                    icon: <Monitor className="h-3.5 w-3.5" />
                  },
                  {
                    value: 'light',
                    label: t('settings.light', 'Light'),
                    icon: <Sun className="h-3.5 w-3.5" />
                  },
                  {
                    value: 'dark',
                    label: t('settings.dark', 'Dark'),
                    icon: <Moon className="h-3.5 w-3.5" />
                  }
                ]}
              />
            }
          />
          <Row
            title={t('settings.launchAtStartup', 'Launch at startup')}
            description={t('settings.launchHint', 'Start TapWisper when you log in')}
            control={
              <Switch
                checked={autoLaunch}
                onChange={handleAutoLaunchChange}
                label={t('settings.launchAtStartup', 'Launch at startup')}
              />
            }
          />
        </RowGroup>
      </Section>
      <PrivacySection keepRecordings={keepRecordings} />
    </>
  )

  const renderSpeechTab = (): JSX.Element => (
    <>
      <Section title={t('mic.device', 'Microphone')}>
        <RowGroup>
          <div className="px-3.5 py-2.5">
            <MicrophonePicker
              deviceId={microphoneId}
              onChange={handleMicrophoneChange}
              variant="compact"
            />
          </div>
          <Row
            title={t('settings.keepMicWarm', 'Keep microphone ready')}
            description={t(
              'settings.keepMicWarmHint',
              'Starts recording instantly, but keeps the microphone open (mic indicator stays on; Bluetooth headsets switch to call quality).'
            )}
            control={
              <Switch
                checked={keepMicWarm}
                onChange={handleKeepMicWarmChange}
                label={t('settings.keepMicWarm', 'Keep microphone ready')}
              />
            }
          />
          <Row
            title={t('settings.keepRecordings', 'Keep recordings for replay')}
            description={t(
              'settings.keepRecordingsHint',
              'Lets you replay a dictation or transcribe it again from History. Audio never leaves this device, and only the last 50 are kept.'
            )}
            control={
              <Switch
                checked={keepRecordings}
                onChange={handleKeepRecordingsChange}
                label={t('settings.keepRecordings', 'Keep recordings for replay')}
              />
            }
          />
        </RowGroup>
      </Section>

      <Section
        title={t('settings.speechLanguages', 'Spoken languages')}
        description={t(
          'settings.speechLanguagesHint',
          'Pick the languages you dictate in. Auto-detect works for most people; choosing helps short phrases come out in the right language.'
        )}
      >
        <SpeechLanguagePicker value={speechLanguages} onChange={handleSpeechLanguagesChange} />
      </Section>

      <Section title={t('nav.dictionary', 'Dictionary')}>
        <div className="card flex items-center gap-4 px-3.5 py-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-signal-tint text-signal">
            <BookA className="h-5 w-5" />
          </span>
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-muted">
            {t(
              'settings.dictionaryMoved',
              'Names, brands and jargon you want recognized now live in your Dictionary, along with the misspellings to fix.'
            )}
          </p>
          {onNavigate && (
            <button
              type="button"
              className="btn-secondary shrink-0"
              onClick={() => onNavigate('dictionary')}
            >
              {t('settings.openDictionary', 'Open Dictionary')}
              <ArrowRight className="h-4 w-4 rtl-flip" />
            </button>
          )}
        </div>
      </Section>
    </>
  )

  const renderApiKeyField = (keyId: string, label: string, footnote?: string): JSX.Element => (
    <Section title={t('settings.apiKey', 'API Key')}>
      <div className="card px-3.5 py-2.5">
        <label htmlFor={`api-key-${keyId}`} className="mb-2 block text-[13px] font-medium text-ink">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`api-key-${keyId}`}
            type={visibleKeys[keyId] ? 'text' : 'password'}
            value={apiKeys[keyId] || ''}
            onChange={(e) => handleKeyChange(keyId, e.target.value)}
            placeholder={t('settings.apiKeyPlaceholder', 'Enter your API key')}
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            className="field font-mono text-[13px]"
          />
          <button
            type="button"
            onClick={() => toggleKeyVisibility(keyId)}
            aria-label={
              visibleKeys[keyId]
                ? t('settings.hideApiKey', 'Hide API key')
                : t('settings.showApiKey', 'Show API key')
            }
            aria-pressed={!!visibleKeys[keyId]}
            className="icon-btn h-10 w-10 shrink-0 border border-hairline"
          >
            {visibleKeys[keyId] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {apiKeys[keyId] && <ApiKeyStatus provider={keyId as KeyProvider} apiKey={apiKeys[keyId]} />}
        {footnote && <p className="mt-2.5 text-[12px] text-ink-muted">{footnote}</p>}
      </div>
      <div className="mt-3">
        <Callout tone="info" icon={<Lock />}>
          {t(
            'settings.apiPrivacyNote',
            'API keys are stored locally on your device and encrypted. They are never sent to any server other than the respective AI provider.'
          )}
        </Callout>
      </div>
    </Section>
  )

  const renderAIProviderTab = (): JSX.Element => {
    const currentLLMProvider = LLM_PROVIDERS.find((p) => p.id === selectedLLM) ?? LLM_PROVIDERS[0]
    const currentVoiceProvider =
      VOICE_PROVIDERS.find((p) => p.id === selectedVoice) ?? VOICE_PROVIDERS[0]

    return (
      <>
        <div className="mb-5">
          <Segmented<ProviderSubTab>
            label={t('settings.tabAIProvider', 'AI Provider')}
            value={providerSubTab}
            onChange={setProviderSubTab}
            options={[
              {
                value: 'ai',
                label: t('settings.aiProvider', 'AI Provider'),
                icon: <Cpu className="h-3.5 w-3.5" />
              },
              {
                value: 'transcription',
                label: t('settings.transcriptionProvider', 'Transcription'),
                icon: <Mic className="h-3.5 w-3.5" />
              }
            ]}
          />
        </div>

        {providerSubTab === 'ai' ? (
          <>
            <Section title={t('settings.selectProvider', 'Select Provider')}>
              <div role="radiogroup" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                {LLM_PROVIDERS.map((provider) => (
                  <ProviderTile
                    key={provider.id}
                    id={provider.id}
                    label={provider.shortLabel}
                    selected={selectedLLM === provider.id}
                    onSelect={() => handleSelectLLM(provider.id)}
                  />
                ))}
              </div>
            </Section>
            <Section title={`${t('settings.llm', 'LLM')} — ${currentLLMProvider.shortLabel}`}>
              <ModelList
                models={PROVIDER_MODELS[selectedLLM]}
                selectedId={models[selectedLLM] || DEFAULT_MODELS[selectedLLM]}
                onSelect={(id) => handleModelChange(selectedLLM, id)}
                search={modelSearch}
                onSearch={setModelSearch}
              />
            </Section>
            {renderApiKeyField(
              selectedLLM,
              t('settings.providerApiKey', '{{provider}} API Key', {
                provider: LLM_API_KEY_PROVIDERS[selectedLLM]
              })
            )}
          </>
        ) : (
          <>
            <Section title={t('settings.selectProvider', 'Select Provider')}>
              <div role="radiogroup" className="grid grid-cols-3 gap-2.5">
                {VOICE_PROVIDERS.map((provider) => (
                  <ProviderTile
                    key={provider.id}
                    id={provider.id}
                    label={provider.shortLabel}
                    description={t(
                      `settings.voiceProviderDescriptions.${provider.id}`,
                      provider.description
                    )}
                    selected={selectedVoice === provider.id}
                    onSelect={() => handleSelectVoice(provider.id)}
                  />
                ))}
              </div>
            </Section>
            <Section
              title={`${t('settings.selectModel', 'Select Model')} — ${currentVoiceProvider.shortLabel}`}
            >
              <ModelList
                models={VOICE_PROVIDER_MODELS[selectedVoice]}
                selectedId={voiceModels[selectedVoice] || DEFAULT_VOICE_MODELS[selectedVoice]}
                onSelect={(id) => handleVoiceModelChange(selectedVoice, id)}
                search={voiceModelSearch}
                onSearch={setVoiceModelSearch}
              />
            </Section>
            {renderApiKeyField(
              VOICE_API_KEY_ID[selectedVoice],
              t('settings.providerApiKey', '{{provider}} API Key', {
                provider: VOICE_API_KEY_PROVIDERS[selectedVoice]
              }),
              selectedVoice === 'whisper'
                ? t('settings.whisperSharesKey', 'Whisper uses the same API key as Together AI.')
                : selectedVoice === 'openai-whisper'
                  ? t(
                      'settings.openaiWhisperSharesKey',
                      'OpenAI Whisper uses the same API key as OpenAI.'
                    )
                  : undefined
            )}
          </>
        )}
      </>
    )
  }

  const renderShortcutsTab = (): JSX.Element => {
    const parts = shortcutParts(shortcut)
    const mainKey = parts[parts.length - 1]
    return (
      <>
        <Section
          title={t('settings.shortcutRecord', 'Record')}
          description={t(
            'settings.shortcutRecordDesc',
            'Hold to record (push-to-talk), tap to toggle'
          )}
          action={
            shortcut !== DEFAULT_RECORD_SHORTCUT ? (
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => saveShortcut(DEFAULT_RECORD_SHORTCUT)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('settings.reset', 'Reset')}
              </button>
            ) : undefined
          }
        >
          <div className="mb-4 flex justify-center rounded-xl border border-hairline bg-panel px-4 py-5">
            <ShortcutKeys accelerator={shortcut} size="lg" />
          </div>
          <ShortcutPicker value={shortcut} onSave={saveShortcut} />
        </Section>

        <Section title={t('settings.keyboardShortcuts', 'Keyboard Shortcuts')}>
          <RowGroup>
            <Row
              title={t('shortcuts.holdToRecord', 'Hold to record, tap to toggle')}
              control={<ShortcutKeys accelerator={shortcut} size="sm" />}
            />
            {mainKey && !mainKey.right && (
              <Row
                title={t('shortcuts.openPinnedPanel', 'Open pinned recording panel')}
                control={
                  <span className="inline-flex items-center gap-1.5" dir="ltr">
                    <ShortcutKeys accelerator={shortcut} size="sm" />
                    <span className="text-[11px] text-ink-faint">+</span>
                    <Keycap part={mainKey} size="sm" />
                  </span>
                }
              />
            )}
            <Row
              title={t('shortcuts.dismiss', 'Dismiss any panel')}
              control={<Keycap part={{ glyph: 'Esc' }} size="sm" />}
            />
          </RowGroup>
        </Section>
      </>
    )
  }

  const renderAboutTab = (): JSX.Element => (
    <>
      <div className="card mb-6 flex items-center gap-3 px-4 py-4">
        <img src={appLogo} alt="" className="h-12 w-12 rounded-xl object-contain" />
        <div className="min-w-0">
          <p className="font-display text-[20px] leading-tight text-ink">{t('app.name')}</p>
          <p className="mt-1 text-[13px] text-ink-muted">
            {t('app.tagline', 'Voice Dictation with AI')}
          </p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-soft tabular">
            <span>
              {t('settings.version', 'Version')} {appVersion}
            </span>
            <span>
              {t('settings.platformInfo', 'Platform: {{value}}', {
                value: platformInfo?.platform || t('common.loading', 'Loading...')
              })}
            </span>
            <span>
              {t('settings.electronInfo', 'Electron: {{value}}', {
                value: platformInfo?.version || t('common.loading', 'Loading...')
              })}
            </span>
          </p>
        </div>
      </div>

      <Section title={t('settings.contact', 'Contact & Support')}>
        <div className="card flex flex-wrap items-center justify-between gap-4 px-3.5 py-2.5">
          <p className="max-w-[440px] text-[13px] leading-relaxed text-ink-muted">
            {t(
              'settings.contactDesc',
              'Have a question, found a bug, or want to request a feature? Reach out to us.'
            )}
          </p>
          <a href="mailto:support@tapwisper.ai" className="btn-secondary">
            <Mail className="h-4 w-4" />
            support@tapwisper.ai
          </a>
        </div>
      </Section>

      <PrivacySection keepRecordings={keepRecordings} />
    </>
  )

  // ── Render ─────────────────────────────────────────────────

  return (
    <Page>
      <PageHeader
        title={t('settings.title', 'Settings')}
        description={t('settings.subtitle', 'App preferences and configuration')}
      />

      <div
        role="tablist"
        aria-label={t('settings.title', 'Settings')}
        className="mb-9 flex gap-1 border-b border-hairline"
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`relative -mb-px flex items-center gap-2 border-b-2 px-3 pb-3 pt-1 text-[13.5px] font-medium transition-colors duration-200 ${
                active
                  ? 'border-signal text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              <span className={active ? 'text-signal' : 'text-ink-soft'}>{tab.icon}</span>
              {t(tab.labelKey, tab.fallback)}
            </button>
          )
        })}
      </div>

      <div key={activeTab} role="tabpanel" className="animate-rise">
        {activeTab === 'general' && renderGeneralTab()}
        {activeTab === 'speech' && renderSpeechTab()}
        {activeTab === 'ai-provider' && renderAIProviderTab()}
        {activeTab === 'shortcuts' && renderShortcutsTab()}
        {activeTab === 'about' && renderAboutTab()}
      </div>
    </Page>
  )
}

function PrivacySection({ keepRecordings }: { keepRecordings: boolean }): JSX.Element {
  const { t } = useTranslation()
  const items = [
    t('settings.privacyEncrypted', 'API keys are encrypted and stored locally'),
    keepRecordings
      ? t(
          'settings.privacyAudioKept',
          'Audio of your last 50 dictations stays on this device for replay'
        )
      : t('settings.privacyAudio', 'Audio recordings are deleted after transcription'),
    t('settings.privacyNoTelemetry', 'No telemetry or analytics data is collected'),
    t('settings.privacyDirect', 'All AI requests go directly to your configured provider')
  ]
  return (
    <Section
      title={t('settings.privacy', 'Privacy')}
      description={t('settings.privacyText', 'Your data stays on your device.')}
    >
      <ul className="card divide-y divide-hairline">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-3 px-5 py-3 text-[13px] text-ink-muted">
            <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
            {item}
          </li>
        ))}
      </ul>
    </Section>
  )
}
