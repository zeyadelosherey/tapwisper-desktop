/**
 * Display helpers for the record shortcut. Three shapes:
 * - hold triggers: modifier keys held on their own — "Fn" (macOS Globe),
 *   chords like "Ctrl+Win" / "Ctrl+Option", or one right-hand key "RightControl"
 * - key combos: modifiers + a key, e.g. "Option+Space"
 */

export const OS = window.tapwisper.platform.os
export const IS_MAC = OS === 'darwin'

/** Default per platform — same as the main process (Wispr Flow's defaults on Mac/Windows) */
export const DEFAULT_RECORD_SHORTCUT = IS_MAC ? 'Fn' : OS === 'win32' ? 'Ctrl+Win' : 'RightControl'

/** A record-shortcut choice offered in the picker */
export interface ShortcutOption {
  value: string
  /** Hold trigger (hold to talk, + Space for hands-free) vs. classic key combo */
  hold: boolean
  recommended?: boolean
}

/**
 * Choices per platform. Windows skips Right Alt: on many layouts it is AltGr,
 * used to type characters such as € or @.
 */
export const SHORTCUT_OPTIONS: ShortcutOption[] = IS_MAC
  ? [
      { value: 'Fn', hold: true, recommended: true },
      { value: 'Ctrl+Option', hold: true },
      { value: 'RightCommand', hold: true },
      { value: 'Option+Space', hold: false }
    ]
  : OS === 'win32'
    ? [
        { value: 'Ctrl+Win', hold: true, recommended: true },
        { value: 'RightControl', hold: true },
        { value: 'RightShift', hold: true },
        { value: 'Alt+Space', hold: false }
      ]
    : [
        { value: 'RightControl', hold: true, recommended: true },
        { value: 'Ctrl+Super', hold: true },
        { value: 'RightShift', hold: true },
        { value: 'Alt+Space', hold: false }
      ]

const MODIFIER_TOKENS = new Set([
  'CTRL',
  'CONTROL',
  'ALT',
  'OPTION',
  'SHIFT',
  'CMD',
  'COMMAND',
  'META',
  'SUPER',
  'WIN',
  'WINDOWS',
  'COMMANDORCONTROL',
  'CMDORCTRL'
])

/** Hold triggers: fn, a single right-hand modifier, or 2+ modifiers with no other key */
export function isHoldShortcut(accelerator: string): boolean {
  const compact = accelerator.replace(/[\s_-]/g, '').toUpperCase()
  if (compact === 'FN' || compact === 'GLOBE' || singleKeyOf(accelerator)) return true
  const parts = accelerator.split('+').map((p) => p.trim().toUpperCase())
  return parts.length >= 2 && parts.every((p) => MODIFIER_TOKENS.has(p))
}

/** Same shortcut regardless of spelling ("Ctrl+Win" vs "Control+Windows") */
export function sameShortcut(a: string, b: string): boolean {
  const norm = (x: string): string =>
    x
      .split('+')
      .map((p) => p.trim().toUpperCase())
      .map((p) =>
        p === 'CONTROL'
          ? 'CTRL'
          : p === 'OPTION'
            ? 'ALT'
            : ['WIN', 'WINDOWS', 'SUPER', 'META', 'CMD', 'COMMAND'].includes(p)
              ? 'META'
              : p === 'GLOBE'
                ? 'FN'
                : p.replace(/[\s_-]/g, '')
      )
      .sort()
      .join('+')
  return norm(a) === norm(b)
}

/** One physical key as drawn on a keycap */
export interface KeyPart {
  /** Main legend, e.g. "⌥", "Space", "K" */
  glyph: string
  /** Small secondary legend (macOS-style modifier names), e.g. "option" */
  caption?: string
  /** Right-hand variant of a modifier */
  right?: boolean
  /** Wider key (Space, Enter…) */
  wide?: boolean
}

/** Single keys that can be held on their own for push-to-talk */
export type SingleKey = 'RightOption' | 'RightCommand' | 'RightControl' | 'RightShift'

const SINGLE_KEY_ALIASES: Record<string, SingleKey> = {
  RIGHTOPTION: 'RightOption',
  RIGHTALT: 'RightOption',
  RIGHTCOMMAND: 'RightCommand',
  RIGHTCONTROL: 'RightControl',
  RIGHTCTRL: 'RightControl',
  RIGHTSHIFT: 'RightShift'
}

/** The single push-to-talk key an accelerator names, or null for a key combo */
export function singleKeyOf(accelerator: string): SingleKey | null {
  return SINGLE_KEY_ALIASES[accelerator.replace(/[\s_-]/g, '').toUpperCase()] ?? null
}

function modifierPart(name: 'option' | 'command' | 'control' | 'shift'): KeyPart {
  if (IS_MAC) {
    const glyphs = { option: '⌥', command: '⌘', control: '⌃', shift: '⇧' }
    return { glyph: glyphs[name], caption: name }
  }
  const labels = {
    option: 'Alt',
    command: OS === 'win32' ? 'Win' : 'Super',
    control: 'Ctrl',
    shift: 'Shift'
  }
  return { glyph: labels[name] }
}

const NAMED_KEYS: Record<string, KeyPart> = {
  SPACE: { glyph: 'Space', wide: true },
  ENTER: { glyph: '↵', caption: 'return' },
  RETURN: { glyph: '↵', caption: 'return' },
  TAB: { glyph: '⇥', caption: 'tab' },
  BACKSPACE: { glyph: '⌫' },
  ESCAPE: { glyph: 'Esc' },
  ESC: { glyph: 'Esc' },
  MINUS: { glyph: '-' },
  EQUAL: { glyph: '=' },
  BRACKETLEFT: { glyph: '[' },
  BRACKETRIGHT: { glyph: ']' },
  BACKSLASH: { glyph: '\\' },
  SEMICOLON: { glyph: ';' },
  QUOTE: { glyph: "'" },
  BACKQUOTE: { glyph: '`' },
  COMMA: { glyph: ',' },
  PERIOD: { glyph: '.' },
  SLASH: { glyph: '/' }
}

function partFor(token: string): KeyPart {
  const upper = token.toUpperCase()
  switch (upper) {
    case 'COMMANDORCONTROL':
    case 'CMDORCTRL':
      return IS_MAC ? modifierPart('command') : modifierPart('control')
    case 'CMD':
    case 'COMMAND':
    case 'META':
    case 'SUPER':
    case 'WIN':
    case 'WINDOWS':
      return modifierPart('command')
    case 'CTRL':
    case 'CONTROL':
      return modifierPart('control')
    case 'ALT':
    case 'OPTION':
      return modifierPart('option')
    case 'SHIFT':
      return modifierPart('shift')
    case 'FN':
    case 'GLOBE':
      return { glyph: '🌐', caption: 'fn' }
  }
  if (NAMED_KEYS[upper]) return NAMED_KEYS[upper]
  return { glyph: token.length === 1 ? upper : token }
}

/** Keycaps for an accelerator */
export function shortcutParts(accelerator: string): KeyPart[] {
  const single = singleKeyOf(accelerator)
  if (single) {
    const base = {
      RightOption: 'option',
      RightCommand: 'command',
      RightControl: 'control',
      RightShift: 'shift'
    } as const
    return [{ ...modifierPart(base[single]), right: true }]
  }
  return accelerator
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
    .map(partFor)
}

/** Plain-text form, e.g. "⌥ Space" / "Alt + Space" / "Right ⌥" (right prefix supplied by caller) */
export function shortcutText(accelerator: string, rightLabel: (key: string) => string): string {
  return shortcutParts(accelerator)
    .map((p) => (p.right ? rightLabel(p.glyph) : p.glyph))
    .join(IS_MAC ? ' ' : ' + ')
}

/**
 * Convert a DOM KeyboardEvent into an Electron accelerator string.
 * Requires at least one modifier plus a non-modifier key.
 */
export function keyEventToAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = []

  const hasModifier = e.ctrlKey || e.metaKey || e.shiftKey || e.altKey
  if (!hasModifier) return null

  // Distinguish Ctrl and Cmd so shortcuts like Ctrl+Space work properly on macOS
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.metaKey) parts.push('Command')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Option')

  // e.code is the physical key regardless of the character the combo produces
  // (Option+Space gives e.key = '\u00A0' but e.code = 'Space').
  const key = e.key
  const code = e.code

  if (['Control', 'Meta', 'Shift', 'Alt', 'OS'].includes(key)) return null
  if (
    [
      'ControlLeft',
      'ControlRight',
      'MetaLeft',
      'MetaRight',
      'ShiftLeft',
      'ShiftRight',
      'AltLeft',
      'AltRight'
    ].includes(code)
  ) {
    return null
  }

  const codeMap: Record<string, string> = {
    Space: 'Space',
    Enter: 'Enter',
    NumpadEnter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Escape: 'Escape',
    Minus: 'Minus',
    Equal: 'Equal',
    BracketLeft: 'BracketLeft',
    BracketRight: 'BracketRight',
    Backslash: 'Backslash',
    Semicolon: 'Semicolon',
    Quote: 'Quote',
    Backquote: 'Backquote',
    Comma: 'Comma',
    Period: 'Period',
    Slash: 'Slash'
  }

  let keyName = codeMap[code]
  if (!keyName) {
    if (code.startsWith('Key')) {
      keyName = code.replace('Key', '')
    } else if (code.startsWith('Digit')) {
      keyName = code.replace('Digit', '')
    } else if (/^F\d{1,2}$/.test(code)) {
      keyName = code
    } else {
      return null
    }
  }

  parts.push(keyName)
  return parts.join('+')
}
