import { memo, useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'

interface NotesEditorProps {
  meetingId: string
  /** Stored notes; adopted when not editing */
  notes: string
  /** Fill the available height (notepad) instead of growing with the text */
  fill?: boolean
  autoFocus?: boolean
}

const SAVE_DELAY_MS = 600

/**
 * "My notes": a plain textarea that saves itself (debounced). Memoized so the
 * recorder's 100 ms ticks never reach it; typing only re-renders this.
 */
export const NotesEditor = memo(function NotesEditor({
  meetingId,
  notes,
  fill = false,
  autoFocus = false
}: NotesEditorProps): JSX.Element {
  const { t } = useTranslation()
  const id = useId()
  const hintId = useId()
  const [value, setValue] = useState(notes)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle')
  const pendingRef = useRef<{ id: string; notes: string } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    const pending = pendingRef.current
    pendingRef.current = null
    if (!pending) return
    window.tapwisper.meetings
      .update(pending.id, { notes: pending.notes })
      .then(() => setSaved('saved'))
      .catch(() => setSaved('idle'))
  }, [])

  // Another meeting: save what's pending for the previous one, then switch
  useEffect(() => {
    setValue(notes)
    setSaved('idle')
    return flush
  }, [meetingId, flush]) // `notes` deliberately left out: adopted below

  // Adopt changes made elsewhere (another window) unless the user is typing here
  useEffect(() => {
    if (pendingRef.current) return
    if (document.activeElement === textareaRef.current) return
    setValue(notes)
  }, [notes])

  useEffect(() => {
    if (saved !== 'saved') return
    const timer = setTimeout(() => setSaved('idle'), 1500)
    return () => clearTimeout(timer)
  }, [saved])

  // Grow with the text when not filling a fixed area
  useEffect(() => {
    const el = textareaRef.current
    if (fill || !el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(140, el.scrollHeight + 2)}px`
  }, [value, fill])

  const onChange = (next: string): void => {
    setValue(next)
    setSaved('saving')
    pendingRef.current = { id: meetingId, notes: next }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, SAVE_DELAY_MS)
  }

  return (
    <div className={`relative ${fill ? 'h-full' : ''}`}>
      <label htmlFor={id} className="sr-only">
        {t('notepad.tabNotes', 'My notes')}
      </label>
      <textarea
        id={id}
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={flush}
        autoFocus={autoFocus}
        dir={value ? 'auto' : undefined}
        spellCheck
        aria-describedby={hintId}
        placeholder={t(
          'notepad.notesPlaceholder',
          'Jot down what matters — decisions, names, follow-ups. Your notes shape the summary.'
        )}
        className={`block w-full resize-none bg-transparent text-[13px] leading-relaxed text-ink outline-none focus-visible:outline-none ${
          fill
            ? 'h-full px-3.5 py-3'
            : 'rounded-xl border border-hairline px-3 py-2.5 focus:border-signal focus:ring-4 focus:ring-signal/15'
        }`}
      />
      <p
        id={hintId}
        aria-live="polite"
        className={`pointer-events-none absolute bottom-2 end-3 flex items-center gap-1 text-[11px] text-ink-faint transition-opacity duration-300 ${
          saved === 'idle' ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {saved === 'saved' && <Check className="h-3 w-3 text-success" />}
        {saved === 'saving'
          ? t('notepad.saving', 'Saving…')
          : saved === 'saved'
            ? t('notepad.saved', 'Saved')
            : ''}
      </p>
    </div>
  )
})
