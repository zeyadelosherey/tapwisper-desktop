import { memo, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUp, History, MessageSquareText, X } from 'lucide-react'
import type { AssistantItem } from '../../hooks/use-meeting-assistant'
import { RECAP_MINUTES } from '../../hooks/use-meeting-assistant'
import { Spinner } from '../ui/primitives'
import { SummaryMarkdown } from './summary-markdown'

/** Recap and Q&A cards, newest last */
export const AssistantThread = memo(function AssistantThread({
  items,
  onDismiss,
  onClear,
  className = ''
}: {
  items: AssistantItem[]
  onDismiss: (id: string) => void
  onClear?: () => void
  className?: string
}): JSX.Element | null {
  const { t } = useTranslation()
  const endRef = useRef<HTMLDivElement>(null)

  // Follow new cards and answers as they arrive
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [items])

  if (items.length === 0) return null

  return (
    <div className={`space-y-1.5 ${className}`} aria-live="polite">
      {onClear && items.length > 1 && (
        <div className="flex justify-end">
          <button
            type="button"
            className="text-[11px] text-ink-soft hover:text-ink"
            onClick={onClear}
          >
            {t('notepad.clearAnswers', 'Clear')}
          </button>
        </div>
      )}
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-xl border border-hairline bg-panel px-3 py-2"
          aria-busy={item.pending}
        >
          <header className="flex items-start gap-2">
            <span className="mt-px shrink-0 text-signal">
              {item.kind === 'recap' ? (
                <History className="h-3.5 w-3.5" />
              ) : (
                <MessageSquareText className="h-3.5 w-3.5" />
              )}
            </span>
            <p className="min-w-0 flex-1 text-[12px] font-semibold text-ink" dir="auto">
              {item.kind === 'recap'
                ? t('notepad.recapTitle', 'Last {{minutes}} minutes', { minutes: RECAP_MINUTES })
                : item.question}
            </p>
            <button
              type="button"
              className="icon-btn -me-1.5 -mt-1 h-6 w-6"
              onClick={() => onDismiss(item.id)}
              aria-label={t('common.dismiss', 'Dismiss')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </header>
          <div className="mt-1 ps-[22px]">
            {item.pending ? (
              <p className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                <Spinner className="h-3 w-3 text-signal" />
                {item.kind === 'recap'
                  ? t('notepad.recapLoading', 'Catching you up…')
                  : t('notepad.thinking', 'Thinking…')}
              </p>
            ) : item.error ? (
              <p className="text-[12px] text-danger">{item.error}</p>
            ) : (
              <SummaryMarkdown text={item.answer} className="!space-y-1 !text-[12.5px]" />
            )}
          </div>
        </article>
      ))}
      <div ref={endRef} />
    </div>
  )
})

/** "Ask about this meeting" input */
export const AskInput = memo(function AskInput({
  onAsk,
  busy,
  disabled,
  className = ''
}: {
  onAsk: (question: string) => void
  busy: boolean
  disabled?: boolean
  className?: string
}): JSX.Element {
  const { t } = useTranslation()
  const [question, setQuestion] = useState('')
  const canSend = !!question.trim() && !busy && !disabled

  return (
    <form
      className={`relative ${className}`}
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSend) return
        onAsk(question)
        setQuestion('')
      }}
    >
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder={t('notepad.askPlaceholder', 'Ask about this meeting…')}
        aria-label={t('notepad.askLabel', 'Ask about this meeting')}
        disabled={disabled}
        dir={question ? 'auto' : undefined}
        className="field h-8 pe-9 text-[12.5px]"
      />
      <button
        type="submit"
        disabled={!canSend}
        aria-label={t('notepad.askSend', 'Ask')}
        className="absolute end-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md bg-signal text-on-signal transition-opacity duration-200 disabled:bg-sunken disabled:text-ink-faint"
      >
        {busy ? <Spinner className="h-3 w-3" /> : <ArrowUp className="h-3.5 w-3.5" />}
      </button>
    </form>
  )
})
