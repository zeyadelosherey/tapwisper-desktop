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
  Users,
  ChevronRight,
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
import { Meetings } from './meetings'
import { MeetingBanners } from '../components/meeting/meeting-banners'
import { Onboarding } from './onboarding'
import { useStatsStore } from '../store/stats'
import { Spinner } from '../components/ui/primitives'

export type Page =
  | 'home'
  | 'meetings'
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
  { id: 'meetings', labelKey: 'nav.meetings', icon: Users },
  { id: 'notes', labelKey: 'nav.notes', icon: NotebookPen },
  { id: 'dictionary', labelKey: 'nav.dictionary', icon: BookA },
  { id: 'snippets', labelKey: 'nav.snippets', icon: TextQuote },
  { id: 'style', labelKey: 'nav.style', icon: Feather }
]

/** Power-user pages, folded under "More" */
const MORE_NAV: NavItem[] = [
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

const MORE_OPEN_KEY = 'nav.moreOpen'

function readMoreOpen(): boolean {
  try {
    return localStorage.getItem(MORE_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

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
      data-nav={item.id}
      onClick={() => onSelect(item.id)}
      aria-current={active ? 'page' : undefined}
      className={`group flex h-8 w-full items-center gap-2.5 rounded-[9px] px-2.5 text-[13px] transition-[background-color,color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 ${
        active ? 'bg-ink/[0.06] text-ink' : 'text-ink-muted hover:bg-ink/[0.04] hover:text-ink'
      }`}
    >
      <Icon
        className={`h-4 w-4 shrink-0 transition-colors duration-200 ${
          active ? 'text-ink' : 'text-ink-soft group-hover:text-ink-muted'
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
  const [meetingId, setMeetingId] = useState<string | undefined>(undefined)
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null)
  const [moreOpen, setMoreOpen] = useState(readMoreOpen)
  const loadStats = useStatsStore((s) => s.loadStats)

  const toggleMore = useCallback(() => {
    setMoreOpen((open) => {
      try {
        localStorage.setItem(MORE_OPEN_KEY, open ? '0' : '1')
      } catch {
        // Remembering the fold is a convenience only
      }
      return !open
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
    setMeetingId(undefined)
    setActivePage(page)
  }, [])

  // The notepad's "Open in TapWisper" shows a meeting here
  useEffect(() => {
    return window.tapwisper.on('meetings:open', (id: unknown) => {
      if (typeof id !== 'string') return
      setSettingsTab(undefined)
      setMeetingId(id)
      setActivePage('meetings')
    })
  }, [])

  const selectPage = useCallback((page: Page) => navigate(page), [navigate])

  const renderPage = (): JSX.Element => {
    switch (activePage) {
      case 'home':
        return <Home />
      case 'meetings':
        return <Meetings initialMeetingId={meetingId} />
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
        return <Settings initialTab={settingsTab} />
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
  const moreActive = MORE_NAV.some((item) => item.id === activePage)
  const showMore = moreOpen || moreActive

  return (
    <div className="flex h-screen flex-col bg-canvas">
      {/* Windows: room for (and drag area beside) the native window controls */}
      {HAS_CONTROLS_OVERLAY && <div className="drag-region h-10 shrink-0" />}

      <div className="flex min-h-0 flex-1">
        {/* ── Sidebar ─────────────────────────────────────── */}
        <aside className="flex w-[208px] shrink-0 flex-col">
          <div
            className={`drag-region flex shrink-0 items-center ${
              IS_MAC ? 'h-[46px]' : 'h-11'
            } ${brandBesideTrafficLights ? 'ps-[76px]' : 'ps-4'} pe-2`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <img
                src={appLogo}
                alt=""
                className="h-[18px] w-[18px] shrink-0 rounded-md object-contain"
              />
              <span className="font-display truncate text-[16px] leading-none text-ink">
                {t('app.name')}
              </span>
            </div>
          </div>

          <nav
            aria-label={t('nav.label', 'Main')}
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-2 pt-1.5"
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
              <button
                type="button"
                data-nav-more=""
                onClick={toggleMore}
                aria-expanded={showMore}
                aria-controls="nav-more"
                disabled={moreActive}
                className="flex h-7 w-full items-center gap-1 rounded-[9px] px-2.5 text-[12px] text-ink-soft transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 disabled:pointer-events-none"
              >
                {t('nav.more', 'More')}
                <ChevronRight
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${
                    showMore ? 'rotate-90' : 'rtl-flip'
                  }`}
                />
              </button>
              {showMore && (
                <div id="nav-more" className="space-y-0.5">
                  {MORE_NAV.map((item) => (
                    <NavButton
                      key={item.id}
                      item={item}
                      active={activePage === item.id}
                      onSelect={selectPage}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="mt-auto">
              <NavButton
                item={{ id: 'settings', labelKey: 'nav.settings', icon: SettingsIcon }}
                active={activePage === 'settings'}
                onSelect={selectPage}
              />
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
          <div className="flex h-full flex-col">
            <MeetingBanners />
            <div
              id="main-scroll"
              key={`${activePage}-${settingsTab ?? ''}-${meetingId ?? ''}`}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {renderPage()}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
