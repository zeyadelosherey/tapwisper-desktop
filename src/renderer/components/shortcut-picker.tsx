import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Check } from 'lucide-react'
import { IS_MAC, SHORTCUT_OPTIONS, isHoldShortcut, sameShortcut } from '../utils/shortcuts'
import type { ShortcutSaveError } from '../hooks/use-record-shortcut'
import { ShortcutKeys } from './ui/keycap'
import { ShortcutRecorder } from './shortcut-recorder'
import { FnKeyNotice } from './fn-key-notice'

interface ShortcutPickerProps {
  value: string
  onSave: (accelerator: string) => Promise<ShortcutSaveError | null>
  /** Kept for callers; the list layout works at any width */
  compact?: boolean
  /** Warn when the fn/Globe key also switches the keyboard language (default true) */
  showFnNotice?: boolean
}

/**
 * Choose the record shortcut from a short list of good defaults for this
 * platform (hold fn / Ctrl+Win…), or record a custom key combination.
 */
export function ShortcutPicker({
  value,
  onSave,
  showFnNotice = true
}: ShortcutPickerProps): JSX.Element {
  const { t } = useTranslation()
  const [error, setError] = useState<ShortcutSaveError | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [fnAvailable, setFnAvailable] = useState(true)

  useEffect(() => {
    if (!IS_MAC) return
    window.tapwisper.shortcuts
      .fnAvailable()
      .then(setFnAvailable)
      .catch(() => {})
  }, [])

  const choose = useCallback(
    async (accelerator: string) => {
      setSaving(accelerator)
      setError(null)
      const result = await onSave(accelerator)
      setSaving(null)
      setError(result)
      if (!result) setRecording(false)
    },
    [onSave]
  )

  const cancelRecording = useCallback(() => setRecording(false), [])

  // A custom shortcut that isn't one of the presets is listed too, so it stays visible
  const isPreset = SHORTCUT_OPTIONS.some((o) => sameShortcut(o.value, value))
  const options = isPreset
    ? SHORTCUT_OPTIONS
    : [...SHORTCUT_OPTIONS, { value, hold: isHoldShortcut(value) }]
  const fnSelected = IS_MAC && sameShortcut(value, 'Fn')

  return (
    <div>
      <div
        role="radiogroup"
        aria-label={t('settings.shortcutRecord', 'Record')}
        className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline"
      >
        {options.map((option) => {
          const selected = sameShortcut(option.value, value)
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={saving !== null}
              onClick={() => !selected && choose(option.value)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-start transition-colors duration-150 disabled:cursor-wait ${
                selected ? 'bg-signal-tint/40' : 'hover:bg-hover'
              }`}
            >
              <ShortcutKeys
                accelerator={option.value}
                size="sm"
                pressed={saving === option.value}
                className="w-[112px] shrink-0"
              />
              <span className="min-w-0 flex-1 text-[12.5px] text-ink-muted">
                {option.hold
                  ? t('shortcut.holdHint', 'Hold to talk · add Space for hands-free')
                  : t('shortcut.comboHint', 'Hold to talk, tap to lock')}
              </span>
              {'recommended' in option && option.recommended && !selected && (
                <span className="shrink-0 text-[11px] font-medium text-signal">
                  {t('shortcut.recommended', 'Recommended')}
                </span>
              )}
              {selected && <Check className="h-4 w-4 shrink-0 text-signal" strokeWidth={2.5} />}
            </button>
          )
        })}
      </div>

      {fnSelected && !fnAvailable && (
        <p className="mt-2 text-[12px] text-ink-muted">
          {t(
            'shortcut.fnUnavailable',
            'fn needs TapWisper’s helper, which isn’t installed — Ctrl + Option works meanwhile.'
          )}
        </p>
      )}
      {fnSelected && fnAvailable && showFnNotice && (
        <FnKeyNotice shortcut={value} className="mt-2" />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {recording ? (
          <ShortcutRecorder autoStart onRecord={choose} onCancel={cancelRecording} />
        ) : (
          <button type="button" className="btn-ghost btn-sm" onClick={() => setRecording(true)}>
            {t('shortcut.custom', 'Custom…')}
          </button>
        )}
        {recording && (
          <span className="text-[12px] text-ink-muted">
            {t(
              'shortcut.customHint',
              'Press a modifier plus a key, e.g. Ctrl + Shift + D. Esc cancels.'
            )}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 flex items-center gap-2 text-[12.5px] text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error === 'unsupported-shortcut'
            ? t('shortcut.unsupported', "That key can't be used as a shortcut. Try another one.")
            : t('shortcut.saveFailed', "Couldn't save the shortcut. Please try again.")}
        </p>
      )}
    </div>
  )
}
