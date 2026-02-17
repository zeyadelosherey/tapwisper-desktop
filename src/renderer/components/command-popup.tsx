import { useEffect, useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Globe, Sparkles, FileText, BookOpen, Search, MessageCircle,
  ChevronRight, X
} from 'lucide-react'

interface ActionCategory {
  id: string
  label: string
  icon: React.ReactNode
  color: string
  actions: { id: string; label: string }[]
}

const BUILT_IN_CATEGORIES: ActionCategory[] = [
  {
    id: 'translate',
    label: 'Translate',
    icon: <Globe className="w-4 h-4" />,
    color: '#7EB6E0',
    actions: [
      { id: 'translate-auto', label: 'Auto Detect' },
      { id: 'translate-ar-en', label: 'Arabic → English' },
      { id: 'translate-en-ar', label: 'English → Arabic' }
    ]
  },
  {
    id: 'rephrase',
    label: 'Rephrase',
    icon: <Sparkles className="w-4 h-4" />,
    color: '#B07CD8',
    actions: [
      { id: 'rephrase-professional', label: 'Professional' },
      { id: 'rephrase-casual', label: 'Casual' },
      { id: 'rephrase-friendly', label: 'Friendly' },
      { id: 'rephrase-formal', label: 'Formal' },
      { id: 'rephrase-concise', label: 'Concise' },
      { id: 'rephrase-expand', label: 'Expand' },
      { id: 'rephrase-shorten', label: 'Shorten' }
    ]
  },
  {
    id: 'format',
    label: 'Format',
    icon: <FileText className="w-4 h-4" />,
    color: '#E8A838',
    actions: [
      { id: 'format-email', label: 'Email' },
      { id: 'format-formal-letter', label: 'Formal Letter' },
      { id: 'format-casual-message', label: 'Casual Message' },
      { id: 'format-business-report', label: 'Business Report' },
      { id: 'format-social-media', label: 'Social Media' }
    ]
  },
  {
    id: 'grammar',
    label: 'Grammar',
    icon: <BookOpen className="w-4 h-4" />,
    color: '#4DC778',
    actions: [
      { id: 'grammar-fix', label: 'Fix Grammar' },
      { id: 'grammar-spelling', label: 'Fix Spelling' },
      { id: 'grammar-simplify', label: 'Simplify' }
    ]
  }
]

export function CommandPopup(): JSX.Element {
  const { t } = useTranslation()
  const [selectedText, setSelectedText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    document.documentElement.classList.add('transparent')

    const unsubSetText = window.tapwisper.on('command-popup:set-text', (text: unknown) => {
      if (typeof text === 'string') {
        setSelectedText(text)
        setVisible(true)
      }
    })

    const unsubGrab = window.tapwisper.on('command-popup:grab-text', async () => {
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
  }, [])

  const filteredCategories = useMemo(() => {
    if (!searchQuery) return BUILT_IN_CATEGORIES
    const q = searchQuery.toLowerCase()
    return BUILT_IN_CATEGORIES.map((cat) => ({
      ...cat,
      actions: cat.actions.filter(
        (a) =>
          a.label.toLowerCase().includes(q) ||
          cat.label.toLowerCase().includes(q)
      )
    })).filter((cat) => cat.actions.length > 0 || cat.label.toLowerCase().includes(q))
  }, [searchQuery])

  const handleAction = useCallback(
    (actionId: string) => {
      // Send action to AI panel with selected text
      window.tapwisper.window.send('aiPanel', 'ai-panel:process', {
        text: selectedText,
        actionId
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

  const truncatedText = selectedText.length > 50
    ? selectedText.slice(0, 50) + '...'
    : selectedText

  if (!visible) return <div className="w-full h-full" />

  return (
    <div className="w-full h-full flex items-center justify-center no-select p-4">
      <div className="glass rounded-2xl popup-shadow w-[360px] max-h-[440px] flex flex-col overflow-hidden animate-scale-up border border-theme-border/40">
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
          {filteredCategories.map((category) => (
            <div key={category.id}>
              <button
                onClick={() =>
                  setExpandedCategory(
                    expandedCategory === category.id ? null : category.id
                  )
                }
                className="no-drag w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-theme-surface/50 transition-all text-start"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${category.color}18` }}
                >
                  <span style={{ color: category.color }}>{category.icon}</span>
                </div>
                <span className="flex-1 text-sm font-medium text-theme-text">
                  {category.label}
                </span>
                <ChevronRight
                  className={`w-4 h-4 text-theme-text-muted shrink-0 transition-transform duration-200 ${
                    expandedCategory === category.id ? 'rotate-90' : ''
                  }`}
                />
              </button>

              {expandedCategory === category.id && (
                <div className="ml-12 mt-1 mb-2 space-y-0.5 animate-slide-up">
                  {category.actions.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleAction(action.id)}
                      className="no-drag w-full text-start px-3 py-2 rounded-lg text-sm text-theme-text-secondary hover:text-theme-text hover:bg-theme-surface/40 transition-all"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

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
