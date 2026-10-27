/**
 * Low-level capture for the meeting recorder: opening the two audio sources
 * and cutting each into self-contained chunks at natural pauses.
 */
import { microphoneConstraints } from './use-microphone'
import type { MeetingAudioState } from './use-meeting-recorder'

/** Don't cut a chunk before this much audio… */
export const MIN_CHUNK_MS = 18_000
/** …and always cut by this point, even mid-speech */
export const MAX_CHUNK_MS = 40_000
/** Level below which the stream counts as a pause (good place to cut) */
const SILENCE_RMS = 0.008
/** RMS above which audio counts as speech (for skipping silent chunks) */
const VOICE_RMS = 0.012
const TICK_MS = 100

export interface CapturedChunk {
  blob: Blob
  /** Recorded-time offsets (pauses excluded) */
  startMs: number
  endMs: number
  /** Time above the speech threshold — silent chunks aren't transcribed */
  voicedMs: number
}

function pickMimeType(): string {
  return MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm'
}

/**
 * Records one audio stream as a series of standalone chunks. MediaRecorder is
 * restarted for every chunk so each blob is a complete, decodable file.
 */
export class ChunkRecorder {
  private recorder: MediaRecorder | null = null
  private parts: Blob[] = []
  private chunkStartMs = 0
  private voicedMs = 0
  private ctx: AudioContext
  private analyser: AnalyserNode
  private buf: Float32Array<ArrayBuffer>
  private timer: ReturnType<typeof setInterval> | null = null
  private paused = false
  /** Chunk currently being finalized by a rotation (null when none) */
  private rotation: Promise<void> | null = null
  /** Latest level 0..1 (perceptual) for meters */
  level = 0

  constructor(
    private stream: MediaStream,
    /** Current recorded time (pauses excluded), ms */
    private clock: () => number,
    private onChunk: (chunk: CapturedChunk) => void
  ) {
    this.ctx = new AudioContext()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 1024
    // Analyse an audio-only copy (display streams also carried video)
    this.ctx
      .createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
      .connect(this.analyser)
    this.buf = new Float32Array(this.analyser.fftSize)
  }

  start(): void {
    this.beginChunk()
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  pause(): void {
    if (this.paused) return
    this.paused = true
    if (this.recorder?.state === 'recording') this.recorder.pause()
  }

  resume(): void {
    if (!this.paused) return
    this.paused = false
    if (this.recorder?.state === 'paused') this.recorder.resume()
  }

  /** Emit the final chunk and release the stream */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    // Let an in-flight rotation emit its chunk before the final one
    if (this.rotation) await this.rotation
    await this.endChunk()
    this.stream.getTracks().forEach((t) => t.stop())
    await this.ctx.close().catch(() => {})
  }

  private rms(): number {
    this.analyser.getFloatTimeDomainData(this.buf)
    let sum = 0
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i]
    return Math.sqrt(sum / this.buf.length)
  }

  private tick(): void {
    const rms = this.rms()
    this.level = Math.min(1, Math.sqrt(rms) * 1.6)
    if (this.paused) return
    if (rms >= VOICE_RMS) this.voicedMs += TICK_MS
    const length = this.clock() - this.chunkStartMs
    // Cut at a pause once the chunk is long enough, or force a cut
    if (this.rotation) return
    if ((length >= MIN_CHUNK_MS && rms < SILENCE_RMS) || length >= MAX_CHUNK_MS) {
      this.rotation = this.endChunk().then(() => {
        if (this.timer) this.beginChunk()
        this.rotation = null
      })
    }
  }

  private beginChunk(): void {
    const recorder = new MediaRecorder(new MediaStream(this.stream.getAudioTracks()), {
      mimeType: pickMimeType()
    })
    this.parts = []
    this.chunkStartMs = this.clock()
    this.voicedMs = 0
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.parts.push(e.data)
    }
    recorder.start(1000)
    if (this.paused) recorder.pause()
    this.recorder = recorder
  }

  private endChunk(): Promise<void> {
    const recorder = this.recorder
    if (!recorder || recorder.state === 'inactive') return Promise.resolve()
    this.recorder = null
    const startMs = this.chunkStartMs
    const voicedMs = this.voicedMs
    const parts = this.parts
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(parts, { type: recorder.mimeType || 'audio/webm' })
        const endMs = this.clock()
        if (blob.size > 0 && endMs - startMs > 500) {
          this.onChunk({ blob, startMs, endMs, voicedMs })
        }
        resolve()
      }
      recorder.stop()
    })
  }
}

/** Open the user's microphone ("You") */
export async function openMicrophone(): Promise<MediaStream> {
  const deviceId = ((await window.tapwisper.store.get('microphoneDeviceId').catch(() => '')) ||
    '') as string
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints(deviceId) })
  } catch (err) {
    if (deviceId && err instanceof DOMException && err.name === 'OverconstrainedError') {
      return navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints('') })
    }
    throw err
  }
}

/**
 * Open the meeting's audio ("Others"): system loopback via getDisplayMedia
 * (granted by the main process), or on Linux a PulseAudio/PipeWire
 * "Monitor of …" input. Never throws — returns the state instead.
 */
export async function openMeetingAudio(): Promise<{
  stream: MediaStream | null
  state: MeetingAudioState
}> {
  const enabled =
    (await window.tapwisper.store.get('captureMeetingAudio').catch(() => true)) !== false
  if (!enabled) return { stream: null, state: 'off' }

  const support = await window.tapwisper.meetings
    .systemAudioSupport()
    .catch(() => ({ supported: false, reason: 'unknown' }))

  if (!support.supported && support.reason === 'linux-use-monitor') {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const monitor = devices.find((d) => d.kind === 'audioinput' && /monitor/i.test(d.label))
      if (!monitor) return { stream: null, state: 'unavailable' }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: monitor.deviceId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      })
      return { stream, state: 'on' }
    } catch {
      return { stream: null, state: 'unavailable' }
    }
  }
  if (!support.supported) return { stream: null, state: 'unavailable' }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
    // Only the sound is needed — drop the screen video right away
    stream.getVideoTracks().forEach((t) => {
      t.stop()
      stream.removeTrack(t)
    })
    if (stream.getAudioTracks().length === 0) return { stream: null, state: 'unavailable' }
    return { stream, state: 'on' }
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    return { stream: null, state: name === 'NotAllowedError' ? 'denied' : 'unavailable' }
  }
}
