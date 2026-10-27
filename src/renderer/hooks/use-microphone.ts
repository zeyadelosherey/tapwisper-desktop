import { useEffect, useRef, useState } from 'react'

export interface MicrophoneDevice {
  deviceId: string
  label: string
  /** Bluetooth mics are switched to low-quality call mode by the OS */
  isBluetooth: boolean
}

const BLUETOOTH_HINT = /airpods|bluetooth|\bbt\b|headset|buds|beats|bose|sony wh|jabra|hands-free/i

/** Audio input devices. Labels are only available once mic permission is granted. */
export async function listMicrophones(): Promise<MicrophoneDevice[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications')
    .map((d) => ({
      deviceId: d.deviceId === 'default' ? '' : d.deviceId,
      label: d.label || 'Microphone',
      isBluetooth: BLUETOOTH_HINT.test(d.label)
    }))
}

/** getUserMedia constraints for the configured device ('' = system default) */
export function microphoneConstraints(deviceId: string | undefined): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
}

/** Keep the device list fresh as mics are plugged in / out */
export function useMicrophones(): { devices: MicrophoneDevice[]; refresh: () => void } {
  const [devices, setDevices] = useState<MicrophoneDevice[]>([])
  const refresh = (): void => {
    listMicrophones()
      .then(setDevices)
      .catch(() => setDevices([]))
  }
  useEffect(() => {
    refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh)
  }, [])
  return { devices, refresh }
}

export interface MicLevelState {
  /** Recent input levels 0..1, oldest first (length = `bars`) */
  levels: number[]
  /** Current level 0..1 */
  level: number
  /** Set when the mic can't be opened (permission denied, device missing…) */
  error: string | null
}

/**
 * Live input level for a mic test. Opens the device only while `active`,
 * and releases it on stop/unmount so the OS mic indicator turns off.
 */
export function useMicLevel(deviceId: string, active: boolean, bars = 13): MicLevelState {
  const [state, setState] = useState<MicLevelState>({
    levels: Array(bars).fill(0),
    level: 0,
    error: null
  })
  const historyRef = useRef<number[]>(Array(bars).fill(0))

  useEffect(() => {
    if (!active) return
    let cancelled = false
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let raf = 0

    navigator.mediaDevices
      .getUserMedia({ audio: microphoneConstraints(deviceId) })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        ctx = new AudioContext()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        ctx.createMediaStreamSource(s).connect(analyser)
        const buf = new Float32Array(analyser.fftSize)
        let lastPush = 0

        const tick = (now: number): void => {
          analyser.getFloatTimeDomainData(buf)
          let sum = 0
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
          // Perceptual scaling: speech RMS ~0.02–0.2 → ~0.35–1
          const level = Math.min(1, Math.sqrt(Math.sqrt(sum / buf.length)) * 1.6)
          if (now - lastPush > 70) {
            lastPush = now
            historyRef.current = [...historyRef.current.slice(1), level]
            setState({ levels: historyRef.current, level, error: null })
          }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      })
      .catch((err: unknown) => {
        const name = err instanceof DOMException ? err.name : ''
        const error =
          name === 'NotAllowedError'
            ? 'permission-denied'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'not-found'
              : name === 'NotReadableError'
                ? 'in-use'
                : 'unknown'
        if (!cancelled) setState((s) => ({ ...s, error }))
      })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      ctx?.close().catch(() => {})
      historyRef.current = Array(bars).fill(0)
      setState({ levels: Array(bars).fill(0), level: 0, error: null })
    }
  }, [deviceId, active, bars])

  return state
}
