import { useEffect, useState, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Briefcase,
  Check,
  Mail,
  MessageCircle,
  Shapes,
  WandSparkles,
  type LucideProps
} from 'lucide-react'
import {
  DEFAULT_WRITING_STYLES,
  type StyleCategory,
  type StyleTone,
  type WritingStyles
} from '../models/style'
import type { LLMProvider } from '../constants/providers'
import { Callout, Page, PageHeader, Switch } from '../components/ui/primitives'
import type { Navigate } from './main-window'

const CATEGORIES: { id: StyleCategory; icon: ComponentType<LucideProps> }[] = [
  { id: 'messages', icon: MessageCircle },
  { id: 'work', icon: Briefcase },
  { id: 'email', icon: Mail },
  { id: 'other', icon: Shapes }
]

const TONES: StyleTone[] = ['formal', 'casual', 'very-casual']

/** i18n key segment for a tone */
const TONE_KEY: Record<StyleTone, string> = {
  formal: 'formal',
  casual: 'casual',
  'very-casual': 'veryCasual'
}

const PROVIDER_NAMES: Record<LLMProvider, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  claude: 'Anthropic Claude',
  together: 'Together AI'
}

function isTone(value: unknown): value is StyleTone {
  return value === 'formal' || value === 'casual' || value === 'very-casual'
}

export function Style({ onNavigate }: { onNavigate?: Navigate }): JSX.Element {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(false)
  const [styles, setStyles] = useState<WritingStyles>(DEFAULT_WRITING_STYLES)
  const [category, setCategory] = useState<StyleCategory>('messages')
  const [provider, setProvider] = useState<LLMProvider>('gemini')
  const [hasKey, setHasKey] = useState(true)

  useEffect(() => {
    Promise.all([
      window.tapwisper.store.get('smartFormatting'),
      window.tapwisper.store.get('writingStyles'),
      window.tapwisper.store.get('aiProvider'),
      window.tapwisper.store.get('apiKeys')
    ])
      .then(([sf, ws, ai, keys]) => {
        setEnabled(sf === true)
        if (ws && typeof ws === 'object') {
          const merged = { ...DEFAULT_WRITING_STYLES }
          for (const c of CATEGORIES) {
            const v = (ws as Record<string, unknown>)[c.id]
            if (isTone(v)) merged[c.id] = v
          }
          setStyles(merged)
        }
        const p = (typeof ai === 'string' && ai in PROVIDER_NAMES ? ai : 'gemini') as LLMProvider
        setProvider(p)
        const key = (keys as Record<string, unknown> | undefined)?.[p]
        setHasKey(typeof key === 'string' && key.trim().length > 0)
      })
      .catch(() => {})
  }, [])

  const toggle = (value: boolean): void => {
    setEnabled(value)
    void window.tapwisper.store.set('smartFormatting', value)
  }

  const chooseTone = (tone: StyleTone): void => {
    const next = { ...styles, [category]: tone }
    setStyles(next)
    void window.tapwisper.store.set('writingStyles', next)
  }

  const activeCategory = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0]

  return (
    <Page>
      <PageHeader
        title={t('style.title', 'Style')}
        description={t(
          'style.subtitle',
          'Decide how your dictation should read in each kind of app — buttoned-up for email, relaxed for chats.'
        )}
      />

      {/* Smart Formatting */}
      <div className="card overflow-hidden">
        <div className="flex items-start gap-4 px-6 py-5">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-signal-tint text-signal">
            <WandSparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[20px] leading-tight text-ink">
              {t('style.smartFormatting', 'Smart Formatting')}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted text-pretty">
              {t(
                'style.smartFormattingBody',
                'Uses your AI provider to tidy every dictation: removes filler words, applies your corrections (“at four — no, five”), turns spoken lists into lists and fixes punctuation. It never translates.'
              )}
            </p>
          </div>
          <Switch
            checked={enabled}
            onChange={toggle}
            label={t('style.smartFormatting', 'Smart Formatting')}
          />
        </div>
        {!hasKey && (
          <div className="border-t border-hairline bg-panel px-6 py-3.5">
            <Callout tone="warning" icon={<AlertTriangle />}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {t(
                    'style.noKey',
                    'Smart Formatting needs an API key for {{provider}}. Until then, dictation is pasted exactly as transcribed.',
                    { provider: PROVIDER_NAMES[provider] }
                  )}
                </span>
                {onNavigate && (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => onNavigate('settings', 'ai-provider')}
                  >
                    {t('style.addKey', 'Add API key')}
                  </button>
                )}
              </div>
            </Callout>
          </div>
        )}
      </div>

      {/* Per-category tone */}
      <section className="mt-10" aria-disabled={!enabled}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="section-label">{t('style.tonesLabel', 'Tone by app')}</h2>
            {!enabled && (
              <p className="mt-1.5 text-[12.5px] text-ink-muted">
                {t('style.disabledHint', 'Turn on Smart Formatting to apply these styles.')}
              </p>
            )}
          </div>
          <div
            role="tablist"
            aria-label={t('style.tonesLabel', 'Tone by app')}
            className="inline-flex rounded-[11px] border border-hairline bg-sunken p-0.5"
          >
            {CATEGORIES.map((c) => {
              const Icon = c.icon
              const active = c.id === category
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  id={`style-tab-${c.id}`}
                  aria-selected={active}
                  aria-controls="style-tones"
                  onClick={() => setCategory(c.id)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-200 ease-out ${
                    active
                      ? 'bg-raised text-ink shadow-[0_1px_2px_rgb(27_26_23/0.12)]'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${active ? 'text-signal' : ''}`} />
                  {t(`style.categories.${c.id}`)}
                </button>
              )
            })}
          </div>
        </div>

        <p className="mb-4 text-[13px] text-ink-muted">
          {t(`style.categoryApps.${activeCategory.id}`)}
        </p>

        <div
          id="style-tones"
          role="radiogroup"
          aria-labelledby={`style-tab-${category}`}
          className={`grid grid-cols-1 gap-3 md:grid-cols-3 transition-opacity duration-200 ${
            enabled ? '' : 'opacity-55'
          }`}
        >
          {TONES.map((tone) => {
            const selected = styles[category] === tone
            return (
              <button
                key={tone}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!enabled}
                onClick={() => chooseTone(tone)}
                className={`relative flex flex-col rounded-2xl border p-4 text-start transition-[border-color,box-shadow,background-color] duration-200 ease-out disabled:cursor-not-allowed ${
                  selected
                    ? 'border-signal bg-signal-tint/30 ring-4 ring-signal/10'
                    : 'border-hairline bg-raised enabled:hover:border-hairline-strong'
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span>
                    <span className="font-display block text-[19px] leading-tight text-ink">
                      {t(`style.tones.${TONE_KEY[tone]}`)}
                    </span>
                    <span className="mt-1 block text-[12px] text-ink-muted">
                      {t(`style.toneHints.${TONE_KEY[tone]}`)}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border ${
                      selected ? 'border-signal bg-signal text-on-signal' : 'border-hairline-strong'
                    }`}
                  >
                    {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                </span>
                <span
                  className="mt-4 block min-h-[96px] whitespace-pre-line rounded-xl rounded-ss-sm border border-hairline bg-panel px-3.5 py-3 text-[13px] leading-relaxed text-ink"
                  dir="auto"
                >
                  {t(`style.samples.${category}.${TONE_KEY[tone]}`)}
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </Page>
  )
}
