import { useTranslation } from 'react-i18next'
import { Check, Languages, Sparkles } from 'lucide-react'
import {
  SPEECH_LANGUAGES,
  languageName,
  speechLanguageSecondary
} from '../constants/speech-languages'

interface SpeechLanguagePickerProps {
  /** Selected ISO-639-1 codes; [] = auto-detect */
  value: string[]
  onChange: (codes: string[]) => void
  /** Show the "I mix languages" explainer */
  showMixHint?: boolean
}

const MIX_PRESET = ['ar', 'en']

/** Multi-select of spoken languages. Two or more enables mixed-language dictation. */
export function SpeechLanguagePicker({
  value,
  onChange,
  showMixHint = true
}: SpeechLanguagePickerProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const selected = new Set(value)
  const auto = value.length === 0

  const toggle = (code: string): void => {
    const next = new Set(selected)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    onChange(SPEECH_LANGUAGES.map((l) => l.code).filter((c) => next.has(c)))
  }

  const presetActive =
    MIX_PRESET.every((c) => selected.has(c)) && value.length === MIX_PRESET.length

  const summary = auto
    ? t(
        'speechLanguages.summaryAuto',
        'Auto-detect: the language is recognized each time you speak.'
      )
    : value.length === 1
      ? t('speechLanguages.summaryOne', 'Always transcribed as {{language}}.', {
          language: languageLabel(value[0], i18n.language)
        })
      : t(
          'speechLanguages.summaryMixed',
          'Mixed: you can switch between {{languages}} mid-sentence.',
          {
            languages: value.map((c) => languageLabel(c, i18n.language)).join(' + ')
          }
        )

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <button
          type="button"
          aria-pressed={auto}
          onClick={() => onChange([])}
          className={tileClass(auto)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Sparkles className={`h-4 w-4 shrink-0 ${auto ? 'text-signal' : 'text-ink-soft'}`} />
            <span className="truncate text-[13px] font-medium text-ink">
              {t('settings.speechAutoDetect', 'Auto-detect')}
            </span>
          </span>
          <CheckMark on={auto} />
        </button>
        {SPEECH_LANGUAGES.map((lang) => {
          const on = selected.has(lang.code)
          const secondary = speechLanguageSecondary(lang, i18n.language)
          return (
            <button
              key={lang.code}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(lang.code)}
              className={tileClass(on)}
            >
              <span className="min-w-0 text-start">
                <span className="block truncate text-[13px] font-medium text-ink" dir="auto">
                  {lang.nativeLabel}
                </span>
                {secondary && (
                  <span className="block truncate text-[11px] text-ink-muted">{secondary}</span>
                )}
              </span>
              <CheckMark on={on} />
            </button>
          )
        })}
      </div>

      <p className="mt-3 text-[12.5px] text-ink-muted" aria-live="polite">
        {summary}
      </p>

      {showMixHint && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-hairline bg-panel px-4 py-3.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-signal-tint text-signal">
            <Languages className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-ink">
              {t('speechLanguages.mixTitle', 'I mix languages (e.g. Arabic + English)')}
            </p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">
              {t(
                'speechLanguages.mixBody',
                'Select every language you speak. With two or more selected, TapWisper keeps each word in the language you said it in — nothing gets translated.'
              )}
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary btn-sm shrink-0"
            onClick={() => onChange(MIX_PRESET)}
            disabled={presetActive}
          >
            {presetActive ? <Check className="h-3.5 w-3.5" /> : null}
            {t('speechLanguages.usePreset', 'Use {{languages}}', {
              languages: MIX_PRESET.map((c) => languageLabel(c, i18n.language)).join(' + ')
            })}
          </button>
        </div>
      )}
    </div>
  )
}

function languageLabel(code: string, uiLanguage: string): string {
  const lang = SPEECH_LANGUAGES.find((l) => l.code === code)
  return languageName(code, uiLanguage, lang?.nativeLabel || code)
}

function tileClass(on: boolean): string {
  return `flex min-h-[48px] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-start transition-[border-color,background-color,box-shadow] duration-200 ease-out ${
    on
      ? 'border-signal bg-signal-tint/40 ring-2 ring-signal/10'
      : 'border-hairline bg-raised hover:border-hairline-strong'
  }`
}

function CheckMark({ on }: { on: boolean }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
        on ? 'border-signal bg-signal text-on-signal' : 'border-hairline-strong'
      }`}
    >
      {on && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
  )
}
