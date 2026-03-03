import { type JSX, useEffect, useState, useRef } from 'react'
import { formatShortcutForDisplay, keyEventToAccelerator } from './shortcut-utils'

interface ShortcutRecorderProps {
  label: string
  description: string
  value: string
  onChange: (newValue: string) => void
  disabled?: boolean
  pressKeysText?: string
}

export function ShortcutRecorder({
  label,
  description,
  value,
  onChange,
  disabled,
  pressKeysText
}: ShortcutRecorderProps): JSX.Element {
  const [isRecording, setIsRecording] = useState(false)
  const [pendingKeys, setPendingKeys] = useState<string | null>(null)
  const recorderRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isRecording) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      const accelerator = keyEventToAccelerator(e)
      if (accelerator) setPendingKeys(accelerator)
    }

    const handleKeyUp = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (pendingKeys) {
        onChange(pendingKeys)
        setPendingKeys(null)
        setIsRecording(false)
      }
    }

    const handleBlur = (): void => {
      setPendingKeys(null)
      setIsRecording(false)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
      window.removeEventListener('blur', handleBlur)
    }
  }, [isRecording, pendingKeys, onChange])

  const handleClick = (): void => {
    if (disabled) return
    if (isRecording) {
      setIsRecording(false)
      setPendingKeys(null)
    } else {
      setIsRecording(true)
    }
  }

  const displayValue = isRecording
    ? pendingKeys
      ? formatShortcutForDisplay(pendingKeys)
      : pressKeysText || 'Press keys...'
    : formatShortcutForDisplay(value)

  return (
    <div className="flex items-center justify-between p-4 bg-theme-card rounded-xl border border-theme-border/50">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-theme-text">{label}</p>
        <p className="text-xs text-theme-text-tertiary mt-0.5">{description}</p>
      </div>
      <button
        ref={recorderRef}
        onClick={handleClick}
        disabled={disabled}
        className={`
          ms-4 px-4 py-2 rounded-lg text-sm font-mono transition-all flex-shrink-0
          ${
            isRecording
              ? 'bg-sky-accent/20 border-sky-accent/60 text-sky-accent border animate-pulse'
              : 'bg-theme-surface border-theme-border/50 text-theme-text-secondary border hover:border-theme-border hover:text-theme-text'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {displayValue}
      </button>
    </div>
  )
}
