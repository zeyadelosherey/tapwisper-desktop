import { useEffect, useState } from 'react'

interface ShortcutState {
  isRecording: boolean
  recordingMode: 'push-to-talk' | 'toggle' | 'pinned' | null
}

/**
 * Hook for listening to global shortcut events from the main process
 */
export function useShortcuts(): ShortcutState {
  const [state, setState] = useState<ShortcutState>({
    isRecording: false,
    recordingMode: null
  })

  useEffect(() => {
    const unsubStart = window.tapwisper.on('recording:start', () => {
      setState((prev) => ({
        ...prev,
        isRecording: true
      }))
    })

    const unsubStop = window.tapwisper.on('recording:stop', () => {
      setState((prev) => ({
        ...prev,
        isRecording: false,
        recordingMode: null
      }))
    })

    const unsubCancel = window.tapwisper.on('recording:cancel', () => {
      setState((prev) => ({
        ...prev,
        isRecording: false,
        recordingMode: null
      }))
    })

    return () => {
      unsubStart()
      unsubStop()
      unsubCancel()
    }
  }, [])

  return state
}
