import { useEffect, useState, useCallback, useRef } from 'react'
import { WaveformBars } from './waveform-bars'
import { useAudio } from '../hooks/use-audio'
import { transcribeAudio, processText } from '../services/ai-router'
import { expandSnippets, Snippet } from '../models/snippet'
import { useStatsStore } from '../store/stats'
import { useActivityStore } from '../store/activity'
import type { Trigger } from '../models/trigger'
import { matchTrigger } from '../services/trigger-matcher'
import { executeTrigger } from '../services/trigger-executor'

type PanelState = 'idle' | 'recording' | 'transcribing'

/** Track whether the panel is visible so we can replay the entrance animation */
let showCounter = 0

export function PinnedPanel(): JSX.Element {
  const [state, setState] = useState<PanelState>('idle')
  const [waveformData, setWaveformData] = useState<number[]>([0, 0, 0, 0, 0, 0, 0])
  const isRecordingRef = useRef(false)
  const recordingStartRef = useRef<number>(0)
  const [animKey, setAnimKey] = useState(0)

  const {
    startRecording,
    stopRecording,
    cancelRecording,
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
      if (!blob) {
        setState('idle')
        window.tapwisper.recordingPill.hide()
        window.tapwisper.window.hide('pinnedPanel')
        return
      }

      // Fire all async work in parallel: transcription, text grab, config reads.
      // Previously these were sequential, adding 100-300ms of avoidable latency.
      const grabPromise = window.tapwisper.clipboard.grabSelectedText().catch(() => '')
      const langPromise = window.tapwisper.store.get('language') as Promise<string | undefined>
      const snippetsPromise = window.tapwisper.store.get('snippets') as Promise<Snippet[] | undefined>

      const [lang, storedSnippets] = await Promise.all([langPromise, snippetsPromise])

      const result = await transcribeAudio(blob, lang || 'en')
      const rawTranscription = result.text?.trim() || ''

      // Wait for grab to complete (it ran in parallel with transcription)
      let selectedText = ''
      try {
        const grabbedText = await grabPromise
        if (grabbedText && typeof grabbedText === 'string' && !/^__tapwisper_sentinel_\d+__$/.test(grabbedText)) {
          selectedText = grabbedText.trim()
        }
      } catch {
        // Grab failed, continue with empty selection
      }

      // Expand snippets in transcription (e.g. "/email" → actual email)
      const transcription = storedSnippets?.length
        ? expandSnippets(rawTranscription, storedSnippets)
        : rawTranscription

      // ── Track voice recording analytics ──
      const recordingSeconds = transcription ? (Date.now() - recordingStartRef.current) / 1000 : 0
      const chars = transcription?.length || 0
      const words = transcription ? transcription.split(/\s+/).filter(Boolean).length : 0
      
      if (transcription) {
        addVoiceRecording(recordingSeconds, chars, words)
      }

      // ── Check voice triggers before default behavior ──
      if (transcription) {
        try {
          const storedTriggers = await window.tapwisper.store.get('triggers') as Trigger[] | undefined
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
              // e.g. "So this is my movie so Google about the movie"
              //       → inject "So this is my movie so" then run the Google trigger
              if (triggerMatch.prefixText) {
                await new Promise((r) => setTimeout(r, 50))
                await window.tapwisper.clipboard.insertText(triggerMatch.prefixText)
              }

              try {
                await executeTrigger(triggerMatch)
              } catch (execErr) {
                console.error('[PinnedPanel] Trigger execution failed:', execErr)
              }
              return
            }
          }
        } catch (err) {
          console.error('[PinnedPanel] Trigger matching failed:', err)
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
            systemInstruction: 'You are a helpful writing assistant. The user has selected some text and given you a voice instruction about what to do with it. Follow their instruction precisely. Only return the result text, nothing else — no explanations, no quotes, no markdown formatting.'
          })

          window.tapwisper.window.send('recordingPill', 'result-panel:result', aiResult.result)
          window.tapwisper.recording.transcriptionDone(aiResult.result || transcription)

          addAIAction('voice-command', aiResult.result?.length || 0)

          addTranscriptionWithLLM({
            transcription,
            durationSeconds: recordingSeconds,
            wordCount: words,
            llmAction: 'Voice Command',
            llmInput: selectedText,
            llmResult: aiResult.result || ''
          })
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'AI processing failed'
          window.tapwisper.window.send('recordingPill', 'result-panel:error', errorMsg)
        }
      } else if (transcription) {
        addTranscription({
          transcription,
          durationSeconds: recordingSeconds,
          wordCount: words
        })

        window.tapwisper.window.hide('pinnedPanel')

        await new Promise((r) => setTimeout(r, 50))
        await window.tapwisper.clipboard.insertText(transcription)

        // Activate post-recording state so the shortcut can open the action panel
        window.tapwisper.recording.transcriptionDone(transcription)

        setState('idle')
        window.tapwisper.window.send('recordingPill', 'post-recording:show', transcription)
      } else {
        // No transcription at all
        window.tapwisper.recordingPill.hide()
        window.tapwisper.window.hide('pinnedPanel')
        setState('idle')
      }
    } catch (err: any) {
      console.error('Transcription failed:', err)
      window.tapwisper.recordingPill.hide()
      window.tapwisper.window.hide('pinnedPanel')
      setState('idle')
    }
  }, [stopRecording, addVoiceRecording, addAIAction, addTranscription, addTranscriptionWithLLM])

  // Start recording helper
  const doStartRecording = useCallback(async () => {
    // Show recording UI IMMEDIATELY — don't wait for mic permission
    const uiStartTime = Date.now()
    recordingStartRef.current = uiStartTime
    isRecordingRef.current = true
    setState('recording')

    // Start actual recording (should be instant if permission already granted)
    try {
      await startRecording()
    } catch (err: any) {
      console.error('Failed to start recording:', err)
      isRecordingRef.current = false
      setState('idle')
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
  useEffect(() => { doStartRecordingRef.current = doStartRecording }, [doStartRecording])
  useEffect(() => { doStopAndTranscribeRef.current = doStopAndTranscribe }, [doStopAndTranscribe])
  useEffect(() => { cancelRecordingRef.current = cancelRecording }, [cancelRecording])

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
          flex items-center gap-3 pl-1.5 pr-1.5 py-1.5
          bg-[#0A0A0A]/95 rounded-full pill-shadow
          opacity-100 scale-100 animate-scale-up
          transition-all duration-300 ease-out
        `}
        style={{ height: 44 }}
      >
        {/* Cancel (X) button — left side (invisible placeholder when transcribing) */}
        {!isTranscribing ? (
          <button
            onClick={handleCancel}
            className="no-drag w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all cursor-pointer shrink-0"
          >
            <svg className="w-4 h-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <div className="w-8 h-8 shrink-0" />
        )}

        {/* Waveform — center (settled calm bars when transcribing) */}
        <div className="flex items-center justify-center">
          <WaveformBars
            data={waveformData}
            barCount={7}
            barWidth={3}
            maxHeight={22}
            color={isTranscribing ? 'rgba(255,255,255,0.4)' : '#FFFFFF'}
            animated={state === 'recording'}
            settled={isTranscribing}
          />
        </div>

        {/* Right side: stop button (recording) or spinner (transcribing) */}
        {state === 'recording' ? (
          <button
            onClick={handleStop}
            className="no-drag w-8 h-8 rounded-full bg-recording-red hover:bg-red-500 flex items-center justify-center transition-all cursor-pointer shrink-0"
          >
            <div className="w-3 h-3 rounded-[2px] bg-white" />
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
