import { useState, useEffect, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, Plus, Pencil } from 'lucide-react'
import { Snippet, findDuplicateTrigger } from '../models/snippet'
import { useConfirmDialog } from '../components/confirm-dialog'

interface SnippetDraft {
  trigger: string
  expansion: string
}

type FormMode = { kind: 'new' } | { kind: 'edit'; id: string } | null

const EMPTY_DRAFT: SnippetDraft = { trigger: '', expansion: '' }

const ICON_BUTTON_FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-sky-accent/60'

export function Snippets(): JSX.Element {
  const { t } = useTranslation()
  const { confirm, dialog } = useConfirmDialog()
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [mode, setMode] = useState<FormMode>(null)
  const [draft, setDraft] = useState<SnippetDraft>(EMPTY_DRAFT)
  const [submitted, setSubmitted] = useState(false)
  const errorId = useId()

  // Load snippets from persistent store
  useEffect(() => {
    window.tapwisper.store.get('snippets').then((stored: unknown) => {
      if (Array.isArray(stored) && stored.length > 0) {
        setSnippets(stored as Snippet[])
      }
    })
  }, [])

  // Persist snippets to store whenever they change
  const persistSnippets = (updated: Snippet[]): void => {
    setSnippets(updated)
    window.tapwisper.store.set('snippets', updated)
  }

  const editingId = mode?.kind === 'edit' ? mode.id : undefined
  const duplicate = findDuplicateTrigger(draft.trigger, snippets, editingId)

  // Duplicate triggers are reported live; empty fields only after a save attempt
  const validationError = duplicate
    ? t('snippets.duplicateTrigger', 'A snippet with this trigger already exists')
    : submitted && !draft.trigger.trim()
      ? t('snippets.triggerRequired', 'Trigger is required')
      : submitted && !draft.expansion.trim()
        ? t('snippets.expansionRequired', 'Expansion text is required')
        : null

  const openNew = (): void => {
    setDraft(EMPTY_DRAFT)
    setSubmitted(false)
    setMode({ kind: 'new' })
  }

  const openEdit = (snippet: Snippet): void => {
    setDraft({ trigger: snippet.trigger, expansion: snippet.expansion })
    setSubmitted(false)
    setMode({ kind: 'edit', id: snippet.id })
  }

  const closeForm = (): void => {
    setMode(null)
    setDraft(EMPTY_DRAFT)
    setSubmitted(false)
  }

  const saveDraft = (): void => {
    setSubmitted(true)
    const trigger = draft.trigger.trim()
    const expansion = draft.expansion
    if (!trigger || !expansion.trim() || findDuplicateTrigger(trigger, snippets, editingId)) {
      return
    }

    if (mode?.kind === 'edit') {
      persistSnippets(snippets.map((s) => (s.id === mode.id ? { ...s, trigger, expansion } : s)))
    } else {
      persistSnippets([...snippets, { id: Date.now().toString(), trigger, expansion }])
    }
    closeForm()
  }

  const deleteSnippet = async (snippet: Snippet): Promise<void> => {
    const ok = await confirm({
      title: t('snippets.deleteTitle', 'Delete snippet?'),
      message: t(
        'snippets.deleteMessage',
        'The snippet "{{trigger}}" will be permanently removed.',
        {
          trigger: snippet.trigger
        }
      )
    })
    if (!ok) return
    persistSnippets(snippets.filter((s) => s.id !== snippet.id))
    if (editingId === snippet.id) closeForm()
  }

  const renderForm = (): JSX.Element => (
    <div
      className="bg-theme-card rounded-xl p-4 border border-sky-accent/30 space-y-3"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          closeForm()
        }
      }}
    >
      <input
        type="text"
        autoFocus
        placeholder={t('snippets.triggerPlaceholder')}
        aria-label={t('snippets.triggerLabel', 'Trigger')}
        aria-invalid={!!duplicate || (submitted && !draft.trigger.trim())}
        aria-describedby={validationError ? errorId : undefined}
        value={draft.trigger}
        onChange={(e) => setDraft({ ...draft, trigger: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            saveDraft()
          }
        }}
        className={`w-full bg-theme-surface/50 rounded-lg px-3 py-2 text-sm text-theme-text placeholder-theme-text-muted outline-none font-mono focus-visible:ring-1 ${
          duplicate ? 'ring-1 ring-recording-red/60' : 'focus-visible:ring-sky-accent/40'
        }`}
      />
      <textarea
        placeholder={t('snippets.expansionPlaceholder')}
        aria-label={t('snippets.expansionLabel', 'Expansion text')}
        aria-describedby={validationError ? errorId : undefined}
        value={draft.expansion}
        onChange={(e) => setDraft({ ...draft, expansion: e.target.value })}
        className="w-full bg-theme-surface/50 rounded-lg px-3 py-2 text-sm text-theme-text placeholder-theme-text-muted outline-none resize-none h-20 focus-visible:ring-1 focus-visible:ring-sky-accent/40"
      />
      {validationError && (
        <p id={errorId} role="alert" className="text-xs text-recording-red">
          {validationError}
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={saveDraft}
          disabled={!!duplicate}
          className={`btn-primary disabled:opacity-30 ${ICON_BUTTON_FOCUS}`}
        >
          {mode?.kind === 'edit' ? t('common.save', 'Save') : t('snippets.addSnippet')}
        </button>
        <button
          onClick={closeForm}
          className={`px-3 py-2 bg-theme-surface/30 rounded-lg text-sm text-theme-text-secondary ${ICON_BUTTON_FOCUS}`}
        >
          {t('recording.cancel')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="drag-region mb-6">
        <h1 className="text-2xl font-bold text-theme-text">{t('snippets.title')}</h1>
        <p className="text-sm text-theme-text-secondary mt-1">{t('snippets.subtitle')}</p>
      </div>

      {/* Snippets List */}
      <div>
        {snippets.length === 0 && mode === null ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-xl bg-theme-surface/50 flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">⚡</span>
            </div>
            <p className="text-sm text-theme-text-muted">{t('snippets.noSnippets')}</p>
            <p className="text-xs text-theme-text-muted mt-1">{t('snippets.noSnippetsHint')}</p>
            <button onClick={openNew} className={`mt-4 btn-primary ${ICON_BUTTON_FOCUS}`}>
              {t('snippets.addSnippet')}
            </button>
          </div>
        ) : (
          <>
            {snippets.map((snippet) =>
              editingId === snippet.id ? (
                <div key={snippet.id} className="py-3">
                  {renderForm()}
                </div>
              ) : (
                <div
                  key={snippet.id}
                  className="py-3.5 border-b border-theme-border/30 group last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-theme-text font-mono bg-theme-surface/50 px-2 py-0.5 rounded">
                      {snippet.trigger}
                    </span>
                    <span
                      className="inline-block text-theme-text-muted text-sm rtl:rotate-180"
                      aria-hidden="true"
                    >
                      &rarr;
                    </span>
                    <span className="text-sm text-theme-text-secondary flex-1 min-w-0 truncate">
                      {snippet.expansion}
                    </span>
                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(snippet)}
                        aria-label={t('snippets.editSnippet', 'Edit snippet {{trigger}}', {
                          trigger: snippet.trigger
                        })}
                        title={t('common.edit', 'Edit')}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-theme-text-muted hover:text-theme-text hover:bg-theme-surface/50 transition-all ${ICON_BUTTON_FOCUS}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteSnippet(snippet)}
                        aria-label={t('snippets.deleteSnippet', 'Delete snippet {{trigger}}', {
                          trigger: snippet.trigger
                        })}
                        title={t('common.delete', 'Delete')}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-theme-text-muted hover:text-recording-red hover:bg-recording-red/10 transition-all ${ICON_BUTTON_FOCUS}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Add New Snippet */}
            {mode?.kind === 'new' ? (
              <div className="mt-4">{renderForm()}</div>
            ) : (
              <button
                onClick={openNew}
                className={`flex items-center gap-2 px-4 py-3 bg-theme-card rounded-xl border border-dashed border-theme-border text-theme-text-secondary hover:text-theme-text hover:border-sky-accent/30 transition-all text-sm w-full mt-4 ${ICON_BUTTON_FOCUS}`}
              >
                <Plus className="w-4 h-4" />
                {t('snippets.addSnippet')}
              </button>
            )}
          </>
        )}
      </div>
      {dialog}
    </div>
  )
}
