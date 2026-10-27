import { useState, useEffect, useCallback, useRef, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, Trash2, Copy, Square, Check, Pencil, X, RotateCcw, AlertCircle } from 'lucide-react'
import { Page, PageHeader, Spinner } from '../components/ui/primitives'
import { useAudio } from '../hooks/use-audio'
import { transcribeAudio } from '../services/ai-router'
import { WaveformBars } from '../components/waveform-bars'
import { useConfirmDialog } from '../components/confirm-dialog'
import { formatDurationDetailed } from '../utils/formatting'
import { Note, formatLocaleDate } from '../models/note'

interface PendingTranscription {
  blob: Blob
  durationSeconds: number
}

interface NoteDraft {
  title: string
  text: string
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function Notes(): JSX.Element {
  const { t, i18n } = useTranslation()
  const { confirm, dialog } = useConfirmDialog()
  const [notes, setNotes] = useState<Note[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [recordingError, setRecordingError] = useState<{
    message: string
    canRetry: boolean
  } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<NoteDraft>({ title: '', text: '' })
  const recordingStartRef = useRef<number>(0)
  // Latest notes, so async flows (transcription) never write back a stale list
  const notesRef = useRef<Note[]>([])
  // Audio from a failed transcription, kept so Retry can re-transcribe it
  const failedTranscriptionRef = useRef<PendingTranscription | null>(null)
  const errorId = useId()

  const { startRecording, stopRecording, cancelRecording, state: audioState } = useAudio()

  // Load notes on mount
  useEffect(() => {
    window.tapwisper.store.get('notes').then((storedNotes) => {
      if (storedNotes && Array.isArray(storedNotes)) {
        notesRef.current = storedNotes as Note[]
        setNotes(storedNotes as Note[])
      }
      setIsLoaded(true)
    })
  }, [])

  // Save notes when they change
  const saveNotes = useCallback((newNotes: Note[]) => {
    notesRef.current = newNotes
    setNotes(newNotes)
    window.tapwisper.store.set('notes', newNotes)
  }, [])

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) return t('notes.today', 'Today')
    if (date.toDateString() === yesterday.toDateString()) return t('notes.yesterday', 'Yesterday')
    return formatLocaleDate(date, i18n.language, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    })
  }

  const formatNoteDuration = formatDurationDetailed

  const deleteNote = async (note: Note): Promise<void> => {
    const ok = await confirm({
      title: t('notes.deleteTitle', 'Delete note?'),
      message: t('notes.deleteMessage', 'This note will be permanently removed.')
    })
    if (!ok) return
    saveNotes(notesRef.current.filter((n) => n.id !== note.id))
    if (editingId === note.id) setEditingId(null)
  }

  const copyNote = async (text: string, id: string): Promise<void> => {
    try {
      await window.tapwisper.clipboard.write(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Clipboard failed
    }
  }

  const startEditing = (note: Note): void => {
    setDraft({ title: note.title ?? '', text: note.text })
    setEditingId(note.id)
  }

  const cancelEditing = (): void => {
    setEditingId(null)
  }

  const saveEditing = (): void => {
    if (!editingId || !draft.text.trim()) return
    const title = draft.title.trim()
    saveNotes(
      notesRef.current.map((n) =>
        n.id === editingId
          ? {
              ...n,
              title: title || undefined,
              text: draft.text.trim(),
              updatedAt: new Date().toISOString()
            }
          : n
      )
    )
    setEditingId(null)
  }

  /**
   * Transcribe a recording and add it as a note. On failure the audio is kept
   * so the user can retry instead of losing the recording.
   */
  const transcribeAndSave = useCallback(
    async (pending: PendingTranscription) => {
      setIsTranscribing(true)
      setRecordingError(null)
      try {
        // The router resolves the user's configured speech language itself
        const result = await transcribeAudio(pending.blob)
        const transcription = result.text?.trim()
        failedTranscriptionRef.current = null

        if (transcription) {
          const newNote: Note = {
            id: generateId(),
            text: transcription,
            createdAt: new Date().toISOString(),
            isVoice: true,
            durationSeconds: pending.durationSeconds
          }
          saveNotes([newNote, ...notesRef.current])
        } else {
          setRecordingError({
            message: t('notes.noSpeech', 'No speech was detected in the recording.'),
            canRetry: false
          })
        }
      } catch (err) {
        failedTranscriptionRef.current = pending
        setRecordingError({ message: errorMessage(err), canRetry: true })
      } finally {
        setIsTranscribing(false)
      }
    },
    [saveNotes, t]
  )

  // Start voice recording
  const handleStartRecording = useCallback(async () => {
    setRecordingError(null)
    try {
      recordingStartRef.current = Date.now()
      setIsRecording(true)
      await startRecording()
    } catch (err) {
      setIsRecording(false)
      setRecordingError({
        message: t('notes.recordingFailed', 'Could not start recording: {{error}}', {
          error: errorMessage(err)
        }),
        canRetry: false
      })
    }
  }, [startRecording, t])

  // Stop recording and transcribe
  const handleStopRecording = useCallback(async () => {
    if (!isRecording) return

    const durationSeconds = (Date.now() - recordingStartRef.current) / 1000
    setIsRecording(false)
    // Show the busy state right away so Record can't be pressed mid-stop
    setIsTranscribing(true)
    let blob: Blob | null = null
    try {
      blob = await stopRecording()
    } catch (err) {
      setIsTranscribing(false)
      setRecordingError({ message: errorMessage(err), canRetry: false })
      return
    }
    if (!blob) {
      setIsTranscribing(false)
      return
    }

    await transcribeAndSave({ blob, durationSeconds })
  }, [isRecording, stopRecording, transcribeAndSave])

  // Cancel recording
  const handleCancelRecording = useCallback(() => {
    cancelRecording()
    setIsRecording(false)
  }, [cancelRecording])

  const handleRetry = useCallback(() => {
    const pending = failedTranscriptionRef.current
    if (pending) transcribeAndSave(pending)
  }, [transcribeAndSave])

  const dismissError = useCallback(() => {
    failedTranscriptionRef.current = null
    setRecordingError(null)
  }, [])

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center text-ink-faint">
        <Spinner className="h-5 w-5" />
      </div>
    )
  }

  return (
    <Page>
      <PageHeader
        title={t('notes.title')}
        actions={
          !isRecording && !isTranscribing ? (
            <button type="button" onClick={handleStartRecording} className="btn-signal">
              <Mic className="h-4 w-4" />
              {t('notes.recordNote', 'Record a voice note')}
            </button>
          ) : undefined
        }
      />

      {/* Recording / transcribing */}
      <div className="mb-4">
        {isRecording ? (
          <div className="flex items-center gap-3 border-y border-hairline/70 py-2">
            <div className="flex flex-1 items-center gap-3">
              <span className="ember-dot" aria-hidden="true" />
              <p className="text-[13px] text-ink">{t('notes.recording', 'Recording...')}</p>
              <div className="flex h-6 items-center">
                <WaveformBars
                  data={
                    audioState.waveformData.length
                      ? audioState.waveformData
                      : [0.3, 0.5, 0.7, 0.8, 0.7, 0.5, 0.3]
                  }
                  barCount={7}
                  barWidth={3}
                  maxHeight={16}
                  color="rgb(var(--signal))"
                  animated={true}
                />
              </div>
            </div>
            <button
              onClick={handleCancelRecording}
              aria-label={t('notes.discardRecording', 'Discard recording')}
              title={t('notes.discardRecording', 'Discard recording')}
              className="icon-btn"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={handleStopRecording}
              aria-label={t('notes.stopRecording', 'Stop recording and transcribe')}
              title={t('notes.stopRecording', 'Stop recording and transcribe')}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-raised transition-colors duration-200 hover:bg-ink/85"
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
          </div>
        ) : isTranscribing ? (
          <div
            role="status"
            className="flex items-center gap-2 border-y border-hairline/70 py-2.5 text-[13px] text-ink-muted"
          >
            <Spinner className="h-3.5 w-3.5 text-signal" />
            {t('notes.transcribing', 'Transcribing...')}
          </div>
        ) : null}

        {/* Recording / transcription error */}
        {recordingError && !isRecording && !isTranscribing && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger-tint px-4 py-3"
          >
            <AlertCircle
              className="w-4 h-4 text-recording-red shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              {recordingError.canRetry && (
                <p className="text-sm font-medium text-theme-text">
                  {t('notes.transcriptionFailed', 'Transcription failed. Your recording was kept.')}
                </p>
              )}
              <p className="text-xs text-theme-text-secondary mt-0.5 break-words">
                {recordingError.message}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {recordingError.canRetry && (
                <button onClick={handleRetry} className="btn-secondary btn-sm">
                  <RotateCcw className="w-3 h-3" />
                  {t('common.retry', 'Retry')}
                </button>
              )}
              <button
                onClick={dismissError}
                aria-label={
                  recordingError.canRetry
                    ? t('notes.discardRecording', 'Discard recording')
                    : t('common.dismiss', 'Dismiss')
                }
                title={
                  recordingError.canRetry
                    ? t('notes.discardRecording', 'Discard recording')
                    : t('common.dismiss', 'Dismiss')
                }
                className="icon-btn"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notes List */}
      <div>
        {notes.length === 0 ? (
          <div className="grain-hero flex flex-col items-center rounded-2xl px-5 pb-10 pt-12 text-center">
            <p className="font-display text-[17px] text-ink">{t('notes.noNotes')}</p>
            <p className="mt-1 text-[13px] text-ink-muted">{t('notes.noNotesHint')}</p>
          </div>
        ) : (
          <div className="divide-y divide-hairline/70 border-t border-hairline/70">
            {notes.map((note) =>
              editingId === note.id ? (
                <div
                  key={note.id}
                  className="space-y-3 py-3"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      cancelEditing()
                    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      saveEditing()
                    }
                  }}
                >
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    placeholder={t('notes.titlePlaceholder', 'Title (optional)')}
                    aria-label={t('notes.titleLabel', 'Note title')}
                    dir="auto"
                    className="field font-medium"
                  />
                  <textarea
                    autoFocus
                    value={draft.text}
                    onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                    aria-label={t('notes.textLabel', 'Note text')}
                    aria-invalid={!draft.text.trim()}
                    aria-describedby={!draft.text.trim() ? errorId : undefined}
                    dir="auto"
                    className="field min-h-[6rem] resize-y"
                  />
                  {!draft.text.trim() && (
                    <p id={errorId} className="text-[12.5px] text-danger">
                      {t('notes.textRequired', 'Note text cannot be empty')}
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <button onClick={cancelEditing} className="btn-ghost">
                      {t('common.cancel', 'Cancel')}
                    </button>
                    <button
                      onClick={saveEditing}
                      disabled={!draft.text.trim()}
                      className="btn-primary"
                    >
                      {t('common.save', 'Save')}
                    </button>
                  </div>
                </div>
              ) : (
                <div key={note.id} className="group py-2.5">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {note.title && (
                        <p
                          dir="auto"
                          className="mb-0.5 break-words text-[13.5px] font-medium leading-snug text-ink"
                        >
                          {note.title}
                        </p>
                      )}
                      <p
                        dir="auto"
                        className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink"
                      >
                        {note.text}
                      </p>
                      <p className="mt-1 text-[12px] text-ink-soft">
                        {formatDate(note.createdAt)}
                        {!!note.durationSeconds && ` · ${formatNoteDuration(note.durationSeconds)}`}
                        {note.updatedAt && ` · ${t('notes.edited', '(edited)')}`}
                      </p>
                    </div>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                      <button
                        onClick={() => copyNote(note.text, note.id)}
                        aria-label={t('notes.copyNote', 'Copy note')}
                        title={t('notes.copyNote', 'Copy note')}
                        className="icon-btn"
                      >
                        {copiedId === note.id ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => startEditing(note)}
                        aria-label={t('notes.editNote', 'Edit note')}
                        title={t('notes.editNote', 'Edit note')}
                        className="icon-btn"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteNote(note)}
                        aria-label={t('notes.deleteNote', 'Delete note')}
                        title={t('notes.deleteNote', 'Delete note')}
                        className="icon-btn hover:!text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
      {dialog}
    </Page>
  )
}
