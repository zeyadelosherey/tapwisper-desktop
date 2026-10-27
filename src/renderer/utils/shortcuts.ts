/**
 * Display helpers for the record shortcut (Electron-style accelerators such as
 * "Option+Space", or single push-to-talk keys such as "RightOption").
 */

export const OS = window.tapwisper.platform.os
export const IS_MAC = OS === 'darwin'

export const DEFAULT_RECORD_SHORTCUT = 'Option+Space'

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

/** Single-key options offered for this platform (mac keyboards rarely have a right Control) */
export const SINGLE_KEY_OPTIONS: SingleKey[] = IS_MAC
  ? ['RightOption', 'RightCommand', 'RightShift']
  : ['RightControl', 'RightOption', 'RightShift']

/** Recommended single key for this platform */
export const RECOMMENDED_SINGLE_KEY: SingleKey | null = IS_MAC ? null : 'RightControl'

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
      return { glyph: 'fn' }
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
