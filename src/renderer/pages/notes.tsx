import { useState, useEffect, useCallback, useRef, useId } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Mic,
  Trash2,
  Copy,
  Plus,
  Square,
  Check,
  Pencil,
  X,
  RotateCcw,
  AlertCircle
} from 'lucide-react'
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

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-sky-accent/60'

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

    setIsRecording(false)
    let blob: Blob | null = null
    try {
      blob = await stopRecording()
    } catch (err) {
      setRecordingError({ message: errorMessage(err), canRetry: false })
      return
    }
    if (!blob) return

    const durationSeconds = (Date.now() - recordingStartRef.current) / 1000
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
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-theme-border border-t-sky-accent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="drag-region mb-6">
        <h1 className="text-2xl font-bold text-theme-text">{t('notes.title')}</h1>
        <p className="text-sm text-theme-text-secondary mt-1">{t('notes.subtitle')}</p>
      </div>

      {/* Record Button */}
      <div className="mb-6">
        {isRecording ? (
          <div className="flex items-center gap-3 p-4 bg-recording-red/10 rounded-xl border border-recording-red/20">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-10 h-10 rounded-full bg-recording-red flex items-center justify-center animate-pulse">
                <Mic className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-theme-text">
                  {t('notes.recording', 'Recording...')}
                </p>
                <div className="h-6 flex items-center">
                  <WaveformBars
                    data={
                      audioState.waveformData.length
                        ? audioState.waveformData
                        : [0.3, 0.5, 0.7, 0.8, 0.7, 0.5, 0.3]
                    }
                    barCount={7}
                    barWidth={3}
                    maxHeight={16}
                    color="#F04545"
                    animated={true}
                  />
                </div>
              </div>
            </div>
            <button
              onClick={handleCancelRecording}
              aria-label={t('notes.discardRecording', 'Discard recording')}
              title={t('notes.discardRecording', 'Discard recording')}
              className={`w-10 h-10 rounded-full bg-theme-surface/60 hover:bg-theme-surface flex items-center justify-center text-theme-text-secondary transition-colors ${FOCUS_RING}`}
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={handleStopRecording}
              aria-label={t('notes.stopRecording', 'Stop recording and transcribe')}
              title={t('notes.stopRecording', 'Stop recording and transcribe')}
              className={`w-10 h-10 rounded-full bg-recording-red hover:bg-red-500 flex items-center justify-center transition-colors ${FOCUS_RING}`}
            >
              <Square className="w-4 h-4 text-white fill-white" />
            </button>
          </div>
        ) : isTranscribing ? (
          <div
            role="status"
            className="flex items-center gap-3 p-4 bg-theme-surface/50 rounded-xl border border-theme-border/30"
          >
            <div className="w-10 h-10 rounded-full bg-theme-surface flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-theme-text-muted border-t-sky-accent rounded-full animate-spin" />
            </div>
            <p className="text-sm text-theme-text-secondary">
              {t('notes.transcribing', 'Transcribing...')}
            </p>
          </div>
        ) : (
          <button
            onClick={handleStartRecording}
            className={`w-full flex items-center gap-3 p-4 bg-theme-card rounded-xl border border-theme-border/30 hover:border-recording-red/30 hover:bg-recording-red/5 transition-all group ${FOCUS_RING}`}
          >
            <div className="w-10 h-10 rounded-full bg-recording-red/10 group-hover:bg-recording-red/20 flex items-center justify-center transition-colors">
              <Mic className="w-5 h-5 text-recording-red" />
            </div>
            <div className="flex-1 text-start">
              <p className="text-sm font-medium text-theme-text">
                {t('notes.recordNote', 'Record a voice note')}
              </p>
              <p className="text-xs text-theme-text-muted">
                {t('notes.recordHint', 'Tap to start recording')}
              </p>
            </div>
            <Plus className="w-5 h-5 text-theme-text-muted group-hover:text-recording-red transition-colors" />
          </button>
        )}

        {/* Recording / transcription error */}
        {recordingError && !isRecording && !isTranscribing && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-3 p-3 rounded-xl border border-recording-red/30 bg-recording-red/5"
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
                <button
                  onClick={handleRetry}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-sky-accent/10 text-sky-accent hover:bg-sky-accent/20 transition-all ${FOCUS_RING}`}
                >
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
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-theme-text-muted hover:text-theme-text hover:bg-theme-surface/50 transition-all ${FOCUS_RING}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notes List */}
      <div>
        {notes.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-xl bg-theme-surface/50 flex items-center justify-center mx-auto mb-3">
              <Mic className="w-6 h-6 text-theme-text-muted" />
            </div>
            <p className="text-sm text-theme-text-muted">{t('notes.noNotes')}</p>
            <p className="text-xs text-theme-text-muted mt-1">{t('notes.noNotesHint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notes.map((note) =>
              editingId === note.id ? (
                <div
                  key={note.id}
                  className="p-4 bg-theme-card rounded-xl border border-sky-accent/30 space-y-3"
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
                    className="w-full bg-theme-surface/50 rounded-lg px-3 py-2 text-sm font-medium text-theme-text placeholder-theme-text-muted outline-none focus-visible:ring-1 focus-visible:ring-sky-accent/40"
                  />
                  <textarea
                    autoFocus
                    value={draft.text}
                    onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                    aria-label={t('notes.textLabel', 'Note text')}
                    aria-invalid={!draft.text.trim()}
                    aria-describedby={!draft.text.trim() ? errorId : undefined}
                    className="w-full bg-theme-surface/50 rounded-lg px-3 py-2 text-sm text-theme-text placeholder-theme-text-muted outline-none resize-y min-h-[6rem] leading-relaxed focus-visible:ring-1 focus-visible:ring-sky-accent/40"
                  />
                  {!draft.text.trim() && (
                    <p id={errorId} className="text-xs text-recording-red">
                      {t('notes.textRequired', 'Note text cannot be empty')}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={saveEditing}
                      disabled={!draft.text.trim()}
                      className={`btn-primary disabled:opacity-30 ${FOCUS_RING}`}
                    >
                      {t('common.save', 'Save')}
                    </button>
                    <button
                      onClick={cancelEditing}
                      className={`px-3 py-2 bg-theme-surface/30 rounded-lg text-sm text-theme-text-secondary ${FOCUS_RING}`}
                    >
                      {t('recording.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={note.id}
                  className="p-4 bg-theme-card rounded-xl border border-theme-border/30 group hover:border-theme-border/50 transition-all"
                >
                  <div className="flex items-start gap-3">
                    {note.isVoice && (
                      <div className="w-8 h-8 rounded-lg bg-recording-red/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Mic className="w-4 h-4 text-recording-red" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {note.title && (
                        <p className="text-sm font-semibold text-theme-text mb-1 break-words">
                          {note.title}
                        </p>
                      )}
                      <p className="text-sm text-theme-text leading-relaxed whitespace-pre-wrap break-words">
                        {note.text}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-theme-text-muted">
                          {formatDate(note.createdAt)}
                        </span>
                        {!!note.durationSeconds && (
                          <span className="text-xs text-theme-text-muted px-1.5 py-0.5 bg-theme-surface/50 rounded">
                            {formatNoteDuration(note.durationSeconds)}
                          </span>
                        )}
                        {note.updatedAt && (
                          <span className="text-xs text-theme-text-muted">
                            {t('notes.edited', '(edited)')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                      <button
                        onClick={() => copyNote(note.text, note.id)}
                        aria-label={t('notes.copyNote', 'Copy note')}
                        title={t('notes.copyNote', 'Copy note')}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-theme-text-muted hover:text-theme-text hover:bg-theme-surface/50 transition-all ${FOCUS_RING}`}
                      >
                        {copiedId === note.id ? (
                          <Check className="w-3.5 h-3.5 text-green-accent" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => startEditing(note)}
                        aria-label={t('notes.editNote', 'Edit note')}
                        title={t('notes.editNote', 'Edit note')}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-theme-text-muted hover:text-theme-text hover:bg-theme-surface/50 transition-all ${FOCUS_RING}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteNote(note)}
                        aria-label={t('notes.deleteNote', 'Delete note')}
                        title={t('notes.deleteNote', 'Delete note')}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-theme-text-muted hover:text-recording-red hover:bg-recording-red/10 transition-all ${FOCUS_RING}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
    </div>
  )
}
