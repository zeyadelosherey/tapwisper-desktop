/**
 * Tracks which modifier keys are physically held, fed by the uiohook
 * listeners in shortcuts.ts. Synthetic copy/paste keystrokes wait for the
 * user to release modifiers first — otherwise e.g. a still-held Option turns
 * Cmd+C into Cmd+Option+C, which many apps bind to something else.
 */

import { UiohookKey } from 'uiohook-napi'

const MODIFIER_KEYCODES = new Set<number>([
  UiohookKey.Shift,
  UiohookKey.ShiftRight,
  UiohookKey.Ctrl,
  UiohookKey.CtrlRight,
  UiohookKey.Alt,
  UiohookKey.AltRight,
  UiohookKey.Meta,
  UiohookKey.MetaRight
])

const heldModifiers = new Set<number>()

export function trackKeyDown(keycode: number): void {
  if (MODIFIER_KEYCODES.has(keycode)) heldModifiers.add(keycode)
}

export function trackKeyUp(keycode: number): void {
  heldModifiers.delete(keycode)
}

export function anyModifierHeld(): boolean {
  return heldModifiers.size > 0
}

/**
 * Resolve once no modifier is held, or after timeoutMs (a lost keyup event
 * must never block copy/paste forever).
 */
export async function waitForModifiersReleased(timeoutMs = 400): Promise<void> {
  const start = Date.now()
  while (heldModifiers.size > 0 && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
  if (heldModifiers.size > 0) heldModifiers.clear()
}
