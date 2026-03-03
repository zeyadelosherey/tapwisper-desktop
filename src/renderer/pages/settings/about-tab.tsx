import { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { Shield, Mail } from 'lucide-react'
import appLogo from '../../assets/logo.png'
import { PrivacyCard } from './general-tab'

interface AboutTabProps {
  platformInfo: { platform: string; isMac: boolean; version: string } | null
}

export function AboutTab({ platformInfo }: AboutTabProps): JSX.Element {
  const { t } = useTranslation()
  return (
    <>
      <section>
        <div className="bg-theme-card rounded-xl p-4 border border-theme-border/50">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center">
              <img src={appLogo} alt="TapWisper" className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="text-sm font-medium text-theme-text">TapWisper Desktop</p>
              <p className="text-xs text-theme-text-tertiary">Version 1.0.0</p>
            </div>
          </div>
          <div className="space-y-1 text-xs text-theme-text-muted">
            <p>Platform: {platformInfo?.platform || 'Loading...'}</p>
            <p>Electron: {platformInfo?.version || 'Loading...'}</p>
          </div>
        </div>
      </section>

      {/* Contact / Support */}
      <section className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Mail className="w-4 h-4 text-theme-text-secondary" />
          <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider">
            {t('settings.contact', 'Contact & Support')}
          </h2>
        </div>
        <div className="bg-theme-card rounded-xl p-4 border border-theme-border/50">
          <p className="text-sm text-theme-text-secondary mb-2">
            {t(
              'settings.contactDesc',
              'Have a question, found a bug, or want to request a feature? Reach out to us.'
            )}
          </p>
          <a
            href="mailto:support@tapwisper.ai"
            className="inline-flex items-center gap-2 text-sm text-sky-accent hover:text-sky-accent/80 transition-colors"
          >
            <Mail className="w-4 h-4" />
            support@tapwisper.ai
          </a>
        </div>
      </section>

      {/* Privacy */}
      <section className="mt-6">
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
