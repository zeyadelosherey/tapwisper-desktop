export const isMac = navigator.platform.toUpperCase().includes('MAC')

export function formatShortcutForDisplay(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => {
      const upper = part.toUpperCase()
      if (upper === 'FN') return '🌐'
      if (upper === 'COMMANDORCONTROL' || upper === 'CMDORCTRL') return isMac ? '⌘' : 'Ctrl'
      if (upper === 'CTRL' || upper === 'CONTROL') return isMac ? '⌃' : 'Ctrl'
      if (upper === 'CMD' || upper === 'COMMAND' || upper === 'META' || upper === 'SUPER')
        return isMac ? '⌘' : 'Super'
      if (upper === 'SHIFT') return isMac ? '⇧' : 'Shift'
      if (upper === 'ALT' || upper === 'OPTION') return isMac ? '⌥' : 'Alt'
      if (upper === 'SPACE') return 'Space'
      if (upper === 'ESCAPE') return 'Esc'
      if (upper === 'ENTER') return '↵'
      if (upper === 'BACKSPACE') return '⌫'
      if (upper === 'TAB') return '⇥'
      if (upper === 'MINUS') return '-'
      if (upper === 'EQUAL') return '='
      if (upper === 'BRACKETLEFT') return '['
      if (upper === 'BRACKETRIGHT') return ']'
      if (upper === 'BACKSLASH') return '\\'
      if (upper === 'SEMICOLON') return ';'
      if (upper === 'QUOTE') return "'"
      if (upper === 'BACKQUOTE') return '`'
      if (upper === 'COMMA') return ','
      if (upper === 'PERIOD') return '.'
      if (upper === 'SLASH') return '/'
      return part.toUpperCase()
    })
    .join(isMac ? '' : ' + ')
}

/**
 * Convert a DOM KeyboardEvent into an Electron accelerator string.
 */
export function keyEventToAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = []

  // At least one modifier is required
  const hasModifier = e.ctrlKey || e.metaKey || e.shiftKey || e.altKey
  if (!hasModifier) return null

  if (e.ctrlKey) parts.push('Ctrl')
  if (e.metaKey) parts.push('Command')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Option')

  const key = e.key
  const code = e.code

  if (['Control', 'Meta', 'Shift', 'Alt', 'OS'].includes(key)) return null
  if (
    ['ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight'].includes(
      code
    )
  )
    return null

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
