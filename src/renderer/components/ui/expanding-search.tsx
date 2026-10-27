import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'

interface ExpandingSearchProps {
  value: string
  onChange: (value: string) => void
  /** Placeholder and accessible name */
  label: string
  /** Start as a field instead of an icon (e.g. long lists) */
  open?: boolean
  className?: string
}

/** A search icon that expands into a field; collapses again when left empty */
export function ExpandingSearch({
  value,
  onChange,
  label,
  open = false,
  className = 'w-56'
}: ExpandingSearchProps): JSX.Element {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const show = open || expanded || !!value

  const clear = (): void => {
    onChange('')
    setExpanded(false)
  }

  if (!show) {
    return (
      <button
        type="button"
        onClick={() => {
          setExpanded(true)
          requestAnimationFrame(() => inputRef.current?.focus())
        }}
        aria-label={label}
        title={label}
        className="icon-btn"
      >
        <Search className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div className={`relative max-w-full ${className}`}>
      <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (!value) setExpanded(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') clear()
        }}
        placeholder={label}
        aria-label={label}
        className="field pe-8 ps-8"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label={t('home.clearSearch', 'Clear search')}
          className="icon-btn absolute end-0.5 top-1/2 h-7 w-7 -translate-y-1/2"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
