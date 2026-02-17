import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, Trash2, Copy, Plus, Square, Check } from 'lucide-react'
import { useAudio } from '../hooks/use-audio'
import { transcribeAudio } from '../services/ai-router'
import { WaveformBars } from '../components/waveform-bars'
import { formatDurationDetailed } from '../utils/formatting'

interface Note {
  id: string
  text: string
  createdAt: string
  isVoice: boolean
  durationSeconds?: number
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function Notes(): JSX.Element {
  const { t } = useTranslation()
  const [notes, setNotes] = useState<Note[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const recordingStartRef = useRef<number>(0)

  const {
    startRecording,
    stopRecording,
    cancelRecording,
    state: audioState
  } = useAudio()

  // Load notes on mount
  useEffect(() => {
    window.tapwisper.store.get('notes').then((storedNotes) => {
      if (storedNotes && Array.isArray(storedNotes)) {
        setNotes(storedNotes as Note[])
      }
      setIsLoaded(true)
    })
  }, [])

  // Save notes when they change
  const saveNotes = useCallback((newNotes: Note[]) => {
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
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatNoteDuration = formatDurationDetailed

  const deleteNote = (id: string) => {
    saveNotes(notes.filter((n) => n.id !== id))
  }

  const copyNote = async (text: string, id: string) => {
    try {
      await window.tapwisper.clipboard.write(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Clipboard failed
    }
  }

  // Start voice recording
  const handleStartRecording = useCallback(async () => {
    try {
      recordingStartRef.current = Date.now()
      setIsRecording(true)
      await startRecording()
    } catch (err) {
      console.error('Failed to start recording:', err)
      setIsRecording(false)
    }
  }, [startRecording])

  // Stop recording and transcribe
  const handleStopRecording = useCallback(async () => {
    if (!isRecording) return

    setIsRecording(false)
    setIsTranscribing(true)

    try {
      const blob = await stopRecording()
      if (!blob) {
        setIsTranscribing(false)
        return
      }

      const durationSeconds = (Date.now() - recordingStartRef.current) / 1000
      const lang = await window.tapwisper.store.get('language') as string | undefined
      const result = await transcribeAudio(blob, lang || 'en')
      const transcription = result.text?.trim()

      if (transcription) {
        const newNote: Note = {
          id: generateId(),
          text: transcription,
          createdAt: new Date().toISOString(),
          isVoice: true,
          durationSeconds
        }
        saveNotes([newNote, ...notes])
      }
    } catch (err) {
      console.error('Transcription failed:', err)
    } finally {
      setIsTranscribing(false)
    }
  }, [isRecording, stopRecording, notes, saveNotes])

  // Cancel recording
  const handleCancelRecording = useCallback(() => {
    cancelRecording()
    setIsRecording(false)
  }, [cancelRecording])

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
                    data={audioState.waveformData.length ? audioState.waveformData : [0.3, 0.5, 0.7, 0.8, 0.7, 0.5, 0.3]}
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
              onClick={handleStopRecording}
              className="w-10 h-10 rounded-full bg-recording-red hover:bg-red-500 flex items-center justify-center transition-colors"
            >
              <Square className="w-4 h-4 text-white fill-white" />
            </button>
          </div>
        ) : isTranscribing ? (
          <div className="flex items-center gap-3 p-4 bg-theme-surface/50 rounded-xl border border-theme-border/30">
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
            className="w-full flex items-center gap-3 p-4 bg-theme-card rounded-xl border border-theme-border/30 hover:border-recording-red/30 hover:bg-recording-red/5 transition-all group"
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
      </div>

      {/* Notes List */}
      <div>
        {notes.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-xl bg-theme-surface/50 flex items-center justify-center mx-auto mb-3">
              <Mic className="w-6 h-6 text-theme-text-muted" />
            </div>
            <p className="text-sm text-theme-text-muted">{t('notes.noNotes')}</p>
            <p className="text-xs text-theme-text-muted mt-1">
              {t('notes.noNotesHint')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => (
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
                    <p className="text-sm text-theme-text leading-relaxed">{note.text}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-theme-text-muted">{formatDate(note.createdAt)}</span>
                      {note.durationSeconds && (
                        <span className="text-xs text-theme-text-muted px-1.5 py-0.5 bg-theme-surface/50 rounded">
                          {formatNoteDuration(note.durationSeconds)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => copyNote(note.text, note.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-theme-text-muted hover:text-theme-text hover:bg-theme-surface/50 transition-all"
                    >
                      {copiedId === note.id ? (
                        <Check className="w-3.5 h-3.5 text-green-accent" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => deleteNote(note.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-theme-text-muted hover:text-recording-red hover:bg-recording-red/10 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
