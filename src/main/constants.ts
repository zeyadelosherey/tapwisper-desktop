/**
 * Shared constants for the main process.
 */

/** If held longer than this, it's push-to-talk mode */
export const HOLD_THRESHOLD_MS = 300

/**
 * Ignore toggle-stop for this duration after starting a recording. Only guards
 * against a double-delivered keystroke — key auto-repeat is filtered separately,
 * so this stays short enough that a quick tap-tap still stops the recording.
 */
export const START_GRACE_PERIOD_MS = 250

/** Cooldown after stopping to prevent immediately re-starting a new recording */
export const STOP_COOLDOWN_MS = 300

/** How long after transcription the shortcut opens the command popup instead of starting a new recording */
export const POST_RECORDING_TIMEOUT_MS = 30_000
