import { useId, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

interface ChipsInputProps {
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  label: string
  /** Pending text not yet turned into a chip (lifted so forms can commit it on save) */
  draft?: string
  onDraftChange?: (draft: string) => void
}

/** Free-text chips: Enter or comma adds, Backspace on empty input removes the last one */
export function ChipsInput({
  values,
  onChange,
  placeholder,
  label,
  draft: draftProp,
  onDraftChange
}: ChipsInputProps): JSX.Element {
  const { t } = useTranslation()
  const inputId = useId()
  const [localDraft, setLocalDraft] = useState('')
  const draft = draftProp ?? localDraft
  const setDraft = onDraftChange ?? setLocalDraft

  const commit = (): void => {
    const parts = draft
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    const existing = new Set(values.map((v) => v.toLocaleLowerCase()))
    const added = parts.filter((p) => {
      const key = p.toLocaleLowerCase()
      if (existing.has(key)) return false
      existing.add(key)
      return true
    })
    onChange([...values, ...added])
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' || e.key === ',') {
      if (draft.trim()) {
        e.preventDefault()
        e.stopPropagation()
        commit()
      }
    } else if (e.key === 'Backspace' && !draft && values.length > 0) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <div
      className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-[10px] border border-hairline bg-raised px-2 py-1.5 transition-[border-color,box-shadow] duration-200 ease-out hover:border-hairline-strong focus-within:border-signal focus-within:ring-4 focus-within:ring-signal/15 dark:bg-sunken"
      onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}
    >
      {values.map((value) => (
        <span
          key={value}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-hairline bg-sunken ps-2 pe-1 text-[12.5px] text-ink dark:bg-hover"
        >
          <span dir="auto">{value}</span>
          <button
            type="button"
            onClick={() => onChange(values.filter((v) => v !== value))}
            aria-label={t('common.removeItem', 'Remove {{item}}', { item: value })}
            className="flex h-5 w-5 items-center justify-center rounded text-ink-soft hover:bg-hairline hover:text-ink"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        id={inputId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={values.length === 0 ? placeholder : undefined}
        aria-label={label}
        dir="auto"
        className="h-7 min-w-[120px] flex-1 bg-transparent px-1 text-[13px] text-ink outline-none focus-visible:outline-none"
      />
    </div>
  )
}
