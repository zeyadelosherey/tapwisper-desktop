import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, TriangleAlert } from 'lucide-react'
import type { FnKeyUsage } from '../../shared/fn-key'
import { IS_MAC, sameShortcut } from '../utils/shortcuts'
import { Spinner } from './ui/primitives'

/** Re-check while the notice is up, so a change made in System Settings shows */
const POLL_MS = 3000

/**
 * What the macOS fn/Globe key does on its own, while fn is the record
 * shortcut ('nothing' otherwise). Polls until it is "Do Nothing".
 */
export function useFnKeyUsage(shortcut: string): FnKeyUsage {
  const watch = IS_MAC && sameShortcut(shortcut, 'Fn')
  const [usage, setUsage] = useState<FnKeyUsage>('nothing')

  useEffect(() => {
    if (!watch) {
      setUsage('nothing')
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const check = (): void => {
      window.tapwisper.shortcuts
        .fnKeyUsage()
        .then((next) => {
          if (cancelled) return
          setUsage(next)
          if (next !== 'nothing') timer = setTimeout(check, POLL_MS)
        })
        .catch(() => {})
    }
    check()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [watch])

  return usage
}

/**
 * Warns that holding fn also switches the keyboard language (or opens emoji /
 * Apple Dictation), with a one-click fix. Renders nothing when fn isn't the
 * record shortcut or the Globe key already does nothing.
 */
export function FnKeyNotice({
  shortcut,
  className = ''
}: {
  shortcut: string
  className?: string
}): JSX.Element | null {
  const { t } = useTranslation()
  const usage = useFnKeyUsage(shortcut)
  const [fixing, setFixing] = useState(false)
  const [fixed, setFixed] = useState(false)

  const fix = useCallback(async () => {
    setFixing(true)
    try {
      const next = await window.tapwisper.shortcuts.fnKeyDoNothing()
      if (next === 'nothing') setFixed(true)
    } finally {
      setFixing(false)
    }
  }, [])

  if (usage === 'nothing') {
    if (!fixed) return null
    return (
      <p
        role="status"
        className={`flex items-center gap-1.5 text-[12.5px] text-success ${className}`}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        {t('fnKey.fixed', 'Done — the 🌐 key now only dictates.')}
      </p>
    )
  }

  const action =
    usage === 'emoji'
      ? t('fnKey.actionEmoji', 'opens the emoji picker')
      : usage === 'dictation'
        ? t('fnKey.actionDictation', 'starts Apple Dictation')
        : t('fnKey.actionInputSource', 'switches your keyboard language')

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-tint px-3.5 py-3 ${className}`}
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink">
          {t('fnKey.title', 'Your 🌐 key also {{action}}', { action })}
        </p>
        <p className="mt-0.5 text-[12px] leading-snug text-ink-muted text-pretty">
          {t(
            'fnKey.body',
            'Set “Press 🌐 key to” to Do Nothing so holding fn only dictates. If Keyboard settings opens, check that it says Do Nothing.'
          )}
        </p>
      </div>
      <button
        type="button"
        className="btn-secondary btn-sm shrink-0"
        onClick={() => void fix()}
        disabled={fixing}
      >
        {fixing && <Spinner className="h-3 w-3" />}
        {t('fnKey.fix', 'Fix it')}
      </button>
    </div>
  )
}
