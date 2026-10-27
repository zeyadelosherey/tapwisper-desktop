/**
 * Languages offered for speech recognition (ISO-639-1), by native name.
 * An empty selection means the provider auto-detects the language.
 */
export interface SpeechLanguage {
  code: string
  nativeLabel: string
}

export const SPEECH_LANGUAGES: SpeechLanguage[] = [
  { code: 'en', nativeLabel: 'English' },
  { code: 'ar', nativeLabel: 'العربية' },
  { code: 'de', nativeLabel: 'Deutsch' },
  { code: 'es', nativeLabel: 'Español' },
  { code: 'fr', nativeLabel: 'Français' },
  { code: 'it', nativeLabel: 'Italiano' },
  { code: 'pt', nativeLabel: 'Português' },
  { code: 'nl', nativeLabel: 'Nederlands' },
  { code: 'tr', nativeLabel: 'Türkçe' },
  { code: 'ru', nativeLabel: 'Русский' },
  { code: 'uk', nativeLabel: 'Українська' },
  { code: 'pl', nativeLabel: 'Polski' },
  { code: 'sv', nativeLabel: 'Svenska' },
  { code: 'fa', nativeLabel: 'فارسی' },
  { code: 'ur', nativeLabel: 'اردو' },
  { code: 'hi', nativeLabel: 'हिन्दी' },
  { code: 'zh', nativeLabel: '中文' },
  { code: 'ja', nativeLabel: '日本語' },
  { code: 'ko', nativeLabel: '한국어' },
  { code: 'id', nativeLabel: 'Bahasa Indonesia' },
  { code: 'vi', nativeLabel: 'Tiếng Việt' }
]

/** App UI languages. `label` is the English name, used if Intl.DisplayNames is unavailable. */
export const UI_LANGUAGES: { code: string; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano' }
]

/** Name of a language in the current UI language (e.g. "Arabisch" when the UI is German) */
export function languageName(code: string, uiLanguage: string, fallback: string): string {
  try {
    return new Intl.DisplayNames([uiLanguage], { type: 'language' }).of(code) || fallback
  } catch {
    return fallback
  }
}

/** Localized name of a speech language, or '' when it is the same as the native name */
export function speechLanguageSecondary(lang: SpeechLanguage, uiLanguage: string): string {
  const localized = languageName(lang.code, uiLanguage, lang.nativeLabel)
  return localized.toLocaleLowerCase() === lang.nativeLabel.toLocaleLowerCase() ? '' : localized
}

/** Keep only known codes, in a stable order, without duplicates */
export function normalizeSpeechLanguages(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const wanted = new Set(value.filter((v): v is string => typeof v === 'string'))
  return SPEECH_LANGUAGES.map((l) => l.code).filter((code) => wanted.has(code))
}
