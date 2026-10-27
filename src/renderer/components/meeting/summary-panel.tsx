import { memo, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Pencil, RefreshCw, Sparkles } from 'lucide-react'
import type { Meeting } from '../../models/meeting'
import { MIN_WORDS_FOR_AUTO_SUMMARY, summarizeMeeting } from '../../services/meetings'
import { copyText, meetingAIErrorMessage } from '../../utils/meeting'
import { Callout, Spinner } from '../ui/primitives'
import { SummaryMarkdown, toggleTaskLine } from './summary-markdown'

interface SummaryPanelProps {
  meeting: Meeting
  /** The meeting is still being recorded (summaries are written after Stop) */
  live?: boolean
  /** Smaller paddings for the notepad */
  dense?: boolean
}

/** AI summary of a meeting: read, tick off tasks, edit, copy, (re)generate */
export const SummaryPanel = memo(function SummaryPanel({
  meeting,
  live = false,
  dense = false
}: SummaryPanelProps): JSX.Element {
  const { t } = useTranslation()
  const [requested, setRequested] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const editorId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const summarizing = meeting.status === 'processing' || requested
  const summary = meeting.summary.trim()

  // A different meeting resets the panel
  useEffect(() => {
    setEditing(false)
    setError(null)
    setRequested(false)
  }, [meeting.id])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    const el = textareaRef.current
    if (!editing || !el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(160, el.scrollHeight + 2)}px`
  }, [editing, draft])

  const generate = async (): Promise<void> => {
    setError(null)
    setEditing(false)
    setRequested(true)
    try {
      await summarizeMeeting(meeting.id)
    } catch (err) {
      setError(meetingAIErrorMessage(t, err))
    } finally {
      setRequested(false)
    }
  }

  const startEdit = (): void => {
    setDraft(meeting.summary)
    setEditing(true)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const saveEdit = (): void => {
    setEditing(false)
    if (draft !== meeting.summary) {
      void window.tapwisper.meetings.update(meeting.id, { summary: draft.trim() })
    }
  }

  const toggleTask = (line: number): void => {
    void window.tapwisper.meetings.update(meeting.id, {
      summary: toggleTaskLine(meeting.summary, line)
    })
  }

  const copy = async (): Promise<void> => {
    await copyText(summary)
    setCopied(true)
  }

  const pad = dense ? 'px-3.5 py-3' : 'py-1'

  // ── Writing the summary ──────────────────────────────────────
  if (summarizing && !summary) {
    return (
      <div className={pad} role="status" aria-live="polite">
        <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink-muted">
          <Spinner className="h-3.5 w-3.5 text-signal" />
          {t('notepad.summarizing', 'Summarizing…')}
        </p>
        <div className="mt-3 space-y-2" aria-hidden="true">
          {[92, 74, 84, 58, 70].map((w, i) => (
            <div
              key={i}
              className="h-2.5 animate-breathe rounded-full bg-sunken"
              style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      </div>
    )
  }

  // ── No summary yet ───────────────────────────────────────────
  if (!summary && !editing) {
    const hint = live
      ? t('notepad.summaryLive', 'Your summary is written when you stop recording.')
      : meeting.status === 'interrupted'
        ? t(
            'notepad.summaryInterrupted',
            'The recording was interrupted. You can still summarize what was captured.'
          )
        : meeting.wordCount < MIN_WORDS_FOR_AUTO_SUMMARY
          ? t(
              'notepad.summaryShort',
              'This meeting was short, so no summary was written automatically.'
            )
          : t('notepad.summaryNone', 'No summary yet.')
    return (
      <div className={pad}>
        <div className="flex flex-col items-center rounded-xl border border-dashed border-hairline-strong px-4 py-5 text-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-signal-tint text-signal">
            <Sparkles className="h-4 w-4" />
          </span>
          <p className="mt-2 max-w-[300px] text-[12.5px] leading-snug text-ink-muted text-pretty">
            {hint}
          </p>
          {!live && (
            <div className="mt-3 flex gap-1.5">
              <button type="button" className="btn-signal btn-sm" onClick={generate}>
                <Sparkles className="h-3.5 w-3.5" />
                {t('notepad.generateSummary', 'Generate summary')}
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={startEdit}>
                <Pencil className="h-3.5 w-3.5" />
                {t('notepad.writeSummary', 'Write one')}
              </button>
            </div>
          )}
        </div>
        {error && (
          <div className="mt-2">
            <Callout tone="danger">{error}</Callout>
          </div>
        )}
      </div>
    )
  }

  // ── Summary ──────────────────────────────────────────────────
  return (
    <div className={pad}>
      <div className="mb-1 flex items-center justify-end gap-0.5">
        {summarizing ? (
          <p
            className="flex min-w-0 flex-1 items-center gap-1.5 text-[11.5px] font-medium text-ink-muted"
            role="status"
          >
            <Spinner className="h-3 w-3 text-signal" />
            {t('notepad.summarizing', 'Summarizing…')}
          </p>
        ) : (
          <p className={editing ? 'section-label min-w-0 flex-1 truncate' : 'sr-only'}>
            {editing
              ? t('notepad.editingSummary', 'Editing summary')
              : t('notepad.aiSummary', 'AI summary')}
          </p>
        )}
        {editing ? (
          <>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(false)}>
              {t('common.cancel', 'Cancel')}
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={saveEdit}>
              <Check className="h-3.5 w-3.5" />
              {t('common.save', 'Save')}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="icon-btn"
              onClick={copy}
              disabled={summarizing}
              aria-label={t('notepad.copySummary', 'Copy summary')}
              title={t('notepad.copySummary', 'Copy summary')}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={startEdit}
              disabled={summarizing}
              aria-label={t('notepad.editSummary', 'Edit summary')}
              title={t('notepad.editSummary', 'Edit summary')}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {!live && (
              <button
                type="button"
                className="icon-btn"
                onClick={generate}
                disabled={summarizing}
                aria-label={t('notepad.regenerate', 'Regenerate')}
                title={t('notepad.regenerate', 'Regenerate')}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${summarizing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="mb-2">
          <Callout tone="danger">{error}</Callout>
        </div>
      )}

      {editing ? (
        <>
          <label htmlFor={editorId} className="sr-only">
            {t('notepad.editSummary', 'Edit summary')}
          </label>
          <textarea
            id={editorId}
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                setEditing(false)
              } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                saveEdit()
              }
            }}
            dir="auto"
            spellCheck
            className="field resize-none font-mono text-[12px] leading-relaxed"
          />
          <p className="mt-1 text-[11px] text-ink-faint">
            {t('notepad.markdownHint', 'Markdown: ## heading, - bullet, - [ ] task')}
          </p>
        </>
      ) : (
        <SummaryMarkdown
          text={meeting.summary}
          onToggleTask={summarizing ? undefined : toggleTask}
          taskLabel={(text, done) =>
            done
              ? t('notepad.taskDone', 'Done: {{task}}', { task: text })
              : t('notepad.taskOpen', 'To do: {{task}}', { task: text })
          }
          className={summarizing ? 'opacity-50' : ''}
        />
      )}
    </div>
  )
})
