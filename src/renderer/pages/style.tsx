import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check } from 'lucide-react'
import {
  DEFAULT_WRITING_STYLES,
  type StyleCategory,
  type StyleTone,
  type WritingStyles
} from '../models/style'
import type { LLMProvider } from '../constants/providers'
import { Callout, Page, PageHeader, Row, Switch } from '../components/ui/primitives'
import type { Navigate } from './main-window'

const CATEGORIES: { id: StyleCategory }[] = [
  { id: 'messages' },
  { id: 'work' },
  { id: 'email' },
  { id: 'other' }
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
      window.tapwisper.store.get('apiKeys'),
      window.tapwisper.store.get('llmEngine')
    ])
      .then(([sf, ws, ai, keys, engine]) => {
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
        // Local and self-hosted models need no key
        const cloud = !engine || engine === 'cloud'
        setHasKey(!cloud || (typeof key === 'string' && key.trim().length > 0))
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
        description={t('style.subtitle', 'How your dictation reads in each kind of app.')}
      />

      {/* Smart Formatting */}
      <div>
        <Row
          title={t('style.smartFormatting', 'Smart Formatting')}
          description={t(
            'style.smartFormattingBody',
            'Removes filler words, applies corrections and fixes punctuation. Never translates.'
          )}
          control={
            <Switch
              checked={enabled}
              onChange={toggle}
              label={t('style.smartFormatting', 'Smart Formatting')}
            />
          }
        />
        {!hasKey && (
          <div className="mt-1">
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
      <section className="mt-7" aria-disabled={!enabled}>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="section-label">{t('style.tonesLabel', 'Tone by app')}</h2>
            {!enabled && (
              <p className="mt-0.5 text-[12px] text-ink-soft">
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
                  className={`inline-flex h-7 items-center rounded-[8px] px-2.5 text-[12.5px] transition-[background-color,color,box-shadow] duration-200 ease-out ${
                    active
                      ? 'bg-raised text-ink shadow-[0_1px_2px_rgb(27_26_23/0.12)]'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {t(`style.categories.${c.id}`)}
                </button>
              )
            })}
          </div>
        </div>

        <p className="mb-3 text-[12px] text-ink-soft">
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
                title={t(`style.toneHints.${TONE_KEY[tone]}`)}
                className={`relative flex flex-col rounded-xl border px-3.5 py-3 text-start transition-[border-color,background-color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 disabled:cursor-not-allowed ${
                  selected
                    ? 'border-signal/70 bg-signal-tint/25'
                    : 'border-hairline bg-raised enabled:hover:border-hairline-strong'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-ink">{t(`style.tones.${TONE_KEY[tone]}`)}</span>
                  {selected && (
                    <Check
                      aria-hidden="true"
                      className="h-3.5 w-3.5 text-signal"
                      strokeWidth={2.5}
                    />
                  )}
                </span>
                <span className="sr-only">{t(`style.toneHints.${TONE_KEY[tone]}`)}</span>
                <span
                  className="mt-2 block min-h-[64px] whitespace-pre-line text-[12.5px] leading-relaxed text-ink-muted"
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
