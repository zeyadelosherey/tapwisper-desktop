import { useState, useEffect, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, Plus, Pencil, X } from 'lucide-react'
import { Snippet, findDuplicateTrigger, isValidTrigger } from '../models/snippet'
import { useConfirmDialog } from '../components/confirm-dialog'
import { Page, PageHeader } from '../components/ui/primitives'

interface SnippetDraft {
  trigger: string
  expansion: string
}

type FormMode = { kind: 'new' } | { kind: 'edit'; id: string } | null

const EMPTY_DRAFT: SnippetDraft = { trigger: '', expansion: '' }

/** "/sig" is spoken as "slash sig" */
function spokenForm(trigger: string): string | null {
  const t = trigger.trim()
  return t.startsWith('/') && t.length > 1 ? t.slice(1).replace(/[-_]+/g, ' ') : null
}

export function Snippets(): JSX.Element {
  const { t } = useTranslation()
  const { confirm, dialog } = useConfirmDialog()
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [mode, setMode] = useState<FormMode>(null)
  const [draft, setDraft] = useState<SnippetDraft>(EMPTY_DRAFT)
  const [submitted, setSubmitted] = useState(false)
  const errorId = useId()
  const triggerId = useId()
  const expansionId = useId()

  useEffect(() => {
    window.tapwisper.store.get('snippets').then((stored: unknown) => {
      if (Array.isArray(stored) && stored.length > 0) {
        setSnippets(stored as Snippet[])
      }
    })
  }, [])

  const persistSnippets = (updated: Snippet[]): void => {
    setSnippets(updated)
    window.tapwisper.store.set('snippets', updated)
  }

  const editingId = mode?.kind === 'edit' ? mode.id : undefined
  const duplicate = findDuplicateTrigger(draft.trigger, snippets, editingId)
  const invalid = !!draft.trigger.trim() && !isValidTrigger(draft.trigger)

  // Duplicate triggers are reported live; empty fields only after a save attempt
  const validationError = duplicate
    ? t('snippets.duplicateTrigger', 'A snippet with this trigger already exists')
    : submitted && !draft.trigger.trim()
      ? t('snippets.triggerRequired', 'Trigger is required')
      : submitted && invalid
        ? t('snippets.triggerInvalid', 'Use /name or a short phrase made of words.')
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
    if (
      !trigger ||
      !isValidTrigger(trigger) ||
      !expansion.trim() ||
      findDuplicateTrigger(trigger, snippets, editingId)
    ) {
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

  const spoken = spokenForm(draft.trigger)

  const renderForm = (): JSX.Element => (
    <form
      className="card p-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        saveDraft()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          closeForm()
        }
      }}
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <label htmlFor={triggerId} className="mb-1 block text-[12px] text-ink-soft">
            {t('snippets.triggerLabel', 'Trigger')}
          </label>
          <input
            id={triggerId}
            type="text"
            autoFocus
            placeholder={t('snippets.triggerPlaceholder', '/sig or “my calendar link”')}
            aria-invalid={!!duplicate || (submitted && (!draft.trigger.trim() || invalid))}
            aria-describedby={validationError ? errorId : undefined}
            value={draft.trigger}
            onChange={(e) => setDraft({ ...draft, trigger: e.target.value })}
            dir="auto"
            className={`field ${duplicate ? '!border-danger' : ''}`}
          />
          <p className="mt-1 text-[12px] text-ink-soft">
            {spoken
              ? t('snippets.sayHint', 'Say “slash {{name}}”', { name: spoken })
              : t('snippets.triggerHint', 'Start with / for a command, or use a plain phrase.')}
          </p>
        </div>
        <div>
          <label htmlFor={expansionId} className="mb-1 block text-[12px] text-ink-soft">
            {t('snippets.expansionLabel', 'Expansion text')}
          </label>
          <textarea
            id={expansionId}
            placeholder={t('snippets.expansionPlaceholder', 'The text to type instead')}
            aria-describedby={validationError ? errorId : undefined}
            value={draft.expansion}
            onChange={(e) => setDraft({ ...draft, expansion: e.target.value })}
            dir="auto"
            className="field h-24 resize-none"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p
          id={errorId}
          role={validationError ? 'alert' : undefined}
          className="text-[12.5px] text-danger"
        >
          {validationError}
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={closeForm} className="btn-ghost">
            <X className="h-4 w-4" />
            {t('common.cancel', 'Cancel')}
          </button>
          <button type="submit" disabled={!!duplicate} className="btn-primary">
            {mode?.kind === 'edit'
              ? t('common.save', 'Save')
              : t('snippets.addSnippet', 'Add snippet')}
          </button>
        </div>
      </div>
    </form>
  )

  return (
    <Page>
      <PageHeader
        title={t('snippets.title', 'Snippets')}
        description={t('snippets.subtitle', 'Say a trigger and TapWisper types the full text.')}
        actions={
          mode === null && snippets.length > 0 ? (
            <button type="button" onClick={openNew} className="btn-primary">
              <Plus className="h-4 w-4" />
              {t('snippets.addSnippet', 'Add snippet')}
            </button>
          ) : undefined
        }
      />

      {mode?.kind === 'new' && <div className="mb-4">{renderForm()}</div>}

      {snippets.length === 0 && mode === null ? (
        <div className="grain-hero flex flex-col items-center rounded-2xl px-5 pb-10 pt-12 text-center">
          <p className="font-display text-[17px] text-ink">
            {t('snippets.noSnippets', 'No snippets yet')}
          </p>
          <p className="mt-1 max-w-[380px] text-[13px] leading-snug text-ink-muted">
            {t('snippets.noSnippetsHint', 'Create shortcuts like /email or “my address”.')}
          </p>
          <button type="button" onClick={openNew} className="btn-primary mt-4">
            <Plus className="h-4 w-4" />
            {t('snippets.addSnippet', 'Add snippet')}
          </button>
        </div>
      ) : (
        snippets.length > 0 && (
          <>
            <ul className="divide-y divide-hairline/70 border-t border-hairline/70">
              {snippets.map((snippet) =>
                editingId === snippet.id ? (
                  <li key={snippet.id} className="py-3">
                    {renderForm()}
                  </li>
                ) : (
                  <li key={snippet.id} className="group flex min-h-10 items-start gap-4 py-2">
                    <p
                      dir="auto"
                      title={
                        spokenForm(snippet.trigger)
                          ? t('snippets.sayHint', 'Say “slash {{name}}”', {
                              name: spokenForm(snippet.trigger)
                            })
                          : undefined
                      }
                      className={`w-44 shrink-0 truncate pt-px text-[13px] ${
                        snippet.trigger.trim().startsWith('/') ? 'text-signal' : 'text-ink'
                      }`}
                    >
                      {snippet.trigger}
                    </p>
                    <p
                      dir="auto"
                      className="min-w-0 flex-1 whitespace-pre-line text-[13px] leading-relaxed text-ink-muted line-clamp-2"
                    >
                      {snippet.expansion}
                    </p>
                    <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => openEdit(snippet)}
                        aria-label={t('snippets.editSnippet', 'Edit snippet {{trigger}}', {
                          trigger: snippet.trigger
                        })}
                        title={t('common.edit', 'Edit')}
                        className="icon-btn"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSnippet(snippet)}
                        aria-label={t('snippets.deleteSnippet', 'Delete snippet {{trigger}}', {
                          trigger: snippet.trigger
                        })}
                        title={t('common.delete', 'Delete')}
                        className="icon-btn hover:!text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                )
              )}
            </ul>
            <p className="mt-3 text-[12px] text-ink-soft">
              {t(
                'snippets.slashExplainer',
                'Commands start with a slash. Say “slash sig” to insert it.'
              )}{' '}
              {t('snippets.phraseExplainer', 'Or use a plain phrase and simply say it.')}
            </p>
          </>
        )
      )}
      {dialog}
    </Page>
  )
}
