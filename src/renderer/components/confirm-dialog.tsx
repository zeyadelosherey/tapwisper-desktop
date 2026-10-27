import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'

export interface ConfirmDialogOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Styles the confirm button as destructive and focuses Cancel first (default: true) */
  destructive?: boolean
}

interface ConfirmDialogProps extends ConfirmDialogOptions {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Accessible modal confirmation dialog.
 * - role="dialog" + aria-modal, labelled by its title and described by its message
 * - Escape or clicking the backdrop cancels
 * - Focus moves into the dialog (Cancel for destructive actions, Confirm otherwise),
 *   Tab is trapped between the two buttons and focus is restored on close
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = true,
  onConfirm,
  onCancel
}: ConfirmDialogProps): JSX.Element | null {
  const { t } = useTranslation()
  const titleId = useId()
  const messageId = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const target = destructive ? cancelRef.current : confirmRef.current
    target?.focus()
    return () => {
      previouslyFocused?.focus?.()
    }
  }, [open, destructive])

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
      return
    }
    if (e.key === 'Tab') {
      const focusables = [cancelRef.current, confirmRef.current].filter(
        (el): el is HTMLButtonElement => el !== null
      )
      if (focusables.length === 0) return
      const index = focusables.indexOf(document.activeElement as HTMLButtonElement)
      const next = e.shiftKey
        ? (index <= 0 ? focusables.length : index) - 1
        : (index + 1) % focusables.length
      e.preventDefault()
      focusables[next].focus()
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgb(18_17_16/0.38)] p-4 backdrop-blur-[3px] animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        onKeyDown={handleKeyDown}
        className="shadow-pop w-full max-w-[400px] rounded-2xl border border-hairline bg-raised p-6 animate-scale-up"
      >
        <div className="flex items-start gap-4">
          {destructive && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-tint">
              <AlertTriangle className="h-[18px] w-[18px] text-danger" aria-hidden="true" />
            </div>
          )}
          <div className="flex-1 min-w-0 text-start">
            <h2 id={titleId} className="font-display text-[20px] leading-snug text-ink">
              {title}
            </h2>
            {message && (
              <p
                id={messageId}
                className="mt-1.5 break-words text-[13px] leading-relaxed text-ink-muted"
              >
                {message}
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className="btn-secondary">
            {cancelLabel ?? t('common.cancel', 'Cancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={destructive ? 'btn-danger' : 'btn-primary'}
          >
            {confirmLabel ??
              (destructive ? t('common.delete', 'Delete') : t('common.confirm', 'Confirm'))}
          </button>
        </div>
      </div>
    </div>
  )
}

interface PendingConfirm {
  options: ConfirmDialogOptions
  resolve: (confirmed: boolean) => void
}

/**
 * Promise-based helper around ConfirmDialog.
 *
 *   const { confirm, dialog } = useConfirmDialog()
 *   if (await confirm({ title: 'Delete?' })) remove()
 *   ...render {dialog} somewhere in the tree
 */
export function useConfirmDialog(): {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>
  dialog: JSX.Element
} {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const pendingRef = useRef<PendingConfirm | null>(null)

  const settle = useCallback((confirmed: boolean) => {
    const current = pendingRef.current
    pendingRef.current = null
    setPending(null)
    current?.resolve(confirmed)
  }, [])

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    // A new request supersedes any dialog that is still open
    pendingRef.current?.resolve(false)
    return new Promise<boolean>((resolve) => {
      const next = { options, resolve }
      pendingRef.current = next
      setPending(next)
    })
  }, [])

  // Resolve any outstanding promise if the owner unmounts
  useEffect(() => () => pendingRef.current?.resolve(false), [])

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      title={pending?.options.title ?? ''}
      message={pending?.options.message}
      confirmLabel={pending?.options.confirmLabel}
      cancelLabel={pending?.options.cancelLabel}
      destructive={pending?.options.destructive}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  )

  return { confirm, dialog }
}
