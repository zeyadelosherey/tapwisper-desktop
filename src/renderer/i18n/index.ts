import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from './en.json'
import ar from './ar.json'
import it from './it.json'
import es from './es.json'
import fr from './fr.json'
import de from './de.json'

const resources = {
  en: { translation: en },
  ar: { translation: ar },
  it: { translation: it },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    },
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
