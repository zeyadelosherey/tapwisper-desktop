import { globalShortcut, systemPreferences } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { uIOhook, UiohookKey, type UiohookKeyboardEvent } from 'uiohook-napi'
import { WindowManager } from './windows'
import { ClipboardManager } from './clipboard'
import { getStore } from './store'
import { bundledBinaryPath } from './bundled-binary'
import { trackKeyDown, trackKeyUp } from './key-state'
import { HOLD_THRESHOLD_MS, START_GRACE_PERIOD_MS, STOP_COOLDOWN_MS } from './constants'

let isRecording = false
let recordingMode: 'push-to-talk' | 'toggle' | null = null
let recordingStartTime = 0

// Track key state for push-to-talk and combo detection
let primaryKeyDown = false
let primaryKeyDownTime = 0
// True once a physical press of the record shortcut has been acted on, until
// that key is released. Windows delivers repeated hotkey events while a key is
// held, which would otherwise stop a push-to-talk recording mid-hold.
let pressConsumed = false

/** Tell the main window (onboarding shortcut test) whether the record key is held */
function broadcastShortcutState(pressed: boolean): void {
  windowManagerRef?.sendToWindow('main', 'shortcut:state', pressed)
}

let windowManagerRef: WindowManager | null = null

// The last dictation, for "AI Actions on last dictation" in the tray menu.
// The record shortcut itself always starts a new dictation.
let lastDictationText: string | null = null

// Current registered Electron accelerators (to unregister on reload)
let registeredElectronAccelerator: string | null = null

// ── Parsed shortcut configuration ─────────────────────────────────
/**
 * A record shortcut is either
 * - a combo: modifiers + one regular key (e.g. Option+Space), pressed like a
 *   normal hotkey (Electron globalShortcut consumes the keystroke), or
 * - a hold trigger: only modifier keys, held together with nothing else
 *   (Right Option, Ctrl+Win, Ctrl+Option), or the macOS fn/Globe key. Hold to
 *   talk; add Space while holding for hands-free (like Wispr Flow).
 */
interface ParsedShortcut {
  keycode: number
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  /** Hold trigger: each group lists interchangeable keycodes (e.g. left/right Ctrl) */
  holdGroups: number[][] | null
  /** Hold trigger driven by the macOS fn/Globe key (reported by the fn-monitor helper) */
  fn: boolean
}

/**
 * Single-key push-to-talk shortcuts. Right-hand modifiers are rarely used for
 * typing, so holding one alone is a comfortable, conflict-free trigger.
 */
const MODIFIER_GROUPS: Record<'ctrl' | 'alt' | 'meta' | 'shift', number[]> = {
  ctrl: [UiohookKey.Ctrl, UiohookKey.CtrlRight],
  alt: [UiohookKey.Alt, UiohookKey.AltRight],
  meta: [UiohookKey.Meta, UiohookKey.MetaRight],
  shift: [UiohookKey.Shift, UiohookKey.ShiftRight]
}
const ALL_MODIFIER_CODES = new Set(Object.values(MODIFIER_GROUPS).flat())

const MODIFIER_ONLY_KEYS: Record<string, number> = {
  RIGHTOPTION: UiohookKey.AltRight,
  RIGHTALT: UiohookKey.AltRight,
  RIGHTCOMMAND: UiohookKey.MetaRight,
  RIGHTCONTROL: UiohookKey.CtrlRight,
  RIGHTCTRL: UiohookKey.CtrlRight,
  RIGHTSHIFT: UiohookKey.ShiftRight
}

// Current active shortcuts (parsed from store strings)
let recordShortcut: ParsedShortcut | null = null

// ── Key name → UiohookKey mapping ─────────────────────────────────
const KEY_MAP: Record<string, number> = {
  // Letters
  A: UiohookKey.A,
  B: UiohookKey.B,
  C: UiohookKey.C,
  D: UiohookKey.D,
  E: UiohookKey.E,
  F: UiohookKey.F,
  G: UiohookKey.G,
  H: UiohookKey.H,
  I: UiohookKey.I,
  J: UiohookKey.J,
  K: UiohookKey.K,
  L: UiohookKey.L,
  M: UiohookKey.M,
  N: UiohookKey.N,
  O: UiohookKey.O,
  P: UiohookKey.P,
  Q: UiohookKey.Q,
  R: UiohookKey.R,
  S: UiohookKey.S,
  T: UiohookKey.T,
  U: UiohookKey.U,
  V: UiohookKey.V,
  W: UiohookKey.W,
  X: UiohookKey.X,
  Y: UiohookKey.Y,
  Z: UiohookKey.Z,
  // Numbers
  '0': UiohookKey['0'],
  '1': UiohookKey['1'],
  '2': UiohookKey['2'],
  '3': UiohookKey['3'],
  '4': UiohookKey['4'],
  '5': UiohookKey['5'],
  '6': UiohookKey['6'],
  '7': UiohookKey['7'],
  '8': UiohookKey['8'],
  '9': UiohookKey['9'],
  // Function keys
  F1: UiohookKey.F1,
  F2: UiohookKey.F2,
  F3: UiohookKey.F3,
  F4: UiohookKey.F4,
  F5: UiohookKey.F5,
  F6: UiohookKey.F6,
  F7: UiohookKey.F7,
  F8: UiohookKey.F8,
  F9: UiohookKey.F9,
  F10: UiohookKey.F10,
  F11: UiohookKey.F11,
  F12: UiohookKey.F12,
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
  const base = { keycode: 0, ctrl: false, shift: false, alt: false, meta: false }
  const compact = accelerator.replace(/[\s_-]/g, '').toUpperCase()
  if (compact === 'FN' || compact === 'GLOBE') {
    return process.platform === 'darwin' ? { ...base, holdGroups: null, fn: true } : null
  }
  const single = MODIFIER_ONLY_KEYS[compact]
  if (single !== undefined) {
    return { ...base, keycode: single, holdGroups: [[single]], fn: false }
  }

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
    } else if (
      upper === 'CMD' ||
      upper === 'COMMAND' ||
      upper === 'META' ||
      upper === 'SUPER' ||
      upper === 'WIN' ||
      upper === 'WINDOWS'
    ) {
      meta = true
    } else if (upper === 'SHIFT') {
      shift = true
    } else if (upper === 'ALT' || upper === 'OPTION') {
      alt = true
    } else {
      // Exactly one non-modifier key. Anything else (e.g. "Fn+Space", which
      // Electron can't register) would otherwise degrade to the bare key and
      // start a recording on every Space press.
      if (keyName) return null
      keyName = part
    }
  }

  if (!keyName) {
    // Modifiers only: a hold chord such as Ctrl+Win or Ctrl+Option (2+ keys;
    // a lone generic modifier would fire on ordinary shortcuts)
    const groups = (['ctrl', 'alt', 'meta', 'shift'] as const)
      .filter((m) => ({ ctrl, alt, meta, shift })[m])
      .map((m) => MODIFIER_GROUPS[m])
    if (groups.length < 2) return null
    return { ...base, ctrl, alt, meta, shift, holdGroups: groups, fn: false }
  }

  // Normalize key name: try uppercase, then as-is
  const keycode = KEY_MAP[keyName.toUpperCase()] ?? KEY_MAP[keyName]
  if (keycode === undefined) return null

  return { keycode, ctrl, shift, alt, meta, holdGroups: null, fn: false }
}

/**
 * Check whether a uiohook event matches a parsed shortcut (modifiers + key).
 */
function eventMatchesShortcut(
  e: { keycode: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean },
  shortcut: ParsedShortcut
): boolean {
  if (shortcut.holdGroups || shortcut.fn) return false // handled by the hold tracker
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

/**
 * Default record shortcut per platform: hold fn on macOS and Ctrl+Win on
 * Windows (as Wispr Flow does); Right Ctrl on Linux, where Super is taken by
 * the desktop. Used when nothing valid is stored.
 */
export function defaultRecordShortcut(): string {
  if (process.platform === 'darwin') return 'Fn'
  if (process.platform === 'win32') return 'Ctrl+Win'
  return 'RightControl'
}

/** Used when fn can't be watched (helper missing): Wispr's no-fn fallback */
const MAC_FN_FALLBACK = 'Ctrl+Option'

/** Whether a shortcut string can be used as the record shortcut */
export function isValidShortcut(accelerator: string): boolean {
  return parseShortcut(accelerator) !== null
}

function loadShortcutsFromStore(): void {
  const store = getStore()
  const shortcuts = store.get('shortcuts')

  recordShortcut = parseShortcut(shortcuts.record)
  if (!recordShortcut) {
    // Unparseable shortcut (e.g. a legacy "Fn+…" combo) — fall back to the default
    store.set('shortcuts', { ...shortcuts, record: defaultRecordShortcut() })
    recordShortcut = parseShortcut(defaultRecordShortcut())
  }
  if (recordShortcut?.fn && !fnMonitorAvailable()) {
    // fn can't be watched without the helper — behave like Ctrl+Option for now
    recordShortcut = parseShortcut(MAC_FN_FALLBACK)
  }
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

/** Called from IPC when the renderer finishes a dictation */
export function setLastDictation(text: string): void {
  lastDictationText = text || null
}

/** Open the AI actions popup on the last dictation (or the selected text) */
export function openActionsOnLastDictation(): void {
  windowManagerRef?.showCommandPopup(lastDictationText ?? undefined, {
    grabText: !lastDictationText
  })
}

/** Start dictation hands-free, or stop it — for the tray menu */
export function toggleDictation(): void {
  if (isRecording) {
    stopRecording()
  } else if (!isStartingRecording) {
    recordingMode = 'toggle'
    void startRecording()
  }
}

/**
 * Handle the record shortcut press: stop the recording, or start a new one.
 * It never opens anything else — the key always means "dictate".
 */
function handleRecordShortcutPress(): void {
  if (pressConsumed && primaryKeyDown) return // auto-repeat of the same press
  pressConsumed = true

  const sinceStart = Date.now() - recordingStartTime
  if (isRecording && sinceStart >= START_GRACE_PERIOD_MS) {
    stopRecording()
    return
  }

  if (!isRecording && !isStartingRecording) {
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

  // Hold triggers aren't Electron accelerators — the hold tracker handles them
  if (recordShortcut?.holdGroups || recordShortcut?.fn) return

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
  if (isRecording) {
    isRecording = false
    recordingMode = null
    lastStopTime = Date.now()
    windowManagerRef.sendToWindow('recordingPill', 'recording:cancel')
    windowManagerRef.sendToWindow('pinnedPanel', 'recording:cancel')
  }
  windowManagerRef.hideAllOverlays()
}

// ── Hold triggers (modifier chords, single right-hand keys, fn) ─────

const heldModifiers = new Set<number>()
/** A non-modifier key was pressed while modifiers were held (a key combo, not a trigger) */
let typedWhileModifiersHeld = false
let holdActive = false
let holdInterrupted = false

function holdSatisfied(groups: number[][]): boolean {
  if (typedWhileModifiersHeld) return false
  if (!groups.every((g) => g.some((code) => heldModifiers.has(code)))) return false
  // No extra modifiers beyond the trigger (Ctrl+Win+Shift is someone else's shortcut)
  const allowed = new Set(groups.flat())
  for (const code of heldModifiers) if (!allowed.has(code)) return false
  return true
}

/** Trigger fully held: start (or stop / open the action panel), like a hotkey press */
function onHoldStart(): void {
  holdActive = true
  holdInterrupted = false
  primaryKeyDown = true
  broadcastShortcutState(true)
  handleRecordShortcutPress()
}

/** Trigger released */
function onHoldEnd(): void {
  holdActive = false
  pressConsumed = false
  broadcastShortcutState(false)
  if (holdInterrupted) {
    holdInterrupted = false
    primaryKeyDown = false
    return
  }
  if (!primaryKeyDown) return
  primaryKeyDown = false
  if (isStartingRecording) {
    recordingMode = 'toggle'
    return
  }
  const holdDuration = Date.now() - primaryKeyDownTime
  if (isRecording && recordingMode === 'push-to-talk') {
    // Held: push-to-talk ends. Tapped: keep listening hands-free.
    if (holdDuration >= HOLD_THRESHOLD_MS) stopRecording()
    else recordingMode = 'toggle'
  }
}

/** Another key went down while the trigger was held */
function onHoldOtherKey(isSpace: boolean): void {
  if (holdInterrupted) return
  if (isSpace && isRecording) {
    // fn+Space / Ctrl+Win+Space: switch to hands-free; releasing won't stop it
    recordingMode = 'toggle'
    return
  }
  // A key combo (e.g. fn+←, Ctrl+Win+D): not dictation
  holdInterrupted = true
  if (isRecording && recordingMode === 'push-to-talk') cancelRecording()
}

function onModifierDown(keycode: number): void {
  heldModifiers.add(keycode)
  const groups = recordShortcut?.holdGroups
  if (!groups) return
  if (holdActive) {
    if (!groups.flat().includes(keycode)) onHoldOtherKey(false)
  } else if (holdSatisfied(groups)) {
    onHoldStart()
  }
}

function onModifierUp(keycode: number): void {
  heldModifiers.delete(keycode)
  if (heldModifiers.size === 0) typedWhileModifiersHeld = false
  const groups = recordShortcut?.holdGroups
  if (groups && holdActive && groups.flat().includes(keycode)) onHoldEnd()
}

// ── fn / Globe key (macOS helper) ─────────────────────────────────

let fnMonitor: ChildProcessWithoutNullStreams | null = null

function fnMonitorPath(): string {
  return bundledBinaryPath('fn-monitor')
}

/** Whether the fn/Globe shortcut can work here (macOS with the helper installed) */
export function fnMonitorAvailable(): boolean {
  return process.platform === 'darwin' && existsSync(fnMonitorPath())
}

/** Start the fn watcher (macOS) — it prints "down", "up" and "key <code>" lines */
function startFnMonitor(): void {
  if (fnMonitor || !fnMonitorAvailable()) return
  try {
    const child = spawn(fnMonitorPath(), [], { stdio: ['pipe', 'pipe', 'pipe'] })
    fnMonitor = child
    let buffer = ''
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        handleFnLine(buffer.slice(0, newline).trim())
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf('\n')
      }
    })
    child.on('exit', () => {
      if (fnMonitor === child) fnMonitor = null
      if (holdActive) onHoldEnd()
    })
  } catch {
    fnMonitor = null
  }
}

function stopFnMonitor(): void {
  if (!fnMonitor) return
  // Closing stdin tells the helper to exit
  fnMonitor.stdin.end()
  fnMonitor.kill()
  fnMonitor = null
}

const MAC_SPACE_KEYCODE = 49

function handleFnLine(line: string): void {
  if (!recordShortcut?.fn) return
  if (line === 'down') {
    if (!holdActive && heldModifiers.size === 0) onHoldStart()
  } else if (line === 'up') {
    if (holdActive) onHoldEnd()
  } else if (line.startsWith('key ') && holdActive) {
    onHoldOtherKey(Number(line.slice(4)) === MAC_SPACE_KEYCODE)
  }
}

// ── Hook listeners (stored for cleanup) ───────────────────────────
let keydownHandler: ((e: UiohookKeyboardEvent) => void) | null = null
let keyupHandler: ((e: UiohookKeyboardEvent) => void) | null = null

// ── Stop-recording trigger keys ──────────────────────────────────
// When recording in toggle mode, pressing any of these modifier keys
// alone will stop recording and trigger processing. This gives the
// user a quick, single-key way to finish recording.
const STOP_TRIGGER_KEYCODES = new Set<number>([
  UiohookKey.Alt, // Left Option (56)
  UiohookKey.AltRight, // Right Option (3640)
  UiohookKey.Ctrl, // Left Ctrl (29)
  UiohookKey.CtrlRight // Right Ctrl (3613)
])

// Track modifier-only taps: we only stop if the key is pressed and
// released quickly without any other key in between.
let stopTriggerKeyDown: number | null = null // keycode of the modifier currently held
let stopTriggerDownTime = 0 // when it was pressed
let otherKeyPressedDuringModifier = false // true if another key was pressed while modifier held
const MODIFIER_TAP_MAX_MS = 400 // max hold time to count as a "tap"

function attachHookListeners(_windowManager: WindowManager): void {
  keydownHandler = (e): void => {
    trackKeyDown(e.keycode)

    // ── Hold triggers (modifier chords / single right-hand keys) ──
    if (ALL_MODIFIER_CODES.has(e.keycode)) {
      if (!heldModifiers.has(e.keycode)) onModifierDown(e.keycode)
    } else {
      if (heldModifiers.size > 0) typedWhileModifiersHeld = true
      if (holdActive && recordShortcut?.holdGroups) {
        onHoldOtherKey(e.keycode === UiohookKey.Space)
        if (e.keycode === UiohookKey.Space) return
      }
    }

    // ── Record shortcut (e.g. Ctrl + Space) ──
    if (recordShortcut && eventMatchesShortcut(e, recordShortcut)) {
      if (!primaryKeyDown) {
        // First press (not a key repeat)
        primaryKeyDown = true
        broadcastShortcutState(true)
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
    if (
      isRecording &&
      recordingMode === 'toggle' &&
      STOP_TRIGGER_KEYCODES.has(e.keycode) &&
      !recordShortcut?.holdGroups?.flat().includes(e.keycode)
    ) {
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

    // ── Escape — Cancel the recording and dismiss overlays ──
    if (e.keycode === UiohookKey.Escape) {
      cancelRecording()
      return
    }
  }

  keyupHandler = (e): void => {
    trackKeyUp(e.keycode)

    if (ALL_MODIFIER_CODES.has(e.keycode)) {
      const wasHold = holdActive && !!recordShortcut?.holdGroups
      onModifierUp(e.keycode)
      if (wasHold) return
    }

    if (recordShortcut && !recordShortcut.holdGroups && e.keycode === recordShortcut.keycode) {
      pressConsumed = false
      broadcastShortcutState(false)
    }

    // ── Record key released — Handle push-to-talk stop ──
    if (
      recordShortcut &&
      !recordShortcut.holdGroups &&
      !recordShortcut.fn &&
      e.keycode === recordShortcut.keycode &&
      primaryKeyDown
    ) {
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

export function registerGlobalShortcuts(
  windowManager: WindowManager,
  _clipboardManager: ClipboardManager
): void {
  windowManagerRef = windowManager

  // Load shortcut config from store
  loadShortcutsFromStore()

  // On macOS, uiohook-napi requires accessibility permission to hook
  // keyboard events. If not granted yet, defer starting the hook until
  // the user grants permission through onboarding. Trying to start
  // uIOhook without the permission crashes the app.
  if (process.platform === 'darwin') {
    try {
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

  // fn/Globe isn't visible to uiohook on macOS — a small helper watches it
  if (recordShortcut?.fn) startFnMonitor()
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

  // Start/stop the fn watcher to match the new shortcut
  holdActive = false
  if (recordShortcut?.fn) startFnMonitor()
  else stopFnMonitor()
}

export function unregisterAllShortcuts(): void {
  stopFnMonitor()
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
