import { useEffect, useState, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { updateDirection } from './i18n'

// Lazy-load each route's component so overlay windows only load what they need.
// This significantly reduces memory per overlay (RecordingPill doesn't load Settings, Home, etc.)
const RecordingPill = lazy(() => import('./components/recording-pill').then(m => ({ default: m.RecordingPill })))
const PinnedPanel = lazy(() => import('./components/pinned-panel').then(m => ({ default: m.PinnedPanel })))
const CommandPopup = lazy(() => import('./components/command-popup').then(m => ({ default: m.CommandPopup })))
const AISuggestionPanel = lazy(() => import('./components/ai-suggestion-panel').then(m => ({ default: m.AISuggestionPanel })))
const MainWindow = lazy(() => import('./pages/main-window').then(m => ({ default: m.MainWindow })))

type Route = 'main' | 'recording-pill' | 'pinned-panel' | 'command-popup' | 'ai-panel'
type Theme = 'system' | 'dark' | 'light'

function getRouteFromHash(): Route {
  const hash = window.location.hash.replace('#/', '')
  switch (hash) {
    case 'recording-pill':
      return 'recording-pill'
    case 'pinned-panel':
      return 'pinned-panel'
    case 'command-popup':
      return 'command-popup'
    case 'ai-panel':
      return 'ai-panel'
    default:
      return 'main'
  }
}

function applyTheme(value: Theme): void {
  if (value === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  } else if (value === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

function App(): JSX.Element {
  const [route, setRoute] = useState<Route>(getRouteFromHash)
  const { i18n } = useTranslation()

  // Apply theme and language on app startup
  useEffect(() => {
    // Load and apply saved theme
    window.tapwisper.store.get('theme').then((th) => {
      applyTheme((th as Theme) || 'system')
    })

    // Listen for OS theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = (): void => {
      window.tapwisper.store.get('theme').then((th) => {
        if (!th || th === 'system') {
          applyTheme('system')
        }
      })
    }
    mediaQuery.addEventListener('change', handleSystemThemeChange)
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
  }, [])

  // Apply RTL/LTR direction on app startup based on saved language
  useEffect(() => {
    window.tapwisper.store.get('language').then((lang) => {
      if (lang) {
        i18n.changeLanguage(lang as string)
        updateDirection(lang as string)
      } else {
        updateDirection(i18n.language)
      }
    })
  }, [i18n])

  // Re-apply direction whenever the i18n language changes
  useEffect(() => {
    updateDirection(i18n.language)
  }, [i18n.language])

  useEffect(() => {
    const handleHashChange = (): void => {
      setRoute(getRouteFromHash())
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const renderRoute = (): JSX.Element => {
    switch (route) {
      case 'recording-pill':
        return <RecordingPill />
      case 'pinned-panel':
        return <PinnedPanel />
      case 'command-popup':
        return <CommandPopup />
      case 'ai-panel':
        return <AISuggestionPanel />
      case 'main':
      default:
        return <MainWindow />
    }
  }

  return <Suspense fallback={<div />}>{renderRoute()}</Suspense>
}

export default App
