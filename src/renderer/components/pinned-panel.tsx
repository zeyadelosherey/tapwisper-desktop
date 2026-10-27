import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { WaveformBars } from './waveform-bars'
import { useAudio } from '../hooks/use-audio'
import { transcribeAudio, processText } from '../services/ai-router'
import { warmUpLocalModels } from '../services/local-ai'
import type { Snippet } from '../models/snippet'
import type { DictionaryEntry } from '../models/dictionary'
import type { WritingStyles } from '../models/style'
import { applyLocalCorrections, postProcessTranscript } from '../services/dictation-pipeline'
import { useStatsStore } from '../store/stats'
import { useActivityStore } from '../store/activity'
import type { Trigger } from '../models/trigger'
import { matchTrigger } from '../services/trigger-matcher'
import { executeTrigger } from '../services/trigger-executor'
import i18n from '../i18n'

type PanelState = 'idle' | 'recording' | 'transcribing'

/** Recordings shorter than this are accidental taps — discard without calling the API */
const MIN_RECORDING_MS = 300
/** Less voiced audio than this means nothing was said */
const MIN_VOICED_MS = 150

/**
 * Phrases Whisper is known to invent from silence or noise (it was trained on
 * subtitled video). Only dropped when the recording had very little speech.
 */
const HALLUCINATIONS = new Set([
  'thank you',
  'thank you very much',
  'thanks for watching',
  'thank you for watching',
  'thanks for watching and see you next time',
  'please subscribe',
  'subscribe to my channel',
  'bye',
  'you',
  'so',
  'okay',
  'the end',
  'subtitles by the amaraorg community',
  'شكرا',
  'شكرا لكم',
  'شكرا للمشاهدة',
  'اشتركوا في القناة',
  'untertitel im auftrag des zdf',
  'sous-titres réalisés par la communauté damaraorg'
])

function isLikelyHallucination(text: string, voicedMs: number): boolean {
  if (voicedMs > 1200) return false
  const normalized = text
    .toLowerCase()
    .replace(/[.,!?;:'"()…\-–—]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return HALLUCINATIONS.has(normalized)
}

/** Show a short error in the recording pill (auto-dismisses) */
function showPillError(message: string): void {
  // Send the error only after the pill's own show event, so it isn't overwritten
  void window.tapwisper.recordingPill
    .show()
    .catch(() => {})
    .then(() => window.tapwisper.window.send('recordingPill', 'recording:error', message))
}

function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (/No API key/i.test(raw)) return raw
  if (/\b401\b|\b403\b|invalid.*key|unauthori[sz]ed/i.test(raw)) {
    return i18n.t(
      'errors.voiceKeyRejected',
      'Your voice provider rejected the API key. Check it in Settings > AI Provider.'
    )
  }
  if (/\b429\b|rate limit|quota/i.test(raw)) {
    return i18n.t(
      'errors.voiceRateLimited',
      'Voice provider rate limit or quota reached. Try again in a moment.'
    )
  }
  if (/Failed to fetch|NetworkError|network/i.test(raw)) {
    return i18n.t('errors.network', 'Network error — check your internet connection.')
  }
  return raw.length > 160 ? `${raw.slice(0, 157)}...` : raw
}

interface PipelineConfigWithTriggers {
  dictionary?: DictionaryEntry[]
  snippets?: Snippet[]
  smartFormatting?: boolean
  writingStyles?: Partial<WritingStyles>
  dictationTranslateTo?: string
  triggers?: Trigger[]
}

/** Keep the dictation audio for replay / re-transcription from History */
async function saveAudio(recordId: string, blob: Blob): Promise<void> {
  try {
    await window.tapwisper.recordings.save(recordId, await blob.arrayBuffer(), blob.type)
  } catch {
    // Saving is best-effort — never disturb the dictation
  }
}

/** Track whether the panel is visible so we can replay the entrance animation */
let showCounter = 0

export function PinnedPanel(): JSX.Element {
  const { t } = useTranslation()
  const [state, setState] = useState<PanelState>('idle')
  const [waveformData, setWaveformData] = useState<number[]>([0, 0, 0, 0, 0, 0, 0])
  const isRecordingRef = useRef(false)
  const recordingStartRef = useRef<number>(0)
  const [animKey, setAnimKey] = useState(0)

  const {
    startRecording,
    stopRecording,
    cancelRecording,
    getLastRecordingStats,
    state: audioState
  } = useAudio()

  const addVoiceRecording = useStatsStore((s) => s.addVoiceRecording)
  const addAIAction = useStatsStore((s) => s.addAIAction)
  const addTranscription = useActivityStore((s) => s.addTranscription)
  const addTranscriptionWithLLM = useActivityStore((s) => s.addTranscriptionWithLLM)

  // Perform the actual transcription after stopping recording
  const performTranscription = useCallback(async () => {
    try {
      setState('transcribing')
      const blob = await stopRecording()
      const stats = getLastRecordingStats()
      const hideAll = (): void => {
        setState('idle')
        window.tapwisper.recordingPill.hide()
        window.tapwisper.window.hide('pinnedPanel')
      }
      if (!blob || blob.size === 0 || stats.durationMs < MIN_RECORDING_MS) {
        hideAll()
        return
      }
      // Nothing was said: don't send silence to the API (Whisper invents text from it)
      if (stats.analyzed && stats.voicedMs < MIN_VOICED_MS) {
        window.tapwisper.window.hide('pinnedPanel')
        setState('idle')
        if (stats.durationMs > 1000) {
          showPillError(
            i18n.t(
              'errors.noSpeech',
              'No speech detected. Check that the right microphone is selected.'
            )
          )
        } else {
          window.tapwisper.recordingPill.hide()
        }
        return
      }

      // Fire all async work in parallel: transcription, text grab, config and
      // the app being dictated into (for the writing style).
      const grabPromise = window.tapwisper.clipboard.grabSelectedText().catch(() => '')
      const configPromise = window.tapwisper.store
        .getAll()
        .catch(() => ({})) as Promise<PipelineConfigWithTriggers>
      const appPromise = window.tapwisper.context.activeApp().catch(() => null)
      const recordingSeconds = (Date.now() - recordingStartRef.current) / 1000

      let result: Awaited<ReturnType<typeof transcribeAudio>>
      try {
        result = await transcribeAudio(blob)
      } catch (err) {
        // Keep the audio so the dictation can be retried from History
        // (a failed entry has an empty transcription)
        const appInfo = await appPromise
        const failedId = addTranscription({
          transcription: '',
          durationSeconds: recordingSeconds,
          wordCount: 0,
          appName: appInfo?.name
        })
        void saveAudio(failedId, blob)
        throw err
      }
      const [config, appInfo] = await Promise.all([configPromise, appPromise])

      let rawTranscription = result.text?.trim() || ''
      if (rawTranscription && isLikelyHallucination(rawTranscription, stats.voicedMs)) {
        rawTranscription = ''
      }

      // Wait for grab to complete (it ran in parallel with transcription)
      let selectedText = ''
      try {
        const grabbedText = await grabPromise
        if (
          grabbedText &&
          typeof grabbedText === 'string' &&
          !/^__tapwisper_sentinel_\d+__$/.test(grabbedText)
        ) {
          selectedText = grabbedText.trim()
        }
      } catch {
        // Grab failed, continue with empty selection
      }

      // Dictionary corrections + snippet expansion (local, instant)
      const transcription = applyLocalCorrections(rawTranscription, config)
      const meta = {
        rawTranscription: rawTranscription !== transcription ? rawTranscription : undefined,
        appName: appInfo?.name,
        language: result.language
      }

      // ── Track voice recording analytics ──
      const chars = transcription?.length || 0
      const words = transcription ? transcription.split(/\s+/).filter(Boolean).length : 0

      if (transcription) {
        addVoiceRecording(recordingSeconds, chars, words)
      }

      // ── Check voice triggers before default behavior ──
      if (transcription) {
        try {
          const storedTriggers = config.triggers
          if (storedTriggers?.length) {
            const triggerMatch = matchTrigger(transcription, storedTriggers)
            if (triggerMatch) {
              // Hide the pinned panel before executing
              window.tapwisper.window.hide('pinnedPanel')
              setState('idle')
              // Only hide the recording pill if the trigger won't need it.
              // AI Chat shows the pill for loading feedback in all response modes;
              // hiding it here causes a race where the delayed hide callback
              // fires *after* the trigger has already re-shown it, causing flicker.
              const needsPill = triggerMatch.trigger.actionConfig.type === 'ai-chat'
              if (!needsPill) {
                window.tapwisper.recordingPill.hide()
              }

              // If there was text spoken before the trigger phrase (mid-sentence trigger),
              // inject it as normal dictation first so it's not lost.
              // e.g. "So this is my movie. Google about the movie"
              //       → inject "So this is my movie." then run the Google trigger
              if (triggerMatch.prefixText) {
                await new Promise((r) => setTimeout(r, 50))
                await window.tapwisper.clipboard.insertText(triggerMatch.prefixText)
              }

              try {
                const execResult = await executeTrigger(triggerMatch)
                if (!execResult.success && !execResult.errorShown) {
                  showPillError(
                    i18n.t('errors.triggerFailed', '“{{name}}” failed: {{error}}', {
                      name: triggerMatch.trigger.name,
                      error: execResult.error || i18n.t('common.unknownError', 'Unknown error')
                    })
                  )
                }
              } catch (execErr) {
                showPillError(
                  i18n.t('errors.triggerFailed', '“{{name}}” failed: {{error}}', {
                    name: triggerMatch.trigger.name,
                    error: friendlyError(execErr)
                  })
                )
              }
              return
            }
          }
        } catch {
          // Matching failed — fall through to normal dictation so nothing is lost
        }
      }

      // ── Branch: selected text → AI processing, else → direct paste ──
      if (selectedText && transcription) {
        // User had text selected — send voice instruction + selected text to LLM
        window.tapwisper.recordingPill.show()
        window.tapwisper.window.send('recordingPill', 'result-panel:loading')

        window.tapwisper.window.hide('pinnedPanel')
        setState('idle')

        try {
          const aiResult = await processText({
            prompt: transcription,
            text: selectedText,
            systemInstruction:
              'You are a helpful writing assistant. The user has selected some text and given you a voice instruction about what to do with it. Follow their instruction precisely. Keep the language of the selected text unless the instruction asks to translate. Only return the result text, nothing else — no explanations, no quotes, no markdown formatting.'
          })

          window.tapwisper.window.send('recordingPill', 'result-panel:result', aiResult.result)
          window.tapwisper.recording.transcriptionDone(aiResult.result || transcription)

          addAIAction('voice-command', aiResult.result?.length || 0)

          const id = addTranscriptionWithLLM({
            transcription,
            durationSeconds: recordingSeconds,
            wordCount: words,
            llmAction: 'Voice Command',
            llmInput: selectedText,
            llmResult: aiResult.result || '',
            ...meta
          })
          void saveAudio(id, blob)
        } catch (err: unknown) {
          const errorMsg =
            err instanceof Error ? err.message : i18n.t('errors.aiFailed', 'AI processing failed')
          window.tapwisper.window.send('recordingPill', 'result-panel:error', errorMsg)
        }
      } else if (transcription) {
        window.tapwisper.window.hide('pinnedPanel')

        // Optional Smart Formatting (LLM clean-up in the app's writing style).
        // Never throws — falls back to the corrected transcript.
        const finalText =
          config.smartFormatting || config.dictationTranslateTo
            ? await postProcessTranscript(
                transcription,
                { appName: appInfo?.name, windowTitle: appInfo?.title },
                // Dictionary/snippets were already applied above
                { ...config, dictionary: [], snippets: [] }
              )
            : transcription

        const id = addTranscription({
          transcription: finalText,
          durationSeconds: recordingSeconds,
          wordCount: finalText.split(/\s+/).filter(Boolean).length,
          ...meta,
          rawTranscription: rawTranscription !== finalText ? rawTranscription : undefined
        })
        void saveAudio(id, blob)

        await new Promise((r) => setTimeout(r, 50))
        await window.tapwisper.clipboard.insertText(finalText)

        // Activate post-recording state so the shortcut can open the action panel
        window.tapwisper.recording.transcriptionDone(finalText)

        setState('idle')
        window.tapwisper.window.send('recordingPill', 'post-recording:show', finalText)
      } else {
        // No transcription at all
        window.tapwisper.recordingPill.hide()
        window.tapwisper.window.hide('pinnedPanel')
        setState('idle')
      }
    } catch (err: unknown) {
      window.tapwisper.window.hide('pinnedPanel')
      setState('idle')
      showPillError(friendlyError(err))
    }
  }, [
    stopRecording,
    getLastRecordingStats,
    addVoiceRecording,
    addAIAction,
    addTranscription,
    addTranscriptionWithLLM
  ])

  // Start recording helper
  const doStartRecording = useCallback(async () => {
    // Show recording UI IMMEDIATELY — don't wait for mic permission
    const uiStartTime = Date.now()
    recordingStartRef.current = uiStartTime
    isRecordingRef.current = true
    setState('recording')
    // Local models load while the user is still speaking
    void warmUpLocalModels('dictation')

    // Start actual recording (should be instant if permission already granted)
    try {
      await startRecording()
    } catch (err: unknown) {
      isRecordingRef.current = false
      setState('idle')
      window.tapwisper.window.hide('pinnedPanel')
      // Tell main the recording is over so the next shortcut press starts fresh
      void window.tapwisper.recording.cancel()
      showPillError(
        err instanceof Error
          ? err.message
          : i18n.t('errors.recordingStartFailed', 'Failed to start recording')
      )
    }
  }, [startRecording])

  // Stop recording and transcribe helper
  const doStopAndTranscribe = useCallback(async () => {
    if (!isRecordingRef.current) return
    isRecordingRef.current = false
    await performTranscription()
  }, [performTranscription])

  // Stable refs for callbacks — IPC listeners call through these refs
  // so the useEffect never needs to re-subscribe when callbacks change.
  const doStartRecordingRef = useRef(doStartRecording)
  const doStopAndTranscribeRef = useRef(doStopAndTranscribe)
  const cancelRecordingRef = useRef(cancelRecording)
  useEffect(() => {
    doStartRecordingRef.current = doStartRecording
  }, [doStartRecording])
  useEffect(() => {
    doStopAndTranscribeRef.current = doStopAndTranscribe
  }, [doStopAndTranscribe])
  useEffect(() => {
    cancelRecordingRef.current = cancelRecording
  }, [cancelRecording])

  // Subscribe to IPC events once (empty deps). Callbacks accessed via stable refs.
  useEffect(() => {
    document.documentElement.classList.add('transparent')

    // Replay entrance animation every time the window becomes visible
    const onVisibilityChange = (): void => {
      if (!document.hidden) {
        setAnimKey(++showCounter)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    const unsubStart = window.tapwisper.on('recording:start', () => {
      doStartRecordingRef.current()
    })

    const unsubStop = window.tapwisper.on('recording:stop', () => {
      doStopAndTranscribeRef.current()
    })

    const unsubCancel = window.tapwisper.on('recording:cancel', () => {
      cancelRecordingRef.current()
      isRecordingRef.current = false
      setState('idle')
    })

    const unsubWaveform = window.tapwisper.on('waveform:data', (data: unknown) => {
      if (Array.isArray(data)) setWaveformData(data as number[])
    })

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      unsubStart()
      unsubStop()
      unsubCancel()
      unsubWaveform()
    }
  }, []) // Empty deps — subscribes once, never re-subscribes

  // Use real waveform data from the audio hook when recording
  useEffect(() => {
    if (audioState.isRecording && audioState.waveformData.some((v) => v > 0)) {
      setWaveformData(audioState.waveformData)
    }
  }, [audioState.isRecording, audioState.waveformData])

  // Fallback simulated waveform when useAudio doesn't provide data (e.g. dev mode)
  // 200ms interval is visually smooth enough and halves the state updates vs 100ms
  useEffect(() => {
    if (state !== 'recording' || audioState.isRecording) return undefined
    const interval = setInterval(() => {
      setWaveformData(
        Array.from({ length: 7 }, (_, i) => {
          const center = 3
          const dist = Math.abs(i - center) / center
          return 0.3 + (1 - dist) * 0.5 + Math.random() * 0.3
        })
      )
    }, 200)
    return () => clearInterval(interval)
  }, [state, audioState.isRecording])

  const handleStop = useCallback(async () => {
    if (state === 'recording') {
      await doStopAndTranscribe()
    }
  }, [state, doStopAndTranscribe])

  const handleCancel = useCallback(() => {
    window.tapwisper.recording.cancel()
  }, [])

  const isTranscribing = state === 'transcribing'

  // Don't render anything when idle — prevents flicker on window show
  if (state === 'idle') return <div className="w-full h-full no-select" />

  return (
    <div className="w-full h-full flex items-start justify-center no-select">
      <div
        key={animKey}
        className={`
          flex items-center gap-3 px-1.5 py-1.5
          bg-capsule/95 border border-white/[0.08] rounded-full pill-shadow
          opacity-100 scale-100 animate-scale-up
          transition-all duration-300 ease-out
        `}
        style={{ height: 44 }}
      >
        {/* Cancel (X) button — start side (invisible placeholder when transcribing) */}
        {!isTranscribing ? (
          <button
            onClick={handleCancel}
            aria-label={t('pinnedPanel.cancelRecording', 'Cancel recording')}
            title={t('pinnedPanel.cancelRecording', 'Cancel recording')}
            className="no-drag w-8 h-8 rounded-full bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center transition-all cursor-pointer shrink-0"
          >
            <svg
              className="w-4 h-4 text-white/80"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <div className="w-8 h-8 shrink-0" />
        )}

        {/* Waveform — center (settled calm bars when transcribing) */}
        <div className="flex items-center justify-center gap-2.5">
          <span
            aria-hidden="true"
            className={`w-2 h-2 rounded-full transition-colors duration-200 ${
              isTranscribing ? 'bg-white/25' : 'bg-ember'
            }`}
          />
          <WaveformBars
            data={waveformData}
            barCount={7}
            barWidth={3}
            maxHeight={22}
            color={isTranscribing ? 'rgba(255,255,255,0.4)' : 'rgb(var(--capsule-signal))'}
            animated={state === 'recording'}
            settled={isTranscribing}
          />
        </div>

        {/* End side: stop button (recording) or spinner (transcribing) */}
        {state === 'recording' ? (
          <button
            onClick={handleStop}
            aria-label={t('pinnedPanel.stopRecording', 'Stop recording')}
            title={t('pinnedPanel.stopRecording', 'Stop recording')}
            className="no-drag w-8 h-8 rounded-full bg-white hover:bg-white/85 flex items-center justify-center transition-all cursor-pointer shrink-0"
          >
            <div className="w-3 h-3 rounded-[3px] bg-capsule" />
          </button>
        ) : (
          <div className="w-8 h-8 flex items-center justify-center shrink-0">
            <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
          </div>
        )}
      </div>
    </div>
  )
}
