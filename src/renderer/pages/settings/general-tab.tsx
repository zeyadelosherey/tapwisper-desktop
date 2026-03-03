import { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Shield, Monitor, Moon, Sun } from 'lucide-react'
import type { Theme } from './types'
import { LANGUAGES } from './types'

interface GeneralTabProps {
  language: string
  theme: Theme
  autoLaunch: boolean
  onLanguageChange: (code: string) => void
  onThemeChange: (value: Theme) => void
  onAutoLaunchChange: (value: boolean) => void
}

export function GeneralTab({
  language,
  theme,
  autoLaunch,
  onLanguageChange,
  onThemeChange,
  onAutoLaunchChange
}: GeneralTabProps): JSX.Element {
  const { t } = useTranslation()

  return (
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
              onClick={() => onLanguageChange(lang.code)}
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
            { value: 'system' as Theme, labelKey: 'settings.system', icon: <Monitor className="w-4 h-4" /> },
            { value: 'dark' as Theme, labelKey: 'settings.dark', icon: <Moon className="w-4 h-4" /> },
            { value: 'light' as Theme, labelKey: 'settings.light', icon: <Sun className="w-4 h-4" /> }
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => onThemeChange(option.value)}
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
            onClick={() => onAutoLaunchChange(!autoLaunch)}
            className={`w-11 h-6 rounded-full transition-all relative ${autoLaunch ? 'bg-sky-accent' : 'bg-theme-surface'}`}
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
        <PrivacyCard />
      </section>
    </>
  )
}

export function PrivacyCard(): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="bg-theme-card rounded-xl p-4 border border-theme-border/50 space-y-2">
      <p className="text-sm text-theme-text-secondary">{t('settings.privacyText')}</p>
      <ul className="space-y-1.5 text-xs text-theme-text-tertiary">
        <li>• {t('settings.privacyEncrypted', 'API keys are encrypted and stored locally')}</li>
        <li>• {t('settings.privacyAudio', 'Audio recordings are deleted after transcription')}</li>
        <li>• {t('settings.privacyNoTelemetry', 'No telemetry or analytics data is collected')}</li>
        <li>• {t('settings.privacyDirect', 'All AI requests go directly to your configured provider')}</li>
      </ul>
    </div>
  )
}
