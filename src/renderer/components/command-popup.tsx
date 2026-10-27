import { useEffect, useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Search, MessageCircle, ChevronRight, X } from 'lucide-react'
import { BUILT_IN_CATEGORIES, type ActionCategory, type ActionItem } from '../models/actions-config'
import { CATEGORY_COLORS } from '../constants/colors'
import { CategoryIcon } from './icon-map'

export function CommandPopup(): JSX.Element {
  const { t } = useTranslation()
  const [selectedText, setSelectedText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [categories, setCategories] = useState<ActionCategory[]>(BUILT_IN_CATEGORIES)

  // Same source as the AI panel / Actions page: the user's stored actions
  // (custom categories, hidden categories, mini-apps), else the built-ins.
  const loadCategories = useCallback(() => {
    window.tapwisper.store
      .get('actions')
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setCategories(data as ActionCategory[])
        } else {
          setCategories(BUILT_IN_CATEGORIES)
        }
      })
      .catch(() => {
        // Keep whatever is loaded
      })
  }, [])

  useEffect(() => {
    loadCategories()
    const onVisibilityChange = (): void => {
      if (!document.hidden) loadCategories()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [loadCategories])

  useEffect(() => {
    document.documentElement.classList.add('transparent')

    const unsubSetText = window.tapwisper.on('command-popup:set-text', (text: unknown) => {
      if (typeof text === 'string') {
        loadCategories()
        setSelectedText(text)
        setVisible(true)
      }
    })

    const unsubGrab = window.tapwisper.on('command-popup:grab-text', async () => {
      loadCategories()
      const text = await window.tapwisper.clipboard.grabSelectedText()
      if (text) {
        setSelectedText(text)
        setVisible(true)
      }
    })

    return () => {
      unsubSetText()
      unsubGrab()
    }
  }, [loadCategories])

  const visibleCategories = useMemo(
    () =>
      categories
        .filter((cat) => cat.isVisible !== false && cat.actions.length > 0)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [categories]
  )

  const filteredCategories = useMemo(() => {
    if (!searchQuery) return visibleCategories
    const q = searchQuery.toLowerCase()
    return visibleCategories
      .map((cat) => ({
        ...cat,
        actions: cat.label.toLowerCase().includes(q)
          ? cat.actions
          : cat.actions.filter((a) => a.label.toLowerCase().includes(q))
      }))
      .filter((cat) => cat.actions.length > 0)
  }, [searchQuery, visibleCategories])

  const handleAction = useCallback(
    (action: ActionItem) => {
      // Send action to AI panel with selected text. The prompt/label travel
      // with the request so custom actions and mini-apps work too.
      window.tapwisper.window.send('aiPanel', 'ai-panel:process', {
        text: selectedText,
        actionId: action.id,
        label: action.label,
        prompt: action.prompt
      })
      window.tapwisper.window.show('aiPanel')
      window.tapwisper.window.hide('commandPopup')
      setVisible(false)
    },
    [selectedText]
  )

  const handleAskQuestion = useCallback(() => {
    window.tapwisper.window.send('aiPanel', 'ai-panel:ask-question', {
      text: selectedText
    })
    window.tapwisper.window.show('aiPanel')
    window.tapwisper.window.hide('commandPopup')
    setVisible(false)
  }, [selectedText])

  const handleClose = useCallback(() => {
    window.tapwisper.window.hide('commandPopup')
    setVisible(false)
    setSearchQuery('')
    setExpandedCategory(null)
  }, [])

  const truncatedText = selectedText.length > 50 ? selectedText.slice(0, 50) + '...' : selectedText

  if (!visible) return <div className="w-full h-full" />

  return (
    // The window is 32px larger than the card on every side (see windows.ts)
    // so the card and its shadow are never clipped.
    <div className="w-full h-full flex items-center justify-center no-select p-8">
      <div className="glass rounded-2xl popup-shadow w-full max-h-full flex flex-col overflow-hidden animate-scale-up border border-theme-border/40">
        {/* Header — clean title, optional text preview */}
        <div className="drag-region flex items-center gap-3 px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-sky-accent/15">
              <Sparkles className="w-4 h-4 text-sky-accent" />
            </div>
            <span className="text-sm font-semibold text-theme-text">
              {t('commandPopup.title', 'AI Actions')}
            </span>
          </div>
          <button
            onClick={handleClose}
            aria-label={t('commandPopup.close', 'Close')}
            title={t('commandPopup.close', 'Close')}
            className="no-drag ms-auto w-7 h-7 rounded-lg flex items-center justify-center text-theme-text-tertiary hover:text-theme-text hover:bg-theme-surface/60 transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {selectedText && (
          <div className="px-4 pb-3">
            <p className="text-xs text-theme-text-tertiary line-clamp-2 leading-relaxed">
              {truncatedText}
            </p>
          </div>
        )}

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2.5 px-3 py-2.5 bg-theme-surface/50 rounded-xl border border-theme-border/30">
            <Search className="w-4 h-4 text-theme-text-muted shrink-0" />
            <input
              type="text"
              placeholder={t('actions.searchActions')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="no-drag flex-1 min-w-0 bg-transparent text-sm text-theme-text placeholder-theme-text-muted outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* Action list */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
          {filteredCategories.map((category) => {
            const color = CATEGORY_COLORS[category.id] || category.color
            // While searching, show matching actions without extra clicks
            const isOpen = expandedCategory === category.id || searchQuery.length > 0
            return (
              <div key={category.id}>
                <button
                  onClick={() =>
                    setExpandedCategory(expandedCategory === category.id ? null : category.id)
                  }
                  aria-expanded={isOpen}
                  className="no-drag w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-theme-surface/50 transition-all text-start"
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${color}18` }}
                  >
                    <span style={{ color }}>
                      <CategoryIcon name={category.icon} />
                    </span>
                  </div>
                  <span className="flex-1 text-sm font-medium text-theme-text">
                    {category.label}
                  </span>
                  <ChevronRight
                    className={`w-4 h-4 text-theme-text-muted shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-90' : 'rtl-flip'
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="ms-12 mt-1 mb-2 space-y-0.5 animate-slide-up">
                    {category.actions.map((action) => (
                      <button
                        key={action.id}
                        onClick={() => handleAction(action)}
                        className="no-drag w-full text-start px-3 py-2 rounded-lg text-sm text-theme-text-secondary hover:text-theme-text hover:bg-theme-surface/40 transition-all"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <div className="my-2 border-t border-theme-border/30" />

          {/* Ask a Question */}
          <button
            onClick={handleAskQuestion}
            className="no-drag w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sky-accent/15 transition-all text-start border border-transparent hover:border-sky-accent/20"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-sky-accent/15 shrink-0">
              <MessageCircle className="w-4 h-4 text-sky-accent" />
            </div>
            <span className="text-sm font-medium text-sky-accent">{t('actions.askQuestion')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
