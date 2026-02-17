import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Home as HomeIcon, Zap, Store, StickyNote, Code2, Settings as SettingsIcon, Crosshair
} from 'lucide-react'
import appLogo from '../assets/logo.png'
import { Home } from './home'
import { ActionsConfig } from './actions-config'
import { Triggers } from './triggers'
import { MiniAppStore } from './mini-app-store'
import { Notes } from './notes'
import { Snippets } from './snippets'
import { Settings } from './settings'
import { Onboarding } from './onboarding'
import { useStatsStore } from '../store/stats'

type Page = 'home' | 'actions' | 'triggers' | 'mini-apps' | 'notes' | 'snippets' | 'settings'

const MAIN_NAV: { id: Page; labelKey: string; icon: React.ReactNode }[] = [
  { id: 'home', labelKey: 'nav.home', icon: <HomeIcon className="w-5 h-5" /> },
  { id: 'mini-apps', labelKey: 'nav.miniApps', icon: <Store className="w-5 h-5" /> },
  { id: 'notes', labelKey: 'nav.notes', icon: <StickyNote className="w-5 h-5" /> }
]

const CONFIG_NAV: { id: Page; labelKey: string; icon: React.ReactNode }[] = [
  { id: 'actions', labelKey: 'nav.actions', icon: <Zap className="w-5 h-5" /> },
  { id: 'triggers', labelKey: 'nav.triggers', icon: <Crosshair className="w-5 h-5" /> },
  { id: 'snippets', labelKey: 'nav.snippets', icon: <Code2 className="w-5 h-5" /> }
]

export function MainWindow(): JSX.Element {
  const { t } = useTranslation()
  const [activePage, setActivePage] = useState<Page>('home')
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null)
  const loadStats = useStatsStore((s) => s.loadStats)

  // Check if onboarding has been completed
  useEffect(() => {
    window.tapwisper.store.get('onboardingCompleted').then((completed) => {
      setShowOnboarding(!completed)
    })
  }, [])

  // Load stats on app launch so analytics are ready
  useEffect(() => {
    if (showOnboarding === false) {
      loadStats()
    }
  }, [loadStats, showOnboarding])

  // Pre-request microphone permission after onboarding to avoid delay when recording
  useEffect(() => {
    if (showOnboarding !== false) return

    const requestMicPermission = async (): Promise<void> => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true
          }
        })
        // Stop immediately — we just wanted to get permission
        stream.getTracks().forEach((track) => track.stop())
      } catch {
        // Permission will be requested when recording starts
      }
    }
    requestMicPermission()
  }, [showOnboarding])

  const handleOnboardingComplete = useCallback(async () => {
    await window.tapwisper.store.set('onboardingCompleted', true)
    // Notify main process that all permissions are granted so it can
    // start the global keyboard hook (uiohook) that was deferred at launch.
    await window.tapwisper.permissions.allGranted()
    setShowOnboarding(false)
  }, [])

  const renderPage = (): JSX.Element => {
    switch (activePage) {
      case 'home':
        return <Home />
      case 'actions':
        return <ActionsConfig />
      case 'triggers':
        return <Triggers />
      case 'mini-apps':
        return <MiniAppStore />
      case 'notes':
        return <Notes />
      case 'snippets':
        return <Snippets />
      case 'settings':
        return <Settings />
      default:
        return <Home />
    }
  }

  // Show a spinner while we check onboarding status
  if (showOnboarding === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-theme-bg">
        <div className="w-6 h-6 border-2 border-theme-border border-t-sky-accent rounded-full animate-spin" />
      </div>
    )
  }

  // Show onboarding if not yet completed
  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />
  }

  return (
    <div className="flex h-screen bg-theme-bg">
      {/* Sidebar */}
      <div className="w-56 bg-theme-card ltr:border-r rtl:border-l border-theme-border/30 flex flex-col pt-12">
        {/* Drag region / title bar area */}
        <div className="drag-region h-12 flex items-center px-4 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 no-drag min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shrink-0">
              <img
                src={appLogo}
                alt=""
                className="w-full h-full object-contain"
              />
            </div>
            <span className="text-sm font-semibold text-theme-text truncate">{t('app.name')}</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 flex flex-col gap-4 min-h-0">
          <div className="space-y-1">
            {MAIN_NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all
                  ${activePage === item.id
                    ? 'bg-sky-accent/12 text-sky-accent font-medium'
                    : 'text-theme-text-secondary hover:text-theme-text hover:bg-theme-surface/40'
                  }
                `}
              >
                {item.icon}
                {t(item.labelKey)}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1 flex-shrink-0">
            <div className="px-3 py-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-theme-text-muted">
                {t('nav.configuration')}
              </span>
            </div>
            {CONFIG_NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all
                  ${activePage === item.id
                    ? 'bg-sky-accent/12 text-sky-accent font-medium'
                    : 'text-theme-text-secondary hover:text-theme-text hover:bg-theme-surface/40'
                  }
                `}
              >
                {item.icon}
                {t(item.labelKey)}
              </button>
            ))}
          </div>

          <div className="mt-auto pt-2 border-t border-theme-border/30 space-y-1">
            <button
              onClick={() => setActivePage('settings')}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all
                ${activePage === 'settings'
                  ? 'bg-sky-accent/12 text-sky-accent font-medium'
                  : 'text-theme-text-secondary hover:text-theme-text hover:bg-theme-surface/40'
                }
              `}
            >
              <SettingsIcon className="w-5 h-5" />
              {t('nav.settings')}
            </button>
          </div>
        </nav>

        {/* Version / plan info */}
        <div className="px-3 pb-3">
          <div className="rounded-xl bg-theme-bg p-3 space-y-2">
            <p className="text-xs font-medium text-theme-text">{t('app.name')} Desktop</p>
            <p className="text-xs text-theme-text-muted">v1.0.0</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          {renderPage()}
        </div>
      </div>
    </div>
  )
}
