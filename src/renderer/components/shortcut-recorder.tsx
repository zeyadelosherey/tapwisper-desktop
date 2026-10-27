import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { keyEventToAccelerator } from '../utils/shortcuts'
import { ShortcutKeys } from './ui/keycap'

interface ShortcutRecorderProps {
  /** Called with the new accelerator once the keys are released */
  onRecord: (accelerator: string) => void
  /** Called when recording ends without a result (Escape, blur, click) */
  onCancel?: () => void
  /** Start listening immediately */
  autoStart?: boolean
  disabled?: boolean
  className?: string
}

/**
 * Click, then press a key combination (modifier + key). The combo is
 * captured on key release; Escape or leaving the window cancels.
 */
export function ShortcutRecorder({
  onRecord,
  onCancel,
  autoStart = false,
  disabled,
  className = ''
}: ShortcutRecorderProps): JSX.Element {
  const { t } = useTranslation()
  const [isRecording, setIsRecording] = useState(autoStart)
  const [pendingKeys, setPendingKeys] = useState<string | null>(null)

  useEffect(() => {
    if (!isRecording) return

    const stop = (): void => {
      setPendingKeys(null)
      setIsRecording(false)
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        stop()
        onCancel?.()
        return
      }
      const accelerator = keyEventToAccelerator(e)
      if (accelerator) setPendingKeys(accelerator)
    }

    const handleKeyUp = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (pendingKeys) {
        onRecord(pendingKeys)
        stop()
      }
    }

    const handleBlur = (): void => {
      stop()
      onCancel?.()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
      window.removeEventListener('blur', handleBlur)
    }
  }, [isRecording, pendingKeys, onRecord, onCancel])

  const toggle = (): void => {
    if (disabled) return
    if (isRecording) {
      setIsRecording(false)
      setPendingKeys(null)
      onCancel?.()
    } else {
      setIsRecording(true)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-pressed={isRecording}
      className={`inline-flex min-h-[44px] min-w-[180px] items-center justify-center gap-2 rounded-xl border px-4 py-2 text-[13px] transition-[border-color,background-color,box-shadow] duration-200 ease-out disabled:opacity-45 ${
        isRecording
          ? 'border-signal bg-signal-tint/60 text-signal ring-4 ring-signal/15'
          : 'border-dashed border-hairline-strong text-ink-muted hover:border-signal/50 hover:text-ink'
      } ${className}`}
    >
      {isRecording ? (
        pendingKeys ? (
          <ShortcutKeys accelerator={pendingKeys} size="sm" />
        ) : (
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-signal animate-live-pulse" />
            {t('settings.pressKeys', 'Press keys...')}
          </span>
        )
      ) : (
        t('shortcut.recordCustom', 'Record a combination')
      )}
    </button>
  )
}
