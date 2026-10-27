import { useEffect, useId, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import type { DictionaryEntry } from '../models/dictionary'
import { useConfirmDialog } from '../components/confirm-dialog'
import { ChipsInput } from '../components/ui/chips-input'
import { Page, PageHeader } from '../components/ui/primitives'
import { ExpandingSearch } from '../components/ui/expanding-search'

interface Draft {
  term: string
  aliases: string[]
  aliasDraft: string
}

const EMPTY_DRAFT: Draft = { term: '', aliases: [], aliasDraft: '' }

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function isEntry(value: unknown): value is DictionaryEntry {
  const v = value as DictionaryEntry
  return !!v && typeof v.id === 'string' && typeof v.term === 'string' && Array.isArray(v.aliases)
}

/** Pending alias text plus committed chips, de-duplicated and without the term itself */
function finalAliases(draft: Draft): string[] {
  const pending = draft.aliasDraft
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)
  const seen = new Set<string>([draft.term.trim().toLocaleLowerCase()])
  return [...draft.aliases, ...pending].filter((a) => {
    const key = a.toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function Dictionary(): JSX.Element {
  const { t } = useTranslation()
  const { confirm, dialog } = useConfirmDialog()
  const [entries, setEntries] = useState<DictionaryEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [editing, setEditing] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    window.tapwisper.store
      .get('dictionary')
      .then((stored: unknown) => {
        if (Array.isArray(stored)) setEntries(stored.filter(isEntry))
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const persist = (next: DictionaryEntry[]): void => {
    setEntries(next)
    void window.tapwisper.store.set('dictionary', next)
  }

  const isDuplicate = (term: string, exceptId?: string): boolean => {
    const key = term.trim().toLocaleLowerCase()
    return (
      !!key && entries.some((e) => e.id !== exceptId && e.term.trim().toLocaleLowerCase() === key)
    )
  }

  const add = (): void => {
    setSubmitted(true)
    const term = draft.term.trim()
    if (!term || isDuplicate(term)) return
    persist([
      { id: generateId(), term, aliases: finalAliases(draft), createdAt: Date.now() },
      ...entries
    ])
    setDraft(EMPTY_DRAFT)
    setSubmitted(false)
  }

  const startEdit = (entry: DictionaryEntry): void => {
    setEditing(entry.id)
    setEditDraft({ term: entry.term, aliases: entry.aliases, aliasDraft: '' })
  }

  const saveEdit = (): void => {
    if (!editing) return
    const term = editDraft.term.trim()
    if (!term || isDuplicate(term, editing)) return
    persist(
      entries.map((e) => (e.id === editing ? { ...e, term, aliases: finalAliases(editDraft) } : e))
    )
    setEditing(null)
  }

  const remove = async (entry: DictionaryEntry): Promise<void> => {
    const ok = await confirm({
      title: t('dictionary.deleteTitle', 'Remove from dictionary?'),
      message: t('dictionary.deleteMessage', '“{{term}}” and its corrections will be removed.', {
        term: entry.term
      }),
      confirmLabel: t('common.remove', 'Remove')
    })
    if (!ok) return
    persist(entries.filter((e) => e.id !== entry.id))
    if (editing === entry.id) setEditing(null)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase()
    if (!q) return entries
    return entries.filter(
      (e) =>
        e.term.toLocaleLowerCase().includes(q) ||
        e.aliases.some((a) => a.toLocaleLowerCase().includes(q))
    )
  }, [entries, search])

  const addError = isDuplicate(draft.term)
    ? t('dictionary.duplicate', 'This word is already in your dictionary.')
    : submitted && !draft.term.trim()
      ? t('dictionary.termRequired', 'Enter a word or name first.')
      : null

  return (
    <Page>
      <PageHeader
        title={t('dictionary.title', 'Dictionary')}
        description={t('dictionary.subtitle', 'Names and words TapWisper should always get right.')}
        actions={
          entries.length > 4 ? (
            <ExpandingSearch
              value={search}
              onChange={setSearch}
              label={t('dictionary.search', 'Search dictionary')}
            />
          ) : undefined
        }
      />

      {/* Add */}
      <EntryForm
        draft={draft}
        onChange={setDraft}
        onSubmit={add}
        error={addError}
        submitLabel={t('dictionary.add', 'Add word')}
      />

      {/* List */}
      <div className="mt-6">
        {!loaded ? null : entries.length === 0 ? (
          <div className="grain-hero flex flex-col items-center rounded-2xl px-5 pb-10 pt-12 text-center">
            <p className="font-display text-[17px] text-ink">
              {t('dictionary.emptyTitle', 'Your dictionary is empty')}
            </p>
            <p className="mt-1 max-w-[380px] text-[13px] leading-snug text-ink-muted">
              {t(
                'dictionary.emptyBody',
                'Add the words that come out wrong — your name, your company, product names, technical terms.'
              )}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-muted">
            {t('home.noResults', 'No results found')}
          </p>
        ) : (
          <ul className="divide-y divide-hairline/70 border-t border-hairline/70">
            {filtered.map((entry) =>
              editing === entry.id ? (
                <li key={entry.id} className="py-3">
                  <EntryForm
                    draft={editDraft}
                    onChange={setEditDraft}
                    onSubmit={saveEdit}
                    onCancel={() => setEditing(null)}
                    error={
                      isDuplicate(editDraft.term, entry.id)
                        ? t('dictionary.duplicate', 'This word is already in your dictionary.')
                        : null
                    }
                    submitLabel={t('common.save', 'Save')}
                    compact
                  />
                </li>
              ) : (
                <li key={entry.id} className="group flex min-h-10 items-center gap-4 py-1.5">
                  <div className="flex min-w-0 flex-1 items-baseline gap-3">
                    <p className="shrink-0 truncate text-[13.5px] text-ink" dir="auto">
                      {entry.term}
                    </p>
                    {entry.aliases.length > 0 && (
                      <p className="min-w-0 truncate text-[12px] text-ink-soft">
                        {t('dictionary.correctsLabel', 'Fixes')}{' '}
                        <bdi>{entry.aliases.join(', ')}</bdi>
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => startEdit(entry)}
                      aria-label={t('dictionary.edit', 'Edit {{term}}', { term: entry.term })}
                      title={t('common.edit', 'Edit')}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="icon-btn hover:!text-danger"
                      onClick={() => remove(entry)}
                      aria-label={t('dictionary.delete', 'Remove {{term}}', { term: entry.term })}
                      title={t('common.remove', 'Remove')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </div>
      {dialog}
    </Page>
  )
}

function EntryForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
  error,
  submitLabel,
  compact = false
}: {
  draft: Draft
  onChange: Dispatch<SetStateAction<Draft>>
  onSubmit: () => void
  onCancel?: () => void
  error: string | null
  submitLabel: string
  compact?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const termId = useId()
  const errorId = useId()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onCancel) {
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      <div className="grid items-end gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]">
        <div>
          <label htmlFor={termId} className="mb-1 block text-[12px] text-ink-soft">
            {t('dictionary.termLabel', 'Word or name')}
          </label>
          <input
            id={termId}
            value={draft.term}
            onChange={(e) => {
              const term = e.target.value
              onChange((d) => ({ ...d, term }))
            }}
            placeholder={t('dictionary.termPlaceholder', 'e.g. TapWisper')}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            autoFocus={compact}
            dir="auto"
            className={`field ${error ? '!border-danger focus:!ring-danger/15' : ''}`}
          />
        </div>
        <div>
          <span className="mb-1 block text-[12px] text-ink-soft">
            {t('dictionary.aliasesLabel', 'Often misheard as')}
            <span className="ms-1.5 text-ink-faint">{t('dictionary.optional', 'optional')}</span>
          </span>
          <ChipsInput
            values={draft.aliases}
            onChange={(aliases) => onChange((d) => ({ ...d, aliases }))}
            draft={draft.aliasDraft}
            onDraftChange={(aliasDraft) => onChange((d) => ({ ...d, aliasDraft }))}
            label={t('dictionary.aliasesLabel', 'Often misheard as')}
            placeholder={t(
              'dictionary.aliasesPlaceholder',
              'tap whisper, tapwhisper… (Enter to add)'
            )}
          />
        </div>
        <div className="flex shrink-0 gap-1.5">
          {onCancel && (
            <button type="button" className="btn-ghost" onClick={onCancel}>
              <X className="h-3.5 w-3.5" />
              {t('common.cancel', 'Cancel')}
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={!!error && !!draft.term.trim()}>
            {!onCancel && <Plus className="h-3.5 w-3.5" />}
            {submitLabel}
          </button>
        </div>
      </div>
      <p
        id={errorId}
        role={error ? 'alert' : undefined}
        className={error ? 'mt-1.5 text-[12px] text-danger' : 'sr-only'}
      >
        {error}
      </p>
    </form>
  )
}
