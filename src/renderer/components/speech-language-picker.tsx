import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
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
/** Shown up front; the rest sit behind "More languages" */
const COMMON_COUNT = 6

/** Multi-select of spoken languages. Two or more enables mixed-language dictation. */
export function SpeechLanguagePicker({
  value,
  onChange,
  showMixHint = true
}: SpeechLanguagePickerProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const selected = new Set(value)
  const auto = value.length === 0
  const [showAll, setShowAll] = useState(false)
  const visible = SPEECH_LANGUAGES.filter(
    (l, i) => showAll || i < COMMON_COUNT || selected.has(l.code)
  )
  const hiddenCount = SPEECH_LANGUAGES.length - visible.length

  const toggle = (code: string): void => {
    const next = new Set(selected)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    onChange(SPEECH_LANGUAGES.map((l) => l.code).filter((c) => next.has(c)))
  }

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
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={auto}
          onClick={() => onChange([])}
          className={tileClass(auto)}
        >
          <CheckMark on={auto} />
          <span className="text-ink">{t('settings.speechAutoDetect', 'Auto-detect')}</span>
        </button>
        {visible.map((lang) => {
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
              <CheckMark on={on} />
              <span className="text-ink" dir="auto">
                {lang.nativeLabel}
              </span>
              {secondary && <span className="text-ink-soft">{secondary}</span>}
            </button>
          )
        })}
        {(hiddenCount > 0 || showAll) && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="inline-flex h-7 items-center rounded-full px-2.5 text-[12.5px] text-ink-soft transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
          >
            {showAll
              ? t('speechLanguages.fewer', 'Fewer languages')
              : t('speechLanguages.more', 'More languages…')}
          </button>
        )}
      </div>

      <p className="mt-2 text-[12px] text-ink-soft" aria-live="polite">
        {summary}
        {showMixHint && value.length < 2 && (
          <>
            {' '}
            {t('speechLanguages.mixHint', 'Mix languages? Select each one you speak.')}{' '}
            <button
              type="button"
              className="rounded text-signal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
              onClick={() => onChange(MIX_PRESET)}
            >
              {t('speechLanguages.usePreset', 'Use {{languages}}', {
                languages: MIX_PRESET.map((c) => languageLabel(c, i18n.language)).join(' + ')
              })}
            </button>
          </>
        )}
      </p>
    </div>
  )
}

function languageLabel(code: string, uiLanguage: string): string {
  const lang = SPEECH_LANGUAGES.find((l) => l.code === code)
  return languageName(code, uiLanguage, lang?.nativeLabel || code)
}

function tileClass(on: boolean): string {
  return `inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] transition-[border-color,background-color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 ${
    on
      ? 'border-signal/60 bg-signal-tint/60'
      : 'border-hairline bg-raised hover:border-hairline-strong'
  }`
}

function CheckMark({ on }: { on: boolean }): JSX.Element | null {
  if (!on) return null
  return <Check aria-hidden="true" className="h-3 w-3 shrink-0 text-signal" strokeWidth={3} />
}
