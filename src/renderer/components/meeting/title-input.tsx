import { memo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** Meeting title edited in place; saves on Enter or blur */
export const TitleInput = memo(function TitleInput({
  meetingId,
  title,
  className = ''
}: {
  meetingId: string
  title: string
  className?: string
}): JSX.Element {
  const { t } = useTranslation()
  const [value, setValue] = useState(title)
  const [focused, setFocused] = useState(false)

  // Follow saved changes (e.g. the AI title) unless the user is editing
  useEffect(() => {
    if (!focused) setValue(title)
  }, [title, focused, meetingId])

  const commit = (): void => {
    const next = value.trim()
    if (next !== title.trim()) void window.tapwisper.meetings.update(meetingId, { title: next })
  }

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        commit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setValue(title)
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
        }
      }}
      placeholder={t('notepad.untitled', 'Untitled meeting')}
      aria-label={t('notepad.titleLabel', 'Meeting title')}
      maxLength={120}
      dir={value ? 'auto' : undefined}
      className={`font-display w-full min-w-0 truncate rounded-md bg-transparent text-ink outline-none placeholder:text-ink-faint hover:bg-hover/60 focus:bg-sunken/60 focus-visible:outline-none ${className}`}
    />
  )
})
