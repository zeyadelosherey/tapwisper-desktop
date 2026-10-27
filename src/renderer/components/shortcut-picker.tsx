import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Check } from 'lucide-react'
import {
  DEFAULT_RECORD_SHORTCUT,
  RECOMMENDED_SINGLE_KEY,
  SINGLE_KEY_OPTIONS,
  shortcutParts,
  singleKeyOf
} from '../utils/shortcuts'
import type { ShortcutSaveError } from '../hooks/use-record-shortcut'
import { ShortcutKeys } from './ui/keycap'
import { ShortcutRecorder } from './shortcut-recorder'

interface ShortcutPickerProps {
  value: string
  onSave: (accelerator: string) => Promise<ShortcutSaveError | null>
  /** Narrow containers lay the options out in two columns */
  compact?: boolean
}

/**
 * Choose the record shortcut: the current key combination, a single
 * push-to-talk key, or a custom combination recorded from the keyboard.
 */
export function ShortcutPicker({
  value,
  onSave,
  compact = false
}: ShortcutPickerProps): JSX.Element {
  const { t } = useTranslation()
  const [error, setError] = useState<ShortcutSaveError | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)

  const currentSingle = singleKeyOf(value)
  const combo = currentSingle ? DEFAULT_RECORD_SHORTCUT : value

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

  const options: { value: string; title: string; hint: string; recommended?: boolean }[] = [
    {
      value: combo,
      title: t('shortcut.comboTitle', 'Key combination'),
      hint: t('shortcut.comboHint', 'Hold to talk, tap to lock')
    },
    ...SINGLE_KEY_OPTIONS.map((key) => ({
      value: key,
      title: t('shortcut.right', 'Right {{key}}', { key: shortcutParts(key)[0]?.glyph ?? '' }),
      hint: t('shortcut.singleHint', 'Hold to talk'),
      recommended: key === RECOMMENDED_SINGLE_KEY
    }))
  ]

  const isSelected = (option: string): boolean =>
    currentSingle ? singleKeyOf(option) === currentSingle : option === value

  return (
    <div>
      <div
        role="radiogroup"
        aria-label={t('settings.shortcutRecord', 'Record')}
        className={`grid grid-cols-2 gap-2.5 ${compact ? '' : 'lg:grid-cols-4'}`}
      >
        {options.map((option) => {
          const selected = isSelected(option.value)
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={saving !== null}
              onClick={() => !selected && choose(option.value)}
              className={`group relative flex flex-col items-center gap-3 rounded-xl border px-3 pb-3.5 pt-5 text-center transition-[border-color,box-shadow,background-color] duration-200 ease-out disabled:cursor-wait ${
                selected
                  ? 'border-signal bg-signal-tint/40 ring-4 ring-signal/10'
                  : 'border-hairline bg-raised hover:border-hairline-strong'
              }`}
            >
              {selected && (
                <span className="absolute end-2.5 top-2.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-signal text-on-signal">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
              {option.recommended && !selected && (
                <span className="absolute end-2 top-2 rounded-full bg-signal-tint px-1.5 py-0.5 text-[10px] font-semibold text-signal">
                  {t('shortcut.recommended', 'Recommended')}
                </span>
              )}
              <ShortcutKeys
                accelerator={option.value}
                size="md"
                pressed={saving === option.value}
              />
              <span className="block">
                <span className="block text-[13px] font-medium text-ink">{option.title}</span>
                <span className="mt-0.5 block text-[11.5px] text-ink-muted">{option.hint}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
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
        <p role="alert" className="mt-3 flex items-center gap-2 text-[12.5px] text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error === 'unsupported-shortcut'
            ? t('shortcut.unsupported', "That key can't be used as a shortcut. Try another one.")
            : t('shortcut.saveFailed', "Couldn't save the shortcut. Please try again.")}
        </p>
      )}
    </div>
  )
}
