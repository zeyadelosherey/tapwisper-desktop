import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SegmentSource } from '../../models/meeting'

interface SpeakerNameProps {
  source: SegmentSource
  label: string
  /** Omit to make the label read-only */
  onRename?: (source: SegmentSource, name: string) => void
  className?: string
}

/** Speaker label that turns into an input on click (rename "Others" to "Sarah") */
export function SpeakerName({
  source,
  label,
  onRename,
  className = ''
}: SpeakerNameProps): JSX.Element {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(label)

  if (!onRename) return <span className={className}>{label}</span>

  if (editing) {
    const commit = (): void => {
      setEditing(false)
      const name = value.trim()
      if (name !== label) onRename(source, name)
    }
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            setEditing(false)
          }
        }}
        maxLength={40}
        dir="auto"
        aria-label={t('notepad.renameSpeaker', 'Rename speaker')}
        placeholder={label}
        className={`h-5 w-28 rounded-md border border-signal bg-raised px-1 text-[11.5px] font-semibold text-ink outline-none ring-2 ring-signal/15 ${className}`}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setValue(label)
        setEditing(true)
      }}
      title={t('notepad.renameSpeaker', 'Rename speaker')}
      aria-label={t('notepad.renameSpeakerNamed', 'Rename speaker {{name}}', { name: label })}
      className={`-mx-1 rounded-md px-1 decoration-dotted underline-offset-2 hover:bg-hover hover:underline ${className}`}
    >
      {label}
    </button>
  )
}
