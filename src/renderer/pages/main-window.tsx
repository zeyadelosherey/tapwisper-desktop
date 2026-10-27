import { useState, useEffect, useCallback, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Home as HomeIcon,
  BookA,
  TextQuote,
  Feather,
  NotebookPen,
  AudioLines,
  Sparkles,
  LayoutGrid,
  Settings as SettingsIcon,
  type LucideProps
} from 'lucide-react'
import appLogo from '../assets/logo.png'
import { Home } from './home'
import { ActionsConfig } from './actions-config'
import { Triggers } from './triggers'
import { MiniAppStore } from './mini-app-store'
import { Notes } from './notes'
import { Snippets } from './snippets'
import { Dictionary } from './dictionary'
import { Style } from './style'
import { Settings, type SettingsTab } from './settings'
import { Onboarding } from './onboarding'
import { useStatsStore } from '../store/stats'
import { useRecordShortcut } from '../hooks/use-record-shortcut'
import { ShortcutKeys } from '../components/ui/keycap'
import { Spinner } from '../components/ui/primitives'

export type Page =
  | 'home'
  | 'dictionary'
  | 'snippets'
  | 'style'
  | 'notes'
  | 'triggers'
  | 'actions'
  | 'mini-apps'
  | 'settings'

/** Switch page; for Settings, optionally open a specific tab */
export type Navigate = (page: Page, settingsTab?: SettingsTab) => void

interface NavItem {
  id: Page
  labelKey: string
  icon: ComponentType<LucideProps>
}

const MAIN_NAV: NavItem[] = [
  { id: 'home', labelKey: 'nav.home', icon: HomeIcon },
  { id: 'dictionary', labelKey: 'nav.dictionary', icon: BookA },
  { id: 'snippets', labelKey: 'nav.snippets', icon: TextQuote },
  { id: 'style', labelKey: 'nav.style', icon: Feather },
  { id: 'notes', labelKey: 'nav.notes', icon: NotebookPen }
]

const AUTOMATION_NAV: NavItem[] = [
  { id: 'triggers', labelKey: 'nav.triggers', icon: AudioLines },
  { id: 'actions', labelKey: 'nav.actions', icon: Sparkles },
  { id: 'mini-apps', labelKey: 'nav.miniApps', icon: LayoutGrid }
]

// Window chrome differs per platform (see src/main/windows.ts):
// - macOS: hidden inset title bar — traffic lights float at the top-left
// - Windows: hidden title bar + native controls overlay (40px) at the top
// - Linux: native window frame, nothing to make room for
const OS = window.tapwisper.platform.os
const IS_MAC = OS === 'darwin'
const HAS_CONTROLS_OVERLAY = OS === 'win32'

function NavButton({
  item,
  active,
  onSelect
}: {
  item: NavItem
  active: boolean
  onSelect: (page: Page) => void
}): JSX.Element {
  const { t } = useTranslation()
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={active ? 'page' : undefined}
      className={`group flex h-9 w-full items-center gap-3 rounded-[10px] border px-3 text-[13.5px] transition-[background-color,color,border-color] duration-200 ease-out ${
        active
          ? 'border-hairline bg-raised font-medium text-ink shadow-[0_1px_2px_rgb(27_26_23/0.06)]'
          : 'border-transparent text-ink-muted hover:bg-ink/[0.045] hover:text-ink'
      }`}
    >
      <Icon
        className={`h-[17px] w-[17px] shrink-0 transition-colors duration-200 ${
          active ? 'text-signal' : 'text-ink-soft group-hover:text-ink-muted'
        }`}
        strokeWidth={1.8}
      />
      <span className="truncate">{t(item.labelKey)}</span>
    </button>
  )
}

export function MainWindow(): JSX.Element {
  const { t, i18n } = useTranslation()
  const [activePage, setActivePage] = useState<Page>('home')
  const [settingsTab, setSettingsTab] = useState<SettingsTab | undefined>(undefined)
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null)
  const [appVersion, setAppVersion] = useState('')
  const loadStats = useStatsStore((s) => s.loadStats)
  const { shortcut } = useRecordShortcut()

  useEffect(() => {
    window.tapwisper.app
      .getVersion()
      .then(setAppVersion)
      .catch(() => {
        // Version is informational only
      })
  }, [])

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

  const navigate: Navigate = useCallback((page, tab) => {
    setSettingsTab(tab)
    setActivePage(page)
  }, [])

  const selectPage = useCallback((page: Page) => navigate(page), [navigate])

  const renderPage = (): JSX.Element => {
    switch (activePage) {
      case 'home':
        return <Home />
      case 'dictionary':
        return <Dictionary />
      case 'style':
        return <Style onNavigate={navigate} />
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
        return <Settings onNavigate={navigate} initialTab={settingsTab} />
      default:
        return <Home />
    }
  }

  // Show a spinner while we check onboarding status
  if (showOnboarding === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas text-ink-faint">
        <Spinner className="h-5 w-5" />
      </div>
    )
  }

  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />
  }

  // macOS traffic lights sit at the top-left: in LTR the brand moves past them
  const brandBesideTrafficLights = IS_MAC && i18n.dir() === 'ltr'

  return (
    <div className="flex h-screen flex-col bg-canvas">
      {/* Windows: room for (and drag area beside) the native window controls */}
      {HAS_CONTROLS_OVERLAY && <div className="drag-region h-10 shrink-0" />}

      <div className="flex min-h-0 flex-1">
        {/* ── Sidebar ─────────────────────────────────────── */}
        <aside className="flex w-[232px] shrink-0 flex-col">
          <div
            className={`drag-region flex shrink-0 items-center ${
              IS_MAC ? 'h-[52px]' : 'h-14'
            } ${brandBesideTrafficLights ? 'ps-[84px]' : 'ps-5'} pe-4`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <img
                src={appLogo}
                alt=""
                className="h-[22px] w-[22px] shrink-0 rounded-md object-contain"
              />
              <span className="font-display truncate text-[18px] leading-none text-ink">
                {t('app.name')}
              </span>
            </div>
          </div>

          <nav
            aria-label={t('nav.label', 'Main')}
            className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 pb-3 pt-3"
          >
            <div className="space-y-0.5">
              {MAIN_NAV.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={activePage === item.id}
                  onSelect={selectPage}
                />
              ))}
            </div>

            <div className="space-y-0.5">
              <p className="section-label px-3 pb-1.5">{t('nav.automations', 'Automations')}</p>
              {AUTOMATION_NAV.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={activePage === item.id}
                  onSelect={selectPage}
                />
              ))}
            </div>

            <div className="mt-auto space-y-3">
              <div className="rounded-xl border border-hairline/80 bg-raised/60 px-3 py-3">
                <p className="text-[11.5px] leading-snug text-ink-muted">
                  {t('nav.shortcutHint', 'Hold to dictate in any app')}
                </p>
                <ShortcutKeys accelerator={shortcut} size="sm" className="mt-2 flex-wrap" />
              </div>
              <NavButton
                item={{ id: 'settings', labelKey: 'nav.settings', icon: SettingsIcon }}
                active={activePage === 'settings'}
                onSelect={selectPage}
              />
              {appVersion && (
                <p className="px-3 text-[11px] text-ink-faint tabular">
                  {t('nav.version', 'Version {{version}}', { version: appVersion })}
                </p>
              )}
            </div>
          </nav>
        </aside>

        {/* ── Main sheet ──────────────────────────────────── */}
        <main
          className={`sheet relative mb-2 me-2 min-w-0 flex-1 overflow-hidden rounded-sheet ${
            HAS_CONTROLS_OVERLAY ? '' : 'mt-2'
          }`}
        >
          {/* Frameless title bar (macOS): keep the window draggable from the top */}
          {IS_MAC && <div className="drag-region absolute inset-x-0 top-0 z-10 h-7" />}
          <div key={`${activePage}-${settingsTab ?? ''}`} className="h-full overflow-y-auto">
            {renderPage()}
          </div>
        </main>
      </div>
    </div>
  )
}
