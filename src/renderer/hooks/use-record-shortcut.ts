import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_RECORD_SHORTCUT } from '../utils/shortcuts'

/** Same-window notification so every view showing the shortcut updates after a save */
const CHANGED_EVENT = 'tapwisper:record-shortcut-changed'

export type ShortcutSaveError = 'unsupported-shortcut' | 'save-failed'

interface RecordShortcutState {
  /** Current record shortcut accelerator, e.g. "Option+Space" or "RightOption" */
  shortcut: string
  loaded: boolean
  /** Save a new shortcut; resolves to an error code, or null on success */
  save: (accelerator: string) => Promise<ShortcutSaveError | null>
}

/** The configured record shortcut, kept in sync with saves from this hook */
export function useRecordShortcut(): RecordShortcutState {
  const [shortcut, setShortcut] = useState(DEFAULT_RECORD_SHORTCUT)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.resolve(window.tapwisper.shortcuts.get())
      .then((value: unknown) => {
        const record = (value as { record?: unknown } | undefined)?.record
        if (!cancelled && typeof record === 'string' && record.trim()) setShortcut(record)
      })
      .catch(() => {
        // Keep the default
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    const onChanged = (e: Event): void => {
      const detail = (e as CustomEvent<string>).detail
      if (typeof detail === 'string' && detail) setShortcut(detail)
    }
    window.addEventListener(CHANGED_EVENT, onChanged)
    return () => {
      cancelled = true
      window.removeEventListener(CHANGED_EVENT, onChanged)
    }
  }, [])

  const save = useCallback(async (accelerator: string): Promise<ShortcutSaveError | null> => {
    try {
      const result = await window.tapwisper.shortcuts.update({ record: accelerator })
      if (result && result.success === false) {
        return result.error === 'unsupported-shortcut' ? 'unsupported-shortcut' : 'save-failed'
      }
      setShortcut(accelerator)
      window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: accelerator }))
      return null
    } catch {
      return 'save-failed'
    }
  }, [])

  return { shortcut, loaded, save }
}

/** True while the record shortcut is physically held (reported by the main process) */
export function useShortcutPressed(): boolean {
  const [pressed, setPressed] = useState(false)
  useEffect(() => {
    return window.tapwisper.on('shortcut:state', (value: unknown) => setPressed(value === true))
  }, [])
  return pressed
}
