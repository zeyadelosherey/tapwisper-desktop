import type { LLMProvider, VoiceProvider } from '../../constants/providers'
import geminiLogo from '../../assets/google.png'
import openaiLogo from '../../assets/openai.png'
import claudeLogo from '../../assets/claude.png'
import togetherLogo from '../../assets/together.png'
import sonioxLogo from '../../assets/soniox.png'

export const PROVIDER_LOGO_IMAGES: Record<string, string> = {
  gemini: geminiLogo,
  openai: openaiLogo,
  claude: claudeLogo,
  together: togetherLogo,
  whisper: togetherLogo,
  soniox: sonioxLogo
}

export const LLM_PROVIDERS: { id: LLMProvider; label: string; shortLabel: string; color: string }[] = [
  { id: 'gemini', label: 'Google Gemini', shortLabel: 'Gemini', color: '#4285F4' },
  { id: 'openai', label: 'OpenAI', shortLabel: 'OpenAI', color: '#10A37F' },
  { id: 'claude', label: 'Anthropic Claude', shortLabel: 'Claude', color: '#D97757' },
  { id: 'together', label: 'Together AI', shortLabel: 'Together', color: '#FF6B35' }
]

export const VOICE_PROVIDERS: {
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
  { id: 'soniox', label: 'Soniox', shortLabel: 'Soniox', description: 'Soniox STT Async v3', color: '#7EB6E0' }
]

export const PROVIDER_MODELS: Record<LLMProvider, { id: string; label: string; description: string }[]> = {
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Fast & efficient' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Advanced reasoning' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)', description: 'Next-gen speed' },
    { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (Preview)', description: 'Next-gen quality' }
  ],
  together: [
    { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo', description: 'Fast open-source' },
    {
      id: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
      label: 'Llama 4 Maverick',
      description: '1M context, 128 experts'
    },
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
    { id: 'nvidia/NVIDIA-Nemotron-Nano-9B-v2', label: 'Nemotron Nano 9B v2', description: '131K context' },
    { id: 'google/gemma-3n-E4B-it', label: 'Gemma 3N E4B', description: 'Lightweight Google' },
    {
      id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
      label: 'Llama 3.1 8B Turbo',
      description: 'Fast & light'
    },
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

export const VOICE_PROVIDER_MODELS: Record<VoiceProvider, { id: string; label: string; description: string }[]> = {
  whisper: [
    { id: 'openai/whisper-large-v3', label: 'Whisper Large v3', description: 'Best accuracy' },
    { id: 'mistralai/Voxtral-Mini-3B-2507', label: 'Voxtral Mini 3B', description: 'Fast multilingual STT' }
  ],
  soniox: [{ id: 'soniox-stt-async-v3', label: 'Soniox STT Async v3', description: 'Real-time streaming' }]
}

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  gemini: 'gemini-2.5-flash',
  together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  openai: 'gpt-4.1',
  claude: 'claude-sonnet-4-5'
}

export const DEFAULT_VOICE_MODELS: Record<VoiceProvider, string> = {
  whisper: 'openai/whisper-large-v3',
  soniox: 'soniox-stt-async-v3'
}

export const LLM_API_KEY_LABELS: Record<LLMProvider, string> = {
  gemini: 'Google Gemini API Key',
  together: 'Together AI API Key',
  openai: 'OpenAI API Key',
  claude: 'Anthropic API Key'
}

export const VOICE_API_KEY_LABELS: Record<VoiceProvider, string> = {
  whisper: 'Together AI API Key',
  soniox: 'Soniox API Key'
}

/** Which API key ID to use for a voice provider (whisper shares together's key) */
export const VOICE_API_KEY_ID: Record<VoiceProvider, string> = {
  whisper: 'together',
  soniox: 'soniox'
}
