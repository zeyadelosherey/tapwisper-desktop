import { useState, useRef, useCallback, useEffect } from 'react'

// Module-level constants to avoid repeated allocations
const EMPTY_WAVEFORM: number[] = [0, 0, 0, 0, 0, 0, 0]
const IPC_THROTTLE_MS = 66 // ~15fps for IPC sends (visually sufficient for waveform)

const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    sampleRate: 16000,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true
  }
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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const waveformDataRef = useRef<number[]>(EMPTY_WAVEFORM)
  const isRecordingRef = useRef<boolean>(false)
  const lastIpcSendTimeRef = useRef<number>(0)

  // Waveform analysis loop — uses ref to avoid stale closure
  const updateWaveform = useCallback(() => {
    if (!analyserRef.current) return

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)

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
      window.tapwisper.window.send('recordingPill', 'waveform:data', newData)
      window.tapwisper.window.send('pinnedPanel', 'waveform:data', newData)
    }

    if (isRecordingRef.current) {
      animFrameRef.current = requestAnimationFrame(updateWaveform)
    }
  }, [])

  /**
   * Acquire (or re-acquire) a warm microphone stream. This keeps the mic
   * hardware "hot" so subsequent startRecording calls are near-instant.
   */
  const ensureWarmStream = useCallback(async (): Promise<MediaStream> => {
    // If we already have a live stream, reuse it
    const existing = warmStreamRef.current
    if (existing && existing.active && existing.getAudioTracks().every((t) => t.readyState === 'live')) {
      return existing
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
      const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
      warmStreamRef.current = stream

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

  const startRecording = useCallback(async (): Promise<void> => {
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
      animFrameRef.current = requestAnimationFrame(updateWaveform)
    } catch (error) {
      console.error('Failed to start recording:', error)
      throw new Error('Microphone access denied. Please allow microphone access.')
    }
  }, [updateWaveform, ensureWarmStream])

  // Warm up the mic on mount so the first recording is instant
  useEffect(() => {
    ensureWarmStream().catch(() => {
      // Mic permission will be requested when recording starts
    })
  }, [ensureWarmStream])

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve(null)
        return
      }

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        cleanupRecording()
        resolve(blob)
      }

      mediaRecorderRef.current.stop()
    })
  }, [])

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    cleanupRecording()
  }, [])

  /**
   * Clean up recording-specific resources but keep the warm mic stream alive
   * so the next recording starts instantly.
   */
  const cleanupRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
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

  // Full cleanup on unmount — stop the warm stream too
  useEffect(() => {
    return () => {
      cleanupRecording()
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
    getWaveformData
  }
}
