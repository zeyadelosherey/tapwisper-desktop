import { useState, useRef, useCallback, useEffect } from 'react'
import { microphoneConstraints } from './use-microphone'
import i18n from '../i18n'

// Module-level constants to avoid repeated allocations
const EMPTY_WAVEFORM: number[] = [0, 0, 0, 0, 0, 0, 0]
const IPC_THROTTLE_MS = 66 // ~15fps for IPC sends (visually sufficient for waveform)
// Audio analysis runs on a timer, not requestAnimationFrame: a rAF loop makes
// the (visible) recording panel produce a frame every vsync, which measured
// ~15% CPU on its own. 25Hz is plenty for VAD and a 15fps meter.
const ANALYSIS_INTERVAL_MS = 40


// Voice activity detection. RMS of the raw waveform (−1..1). With noise
// suppression on, room noise sits well below 0.005 while normal speech is 0.03+.
const VOICE_RMS_THRESHOLD = 0.012
// Release the mic this long after the last recording (unless keepMicWarm is on).
// Short enough that the OS mic indicator / Bluetooth call-mode don't linger,
// long enough that back-to-back dictations still start instantly.
const MIC_IDLE_RELEASE_MS = 60_000

export interface RecordingStats {
  durationMs: number
  /** Total time the input level was above the speech threshold */
  voicedMs: number
  /** False if no level samples were taken (e.g. rendering throttled) — don't trust voicedMs */
  analyzed: boolean
}

export interface AudioRecorderState {
  isRecording: boolean
  isPaused: boolean
  duration: number
  waveformData: number[]
}

export interface UseAudioReturn {
  state: AudioRecorderState
  startRecording: () => Promise<void>
  stopRecording: () => Promise<Blob | null>
  cancelRecording: () => void
  getWaveformData: () => number[]
  /** Stats of the most recently stopped recording (for silence / accidental-tap filtering) */
  getLastRecordingStats: () => RecordingStats
}

export function useAudio(): UseAudioReturn {
  const [state, setState] = useState<AudioRecorderState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    waveformData: EMPTY_WAVEFORM
  })

  // Warm (persistent) mic stream — kept alive between recordings to
  // eliminate the 200-500ms getUserMedia hardware spin-up on each start.
  const warmStreamRef = useRef<MediaStream | null>(null)
  const warmingUpRef = useRef<boolean>(false)
  const warmDeviceRef = useRef<string>('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const waveformDataRef = useRef<number[]>(EMPTY_WAVEFORM)
  const isRecordingRef = useRef<boolean>(false)
  const lastIpcSendTimeRef = useRef<number>(0)

  // Voice activity tracking for the current recording
  const timeDomainRef = useRef<Float32Array<ArrayBuffer> | null>(null)
  const recordStartRef = useRef<number>(0)
  const voicedMsRef = useRef<number>(0)
  const lastFrameTimeRef = useRef<number>(0)
  const framesAnalyzedRef = useRef<number>(0)
  const lastStatsRef = useRef<RecordingStats>({ durationMs: 0, voicedMs: 0, analyzed: false })

  // In-flight start, so a stop/cancel that arrives during mic spin-up waits for it
  const startPromiseRef = useRef<Promise<void> | null>(null)
  const cancelledDuringStartRef = useRef<boolean>(false)
  const idleReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Waveform analysis loop — uses ref to avoid stale closure
  const updateWaveform = useCallback(() => {
    if (!analyserRef.current) return

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)

    // ── Voice activity: accumulate time spent above the speech threshold ──
    if (!timeDomainRef.current || timeDomainRef.current.length !== analyserRef.current.fftSize) {
      timeDomainRef.current = new Float32Array(analyserRef.current.fftSize)
    }
    const td = timeDomainRef.current
    analyserRef.current.getFloatTimeDomainData(td)
    let sumSquares = 0
    for (let k = 0; k < td.length; k++) sumSquares += td[k] * td[k]
    const rms = Math.sqrt(sumSquares / td.length)
    const frameNow = performance.now()
    // Cap per-frame credit so a throttled frame can't count as a long voiced span
    const frameMs = Math.min(100, frameNow - (lastFrameTimeRef.current || frameNow))
    lastFrameTimeRef.current = frameNow
    framesAnalyzedRef.current++
    if (rms >= VOICE_RMS_THRESHOLD) voicedMsRef.current += frameMs

    // Focus on the speech-relevant frequency range (roughly bins 2–60 out of 128)
    // This makes the bars much more responsive to actual voice
    const bands = 7
    const usableBins = Math.min(60, dataArray.length)
    const startBin = 2 // skip DC + sub-bass
    const binRange = usableBins - startBin
    const binSize = Math.floor(binRange / bands)
    const center = Math.floor(bands / 2)

    const newData = Array.from({ length: bands }, (_, i) => {
      const start = startBin + i * binSize
      const end = start + binSize
      let sum = 0
      let peak = 0
      for (let j = start; j < end; j++) {
        sum += dataArray[j]
        if (dataArray[j] > peak) peak = dataArray[j]
      }
      const avg = sum / binSize / 255
      // Blend average + peak for punchier response
      const blended = avg * 0.4 + (peak / 255) * 0.6

      // Weight toward center for visual appeal
      const dist = Math.abs(i - center) / center
      const weight = 1 - dist * 0.25
      return Math.min(1, blended * weight * 1.8)
    })

    waveformDataRef.current = newData

    // Throttle IPC sends to ~15fps (every 66ms) — visually sufficient for waveform bars
    // This cuts IPC serialization overhead by ~75% vs sending at 60fps
    const now = performance.now()
    if (now - lastIpcSendTimeRef.current >= IPC_THROTTLE_MS) {
      lastIpcSendTimeRef.current = now
      setState((prev) => ({ ...prev, waveformData: newData }))
      // The pill is another window; this window reads `state` directly (no IPC round trip)
      window.tapwisper.window.send('recordingPill', 'waveform:data', newData)
    }

    if (isRecordingRef.current) {
      animFrameRef.current = window.setTimeout(updateWaveform, ANALYSIS_INTERVAL_MS)
    }
  }, [])

  /**
   * Acquire (or re-acquire) a warm microphone stream. This keeps the mic
   * hardware "hot" so subsequent startRecording calls are near-instant.
   */
  const ensureWarmStream = useCallback(async (): Promise<MediaStream> => {
    const wantedDevice = ((await window.tapwisper.store.get('microphoneDeviceId').catch(() => '')) ||
      '') as string

    // If we already have a live stream on the right device, reuse it
    const existing = warmStreamRef.current
    if (
      existing &&
      existing.active &&
      existing.getAudioTracks().every((t) => t.readyState === 'live') &&
      warmDeviceRef.current === wantedDevice
    ) {
      return existing
    }
    if (existing) {
      existing.getTracks().forEach((t) => t.stop())
      warmStreamRef.current = null
    }

    // Prevent concurrent warm-up calls from racing
    if (warmingUpRef.current) {
      // Wait for the in-progress warm-up
      await new Promise<void>((resolve) => {
        const check = (): void => {
          if (!warmingUpRef.current) { resolve(); return }
          setTimeout(check, 20)
        }
        check()
      })
      if (warmStreamRef.current?.active) return warmStreamRef.current!
    }

    warmingUpRef.current = true
    try {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: microphoneConstraints(wantedDevice)
        })
      } catch (err) {
        // The chosen mic was unplugged — fall back to the system default
        if (!wantedDevice || !(err instanceof DOMException) || err.name !== 'OverconstrainedError') {
          throw err
        }
        stream = await navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints('') })
      }
      warmStreamRef.current = stream
      warmDeviceRef.current = wantedDevice

      // If the track ends unexpectedly (e.g. user revokes permission), clear the ref
      stream.getAudioTracks()[0]?.addEventListener('ended', () => {
        if (warmStreamRef.current === stream) {
          warmStreamRef.current = null
        }
      })

      return stream
    } finally {
      warmingUpRef.current = false
    }
  }, [])

  const releaseMic = useCallback((): void => {
    if (idleReleaseTimerRef.current) {
      clearTimeout(idleReleaseTimerRef.current)
      idleReleaseTimerRef.current = null
    }
    if (isRecordingRef.current || startPromiseRef.current) return
    if (warmStreamRef.current) {
      warmStreamRef.current.getTracks().forEach((track) => track.stop())
      warmStreamRef.current = null
    }
  }, [])

  /** After a recording, keep the mic warm briefly (or forever if the user opted in). */
  const scheduleMicRelease = useCallback((): void => {
    if (idleReleaseTimerRef.current) clearTimeout(idleReleaseTimerRef.current)
    idleReleaseTimerRef.current = null
    Promise.resolve(window.tapwisper.store.get('keepMicWarm'))
      .catch(() => false)
      .then((keepWarm) => {
        if (keepWarm) return
        idleReleaseTimerRef.current = setTimeout(releaseMic, MIC_IDLE_RELEASE_MS)
      })
  }, [releaseMic])

  const doStartRecording = useCallback(async (): Promise<void> => {
    if (idleReleaseTimerRef.current) {
      clearTimeout(idleReleaseTimerRef.current)
      idleReleaseTimerRef.current = null
    }
    try {
      // Reuse the warm stream — this is near-instant when the stream is already live
      const stream = await ensureWarmStream()

      // Set up audio analysis
      const audioContext = new AudioContext({ sampleRate: 16000 })
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.5 // lower = more responsive to transients
      analyser.minDecibels = -90
      analyser.maxDecibels = -10
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser

      // Set up MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'
      })

      chunksRef.current = []
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.start(100) // Collect data every 100ms
      mediaRecorderRef.current = mediaRecorder

      recordStartRef.current = Date.now()
      voicedMsRef.current = 0
      lastFrameTimeRef.current = 0
      framesAnalyzedRef.current = 0

      // Start duration timer
      const startTime = Date.now()
      timerRef.current = setInterval(() => {
        setState((prev) => ({
          ...prev,
          duration: Math.floor((Date.now() - startTime) / 1000)
        }))
      }, 1000)

      isRecordingRef.current = true
      setState((prev) => ({ ...prev, isRecording: true, duration: 0 }))

      // Start waveform updates
      animFrameRef.current = window.setTimeout(updateWaveform, ANALYSIS_INTERVAL_MS)
    } catch (error) {
      const name = error instanceof DOMException ? error.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        throw new Error(
          i18n.t('errors.micDenied', 'Microphone access denied. Please allow microphone access.')
        )
      }
      if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        throw new Error(
          i18n.t('errors.micNotFound', 'No microphone found. Please connect a microphone.')
        )
      }
      if (name === 'NotReadableError') {
        throw new Error(
          i18n.t('errors.micInUse', 'The microphone is in use by another application.')
        )
      }
      throw new Error(
        error instanceof Error
          ? error.message
          : i18n.t('errors.recordingStartFailed', 'Failed to start recording')
      )
    }
  }, [updateWaveform, ensureWarmStream])

  const startRecording = useCallback(async (): Promise<void> => {
    cancelledDuringStartRef.current = false
    const promise = doStartRecording()
    startPromiseRef.current = promise
    try {
      await promise
    } finally {
      if (startPromiseRef.current === promise) startPromiseRef.current = null
    }
    if (cancelledDuringStartRef.current) {
      cancelledDuringStartRef.current = false
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      cleanupRecording()
    }
  }, [doStartRecording])

  // Only pre-open the mic on mount when the user explicitly opted into it —
  // a permanently open mic keeps the OS mic indicator lit and forces Bluetooth
  // headsets into low-quality call mode, which also hurts recognition.
  useEffect(() => {
    Promise.resolve(window.tapwisper.store.get('keepMicWarm'))
      .then((keepWarm) => {
        if (keepWarm) return ensureWarmStream()
        return undefined
      })
      .catch(() => {
        // Mic permission will be requested when recording starts
      })
  }, [ensureWarmStream])

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    // A quick push-to-talk can release before the mic finished starting
    if (startPromiseRef.current) {
      await startPromiseRef.current.catch(() => {})
    }
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve(null)
        return
      }

      lastStatsRef.current = {
        durationMs: Date.now() - recordStartRef.current,
        voicedMs: voicedMsRef.current,
        analyzed: framesAnalyzedRef.current > 0
      }

      const recorder = mediaRecorderRef.current
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        cleanupRecording()
        scheduleMicRelease()
        resolve(blob)
      }

      recorder.stop()
    })
  }, [scheduleMicRelease])

  const cancelRecording = useCallback(() => {
    if (startPromiseRef.current) {
      cancelledDuringStartRef.current = true
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    cleanupRecording()
    scheduleMicRelease()
  }, [scheduleMicRelease])

  /**
   * Clean up recording-specific resources but keep the warm mic stream alive
   * so the next recording starts instantly.
   */
  const cleanupRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (animFrameRef.current) clearTimeout(animFrameRef.current)
    if (audioContextRef.current) {
      audioContextRef.current.close()
    }

    isRecordingRef.current = false
    mediaRecorderRef.current = null
    audioContextRef.current = null
    analyserRef.current = null
    chunksRef.current = []

    setState({
      isRecording: false,
      isPaused: false,
      duration: 0,
      waveformData: EMPTY_WAVEFORM
    })
  }, [])

  const getWaveformData = useCallback((): number[] => {
    return waveformDataRef.current
  }, [])

  const getLastRecordingStats = useCallback((): RecordingStats => lastStatsRef.current, [])

  // Full cleanup on unmount — stop the warm stream too
  useEffect(() => {
    return () => {
      cleanupRecording()
      if (idleReleaseTimerRef.current) clearTimeout(idleReleaseTimerRef.current)
      if (warmStreamRef.current) {
        warmStreamRef.current.getTracks().forEach((track) => track.stop())
        warmStreamRef.current = null
      }
    }
  }, [cleanupRecording])

  return {
    state,
    startRecording,
    stopRecording,
    cancelRecording,
    getWaveformData,
    getLastRecordingStats
  }
}
