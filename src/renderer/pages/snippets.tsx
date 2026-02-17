import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, Plus } from 'lucide-react'
import { Snippet } from '../models/snippet'

export function Snippets(): JSX.Element {
  const { t } = useTranslation()
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [newSnippet, setNewSnippet] = useState({ trigger: '', expansion: '' })
  const [showNewSnippet, setShowNewSnippet] = useState(false)

  // Load snippets from persistent store
  useEffect(() => {
    window.tapwisper.store.get('snippets').then((stored: unknown) => {
      if (Array.isArray(stored) && stored.length > 0) {
        setSnippets(stored as Snippet[])
      }
    })
  }, [])

  // Persist snippets to store whenever they change
  const persistSnippets = (updated: Snippet[]) => {
    setSnippets(updated)
    window.tapwisper.store.set('snippets', updated)
  }

  const addSnippet = () => {
    if (!newSnippet.trigger || !newSnippet.expansion) return
    persistSnippets([...snippets, { id: Date.now().toString(), ...newSnippet }])
    setNewSnippet({ trigger: '', expansion: '' })
    setShowNewSnippet(false)
  }

  const deleteSnippet = (id: string) => {
    persistSnippets(snippets.filter((s) => s.id !== id))
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="drag-region mb-6">
        <h1 className="text-2xl font-bold text-theme-text">{t('snippets.title')}</h1>
        <p className="text-sm text-theme-text-secondary mt-1">{t('snippets.subtitle')}</p>
      </div>

      {/* Snippets List */}
      <div>
        {snippets.length === 0 && !showNewSnippet ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-xl bg-theme-surface/50 flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">⚡</span>
            </div>
            <p className="text-sm text-theme-text-muted">{t('snippets.noSnippets')}</p>
            <p className="text-xs text-theme-text-muted mt-1">
              {t('snippets.noSnippetsHint')}
            </p>
            <button
              onClick={() => setShowNewSnippet(true)}
              className="mt-4 btn-primary"
            >
              {t('snippets.addSnippet')}
            </button>
          </div>
        ) : (
          <>
            {snippets.map((snippet) => (
              <div
                key={snippet.id}
                className="py-3.5 border-b border-theme-border/30 group last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-theme-text font-mono bg-theme-surface/50 px-2 py-0.5 rounded">
                    {snippet.trigger}
                  </span>
                  <span className="text-theme-text-muted text-sm">&rarr;</span>
                  <span className="text-sm text-theme-text-secondary flex-1 min-w-0 truncate">
                    {snippet.expansion}
                  </span>
                  <button
                    onClick={() => deleteSnippet(snippet.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-theme-text-muted hover:text-recording-red transition-all opacity-0 group-hover:opacity-100 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* Add New Snippet */}
            {showNewSnippet ? (
              <div className="bg-theme-card rounded-xl p-4 border border-sky-accent/30 space-y-3 mt-4">
                <input
                  type="text"
                  placeholder={t('snippets.triggerPlaceholder')}
                  value={newSnippet.trigger}
                  onChange={(e) =>
                    setNewSnippet({ ...newSnippet, trigger: e.target.value })
                  }
                  className="w-full bg-theme-surface/50 rounded-lg px-3 py-2 text-sm text-theme-text placeholder-theme-text-muted outline-none font-mono"
                />
                <textarea
                  placeholder={t('snippets.expansionPlaceholder')}
                  value={newSnippet.expansion}
                  onChange={(e) =>
                    setNewSnippet({ ...newSnippet, expansion: e.target.value })
                  }
                  className="w-full bg-theme-surface/50 rounded-lg px-3 py-2 text-sm text-theme-text placeholder-theme-text-muted outline-none resize-none h-20"
                />
                <div className="flex gap-2">
                  <button
                    onClick={addSnippet}
                    disabled={!newSnippet.trigger || !newSnippet.expansion}
                    className="btn-primary disabled:opacity-30"
                  >
                    {t('snippets.addSnippet')}
                  </button>
                  <button
                    onClick={() => setShowNewSnippet(false)}
                    className="px-3 py-2 bg-theme-surface/30 rounded-lg text-sm text-theme-text-secondary"
                  >
                    {t('recording.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNewSnippet(true)}
                className="flex items-center gap-2 px-4 py-3 bg-theme-card rounded-xl border border-dashed border-theme-border text-theme-text-secondary hover:text-theme-text hover:border-sky-accent/30 transition-all text-sm w-full mt-4"
              >
                <Plus className="w-4 h-4" />
                {t('snippets.addSnippet')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
