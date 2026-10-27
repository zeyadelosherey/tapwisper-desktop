import i18n, { type BackendModule, type ResourceKey } from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// English is bundled (it's the fallback). Other languages are separate chunks
// loaded on demand, so every window — including the always-loaded overlays —
// parses one language instead of six (~250KB less JS per renderer).
import en from './en.json'

const loaders: Record<string, () => Promise<{ default: ResourceKey }>> = {
  ar: () => import('./ar.json'),
  de: () => import('./de.json'),
  es: () => import('./es.json'),
  fr: () => import('./fr.json'),
  it: () => import('./it.json')
}

export const SUPPORTED_LANGUAGES = ['en', ...Object.keys(loaders)]

const lazyBackend: BackendModule = {
  type: 'backend',
  init: () => {},
  read: (language, _namespace, callback) => {
    const load = loaders[language]
    if (!load) {
      callback(null, {})
      return
    }
    load()
      .then((mod) => callback(null, mod.default))
      .catch((err: Error) => callback(err, null))
  }
}

i18n
  .use(lazyBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en } },
    // Keep the bundled English and fetch other languages through the backend
    partialBundledLanguages: true,
    supportedLngs: SUPPORTED_LANGUAGES,
    nonExplicitSupportedLngs: true,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    },
    // Render immediately (English fallback) instead of suspending while a
    // language chunk loads — it's local, so it arrives within a frame
    react: { useSuspense: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    }
  })

export default i18n

/**
 * Check if the current language is RTL
 */
export function isRTL(lang?: string): boolean {
  const currentLang = lang || i18n.language
  return currentLang === 'ar'
}

/**
 * Set document direction based on language
 */
export function updateDirection(lang: string): void {
  const dir = isRTL(lang) ? 'rtl' : 'ltr'
  document.documentElement.dir = dir
  document.documentElement.lang = lang
}
