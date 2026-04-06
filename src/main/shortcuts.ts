import { globalShortcut } from 'electron'
import { uIOhook, UiohookKey } from 'uiohook-napi'
import { WindowManager } from './windows'
import { ClipboardManager } from './clipboard'
import { getStore } from './store'
import {
  HOLD_THRESHOLD_MS,
  START_GRACE_PERIOD_MS,
  STOP_COOLDOWN_MS,
  POST_RECORDING_TIMEOUT_MS
} from './constants'

let isRecording = false
let recordingMode: 'push-to-talk' | 'toggle' | null = null
let recordingStartTime = 0

// Track key state for push-to-talk and combo detection
let primaryKeyDown = false
let primaryKeyDownTime = 0

let windowManagerRef: WindowManager | null = null

// ── Post-recording state ──────────────────────────────────────────
// After transcription completes, pressing the record shortcut opens the
// command popup instead of starting a new recording. This state auto-clears
// after POST_RECORDING_TIMEOUT_MS or when the user dismisses overlays.
let postRecordingActive = false
let postRecordingText: string | null = null
let postRecordingTimer: ReturnType<typeof setTimeout> | null = null

// Current registered Electron accelerators (to unregister on reload)
let registeredElectronAccelerator: string | null = null

// ── Parsed shortcut configuration ─────────────────────────────────
interface ParsedShortcut {
  keycode: number
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
}

// Current active shortcuts (parsed from store strings)
let recordShortcut: ParsedShortcut | null = null

// ── Key name → UiohookKey mapping ─────────────────────────────────
const KEY_MAP: Record<string, number> = {
  // Letters
  A: UiohookKey.A, B: UiohookKey.B, C: UiohookKey.C, D: UiohookKey.D,
  E: UiohookKey.E, F: UiohookKey.F, G: UiohookKey.G, H: UiohookKey.H,
  I: UiohookKey.I, J: UiohookKey.J, K: UiohookKey.K, L: UiohookKey.L,
  M: UiohookKey.M, N: UiohookKey.N, O: UiohookKey.O, P: UiohookKey.P,
  Q: UiohookKey.Q, R: UiohookKey.R, S: UiohookKey.S, T: UiohookKey.T,
  U: UiohookKey.U, V: UiohookKey.V, W: UiohookKey.W, X: UiohookKey.X,
  Y: UiohookKey.Y, Z: UiohookKey.Z,
  // Numbers
  '0': UiohookKey['0'], '1': UiohookKey['1'], '2': UiohookKey['2'],
  '3': UiohookKey['3'], '4': UiohookKey['4'], '5': UiohookKey['5'],
  '6': UiohookKey['6'], '7': UiohookKey['7'], '8': UiohookKey['8'],
  '9': UiohookKey['9'],
  // Function keys
  F1: UiohookKey.F1, F2: UiohookKey.F2, F3: UiohookKey.F3, F4: UiohookKey.F4,
  F5: UiohookKey.F5, F6: UiohookKey.F6, F7: UiohookKey.F7, F8: UiohookKey.F8,
  F9: UiohookKey.F9, F10: UiohookKey.F10, F11: UiohookKey.F11, F12: UiohookKey.F12,
  // Special keys
  Space: UiohookKey.Space,
  Enter: UiohookKey.Enter,
  Tab: UiohookKey.Tab,
  Backspace: UiohookKey.Backspace,
  Escape: UiohookKey.Escape,
  // Punctuation & symbols
  Minus: UiohookKey.Minus,
  Equal: UiohookKey.Equal,
  BracketLeft: UiohookKey.BracketLeft,
  BracketRight: UiohookKey.BracketRight,
  Backslash: UiohookKey.Backslash,
  Semicolon: UiohookKey.Semicolon,
  Quote: UiohookKey.Quote,
  Backquote: UiohookKey.Backquote,
  Comma: UiohookKey.Comma,
  Period: UiohookKey.Period,
  Slash: UiohookKey.Slash
}

/**
 * Parse an Electron-style accelerator string into a ParsedShortcut.
 * e.g. "CommandOrControl+Shift+L" → { keycode: UiohookKey.L, ctrl: true, shift: true, ... }
 * Supports: CommandOrControl, Ctrl, Cmd, Shift, Alt, Option, and key names.
 */
function parseShortcut(accelerator: string): ParsedShortcut | null {
  const parts = accelerator.split('+').map((p) => p.trim())
  let ctrl = false
  let shift = false
  let alt = false
  let meta = false
  let keyName = ''

  const isMac = process.platform === 'darwin'

  for (const part of parts) {
    const upper = part.toUpperCase()
    if (upper === 'COMMANDORCONTROL' || upper === 'CMDORCTRL') {
      if (isMac) meta = true
      else ctrl = true
    } else if (upper === 'CTRL' || upper === 'CONTROL') {
      ctrl = true
    } else if (upper === 'CMD' || upper === 'COMMAND' || upper === 'META' || upper === 'SUPER') {
      meta = true
    } else if (upper === 'SHIFT') {
      shift = true
    } else if (upper === 'ALT' || upper === 'OPTION') {
      alt = true
    } else {
      keyName = part
    }
  }

  if (!keyName) return null

  // Normalize key name: try uppercase, then as-is
  const keycode = KEY_MAP[keyName.toUpperCase()] ?? KEY_MAP[keyName]
  if (keycode === undefined) return null

  return { keycode, ctrl, shift, alt, meta }
}

/**
 * Check whether a uiohook event matches a parsed shortcut (modifiers + key).
 */
function eventMatchesShortcut(
  e: { keycode: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean },
  shortcut: ParsedShortcut
): boolean {
  if (e.keycode !== shortcut.keycode) return false

  if (shortcut.ctrl && !e.ctrlKey) return false
  if (shortcut.meta && !e.metaKey) return false
  if (shortcut.shift && !e.shiftKey) return false
  if (shortcut.alt && !e.altKey) return false

  // Also check that unexpected modifiers aren't held (for precision)
  if (!shortcut.ctrl && e.ctrlKey) return false
  if (!shortcut.meta && e.metaKey) return false
  if (!shortcut.shift && e.shiftKey) return false
  if (!shortcut.alt && e.altKey) return false

  return true
}

function loadShortcutsFromStore(): void {
  const store = getStore()
  const shortcuts = store.get('shortcuts')

  recordShortcut = parseShortcut(shortcuts.record)
}

/**
 * Convert our store shortcut string to Electron accelerator format.
 * e.g. "Option+Space" → "Alt+Space"
 * Electron uses "Alt" for Option on macOS.
 */
function toElectronAccelerator(shortcutStr: string): string {
  return shortcutStr
    .replace(/\bOption\b/gi, 'Alt')
    .replace(/\bCommand\b/gi, 'Cmd')
    .replace(/\bControl\b/gi, 'Ctrl')
}

function clearPostRecordingState(): void {
  postRecordingActive = false
  postRecordingText = null
  if (postRecordingTimer) {
    clearTimeout(postRecordingTimer)
    postRecordingTimer = null
  }
}

function openCommandPopup(): void {
  if (!windowManagerRef) return
  windowManagerRef.showCommandPopup(postRecordingText || undefined, {
    grabText: !postRecordingText
  })
  windowManagerRef.sendToWindow('recordingPill', 'post-recording:action-panel-opened')
  clearPostRecordingState()
}

/**
 * Called from IPC when the renderer finishes transcription.
 * Activates the post-recording window where the record shortcut
 * opens the command popup instead of starting a new recording.
 */
export function setPostRecordingState(text: string): void {
  clearPostRecordingState()
  postRecordingActive = true
  postRecordingText = text
  postRecordingTimer = setTimeout(clearPostRecordingState, POST_RECORDING_TIMEOUT_MS)
}

/**
 * Handle the record shortcut press. Routes to the correct action based on
 * current state: stop recording, open command popup, or start recording.
 */
function handleRecordShortcutPress(): void {
  const sinceStart = Date.now() - recordingStartTime
  if (isRecording && sinceStart >= START_GRACE_PERIOD_MS) {
    stopRecording()
    return
  }

  if (!isRecording && !isStartingRecording) {
    if (postRecordingActive) {
      openCommandPopup()
      return
    }

    const sinceLast = Date.now() - lastStopTime
    if (sinceLast >= STOP_COOLDOWN_MS) {
      primaryKeyDown = true
      recordingMode = 'push-to-talk'
      startRecording()
    }
  }
}

/**
 * Register Electron's globalShortcut to consume the keystroke
 * so it never reaches the focused application.
 * This prevents Option+Space from typing a non-breaking space.
 */
function registerElectronShortcut(): void {
  const store = getStore()
  const shortcuts = store.get('shortcuts')
  const accelerator = toElectronAccelerator(shortcuts.record)

  unregisterElectronShortcut()

  try {
    const registered = globalShortcut.register(accelerator, handleRecordShortcutPress)

    if (registered) {
      registeredElectronAccelerator = accelerator
    }
  } catch {
    // Shortcut registration may fail if the accelerator is already in use
  }
}

function unregisterElectronShortcut(): void {
  if (registeredElectronAccelerator) {
    try {
      globalShortcut.unregister(registeredElectronAccelerator)
    } catch {
      // May already be unregistered
    }
    registeredElectronAccelerator = null
  }
}

// ── Recording logic ───────────────────────────────────────────────

// Guard to prevent concurrent startRecording calls
let isStartingRecording = false

// Cooldown after stopping to prevent double-fire of globalShortcut
// immediately re-starting a new recording
let lastStopTime = 0

async function startRecording(): Promise<void> {
  if (!windowManagerRef || isRecording || isStartingRecording) return
  clearPostRecordingState()
  isStartingRecording = true
  recordingStartTime = Date.now()

  primaryKeyDownTime = Date.now()

  // Show UI and start recording IMMEDIATELY — zero delay for instant UX.
  // The panel is non-focusable so user's app keeps focus and selection stays active.
  // Selected text will be grabbed AFTER recording stops (during processing phase).
  isRecording = true
  isStartingRecording = false
  windowManagerRef.showPinnedPanel()
  windowManagerRef.sendToWindow('recordingPill', 'recording:start')
  windowManagerRef.sendToWindow('pinnedPanel', 'recording:start', '')
}

function stopRecording(): void {
  if (!windowManagerRef || !isRecording) return
  const mode = recordingMode // capture before clearing
  isRecording = false
  recordingMode = null
  lastStopTime = Date.now()

  windowManagerRef.sendToWindow('recordingPill', 'recording:stop')
  windowManagerRef.sendToWindow('pinnedPanel', 'recording:stop', mode)

  // Don't hide pill here — PinnedPanel will hide it after transcription completes
}

export function cancelRecording(): void {
  if (!windowManagerRef) return
  clearPostRecordingState()
  if (isRecording) {
    isRecording = false
    recordingMode = null
    lastStopTime = Date.now()
    windowManagerRef.sendToWindow('recordingPill', 'recording:cancel')
    windowManagerRef.sendToWindow('pinnedPanel', 'recording:cancel')
  }
  windowManagerRef.hideAllOverlays()
}

// ── Hook listeners (stored for cleanup) ───────────────────────────
let keydownHandler: ((e: any) => void) | null = null
let keyupHandler: ((e: any) => void) | null = null

// ── Stop-recording trigger keys ──────────────────────────────────
// When recording in toggle mode, pressing any of these modifier keys
// alone will stop recording and trigger processing. This gives the
// user a quick, single-key way to finish recording.
const STOP_TRIGGER_KEYCODES = new Set([
  UiohookKey.Alt,       // Left Option (56)
  UiohookKey.AltRight,  // Right Option (3640)
  UiohookKey.Ctrl,      // Left Ctrl (29)
  UiohookKey.CtrlRight  // Right Ctrl (3613)
])

// Track modifier-only taps: we only stop if the key is pressed and
// released quickly without any other key in between.
let stopTriggerKeyDown: number | null = null   // keycode of the modifier currently held
let stopTriggerDownTime = 0                     // when it was pressed
let otherKeyPressedDuringModifier = false       // true if another key was pressed while modifier held
const MODIFIER_TAP_MAX_MS = 400                 // max hold time to count as a "tap"

function attachHookListeners(_windowManager: WindowManager): void {
  keydownHandler = (e): void => {
    // ── Record shortcut (e.g. Ctrl + Space) ──
    if (recordShortcut && eventMatchesShortcut(e, recordShortcut)) {
      if (!primaryKeyDown) {
        // First press (not a key repeat)
        primaryKeyDown = true
        // Note: Electron's globalShortcut handles the keydown action (startRecording/stopRecording).
        // uiohook only tracks the key state for push-to-talk keyup detection.
        // If globalShortcut didn't register (fallback), handle it here.
        if (!registeredElectronAccelerator) {
          handleRecordShortcutPress()
        }
      }
      return
    }

    // ── Track modifier-only taps to stop recording ──
    if (isRecording && recordingMode === 'toggle' && STOP_TRIGGER_KEYCODES.has(e.keycode)) {
      if (stopTriggerKeyDown === null) {
        stopTriggerKeyDown = e.keycode
        stopTriggerDownTime = Date.now()
        otherKeyPressedDuringModifier = false
      }
      return
    }

    // If a modifier is held and another key is pressed, it's not a tap
    if (stopTriggerKeyDown !== null) {
      otherKeyPressedDuringModifier = true
    }

    // ── Escape — Dismiss overlays and post-recording state ──
    if (e.keycode === UiohookKey.Escape) {
      if (postRecordingActive) {
        clearPostRecordingState()
        if (windowManagerRef) windowManagerRef.hideAllOverlays()
        return
      }
      cancelRecording()
      return
    }
  }

  keyupHandler = (e): void => {
    // ── Record key released — Handle push-to-talk stop ──
    if (recordShortcut && e.keycode === recordShortcut.keycode && primaryKeyDown) {
      primaryKeyDown = false

      // If still starting (clipboard grab in progress), switch to toggle mode
      // so the user doesn't have to hold through the clipboard delay
      if (isStartingRecording) {
        recordingMode = 'toggle'
        return
      }

      const holdDuration = Date.now() - primaryKeyDownTime

      if (isRecording && recordingMode === 'push-to-talk') {
        if (holdDuration >= HOLD_THRESHOLD_MS) {
          stopRecording()
        } else {
          recordingMode = 'toggle'
        }
      }
      return
    }

    // ── Modifier-only tap to stop recording ──
    // If the user tapped Option, Ctrl, or Fn while recording in toggle mode,
    // stop recording and process. This is the quick single-key stop.
    if (stopTriggerKeyDown !== null && e.keycode === stopTriggerKeyDown) {
      const tapDuration = Date.now() - stopTriggerDownTime
      const wasTap = tapDuration < MODIFIER_TAP_MAX_MS && !otherKeyPressedDuringModifier
      stopTriggerKeyDown = null

      if (wasTap && isRecording && recordingMode === 'toggle') {
        stopRecording()
      }
      return
    }
  }

  uIOhook.on('keydown', keydownHandler)
  uIOhook.on('keyup', keyupHandler)
}

function detachHookListeners(): void {
  if (keydownHandler) {
    uIOhook.off('keydown', keydownHandler)
    keydownHandler = null
  }
  if (keyupHandler) {
    uIOhook.off('keyup', keyupHandler)
    keyupHandler = null
  }
}

// ── Public API ────────────────────────────────────────────────────

export function registerGlobalShortcuts(windowManager: WindowManager, _clipboardManager: ClipboardManager): void {
  windowManagerRef = windowManager

  // Load shortcut config from store
  loadShortcutsFromStore()

  // On macOS, uiohook-napi requires accessibility permission to hook
  // keyboard events. If not granted yet, defer starting the hook until
  // the user grants permission through onboarding. Trying to start
  // uIOhook without the permission crashes the app.
  if (process.platform === 'darwin') {
    try {
      const { systemPreferences } = require('electron')
      const trusted = systemPreferences.isTrustedAccessibilityClient(false)
      if (!trusted) {
        // Don't start the hook yet — it will be started later via
        // startShortcutsAfterPermission() once the user grants access.
        return
      }
    } catch {
      // If the check itself fails, try starting anyway
    }
  }

  startHookAndShortcuts()
}

/**
 * Internal: actually start the Electron globalShortcut + uiohook listeners.
 * Separated so it can be called both during init (if already permitted)
 * and later after the user grants accessibility permission.
 */
let hookStarted = false

function startHookAndShortcuts(): void {
  if (hookStarted) return
  hookStarted = true

  // Register Electron globalShortcut to CONSUME the keystroke
  // so it never reaches the focused app (prevents Option+Space from
  // typing a non-breaking space into Google Docs, etc.)
  registerElectronShortcut()

  // Attach uiohook listeners (for keyup detection — push-to-talk)
  if (windowManagerRef) {
    attachHookListeners(windowManagerRef)
  }

  // Start the low-level hook
  uIOhook.start()
}

/**
 * Called from IPC after the user grants accessibility permission
 * during onboarding. Starts the global shortcut hook that was
 * deferred because accessibility wasn't available at launch.
 */
export function startShortcutsAfterPermission(): void {
  if (!windowManagerRef) return

  // Re-check that accessibility is now granted
  if (process.platform === 'darwin') {
    try {
      const { systemPreferences } = require('electron')
      const trusted = systemPreferences.isTrustedAccessibilityClient(false)
      if (!trusted) return
    } catch {
      // Proceed anyway
    }
  }

  // Reload config (in case it changed) and start the hook
  loadShortcutsFromStore()
  startHookAndShortcuts()
}

/**
 * Re-register shortcuts after config change (called from IPC handler).
 */
export function reloadShortcuts(): void {
  if (!windowManagerRef) return

  // If the hook was never started (accessibility not granted yet), just reload config
  if (!hookStarted) {
    loadShortcutsFromStore()
    return
  }

  // Detach old listeners
  detachHookListeners()

  // Reload config from store
  loadShortcutsFromStore()

  // Re-register Electron globalShortcuts with new key combos
  registerElectronShortcut()

  // Attach new listeners
  attachHookListeners(windowManagerRef)
}

export function unregisterAllShortcuts(): void {
  unregisterElectronShortcut()
  globalShortcut.unregisterAll()
  detachHookListeners()
  if (hookStarted) {
    try {
      uIOhook.stop()
    } catch {
      // uiohook may already be stopped
    }
    hookStarted = false
  }
}

export function getRecordingState(): {
  isRecording: boolean
  mode: typeof recordingMode
} {
  return { isRecording, mode: recordingMode }
}
