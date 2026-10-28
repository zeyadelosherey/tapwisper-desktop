import { execFile } from 'child_process'
import { promisify } from 'util'
import { shell } from 'electron'

const run = promisify(execFile)

/**
 * What macOS itself does when fn/Globe is pressed (System Settings › Keyboard ›
 * "Press 🌐 key to"). Anything but 'nothing' fires alongside the fn record
 * shortcut, e.g. the input-source switcher on every press.
 */
export type FnKeyAction = 'nothing' | 'input-source' | 'emoji' | 'dictation' | 'unknown'

// com.apple.HIToolbox AppleFnUsageType values, by index
const ACTIONS: FnKeyAction[] = ['nothing', 'input-source', 'emoji', 'dictation']

/** Applies changed keyboard preferences without logging out */
const ACTIVATE_SETTINGS =
  '/System/Library/PrivateFrameworks/SystemAdministration.framework/Resources/activateSettings'

export async function getFnKeyAction(): Promise<FnKeyAction> {
  if (process.platform !== 'darwin') return 'nothing'
  try {
    const { stdout } = await run('defaults', ['read', 'com.apple.HIToolbox', 'AppleFnUsageType'])
    return ACTIONS[Number(stdout.trim())] ?? 'unknown'
  } catch {
    // Never changed: macOS picks emoji or the input-source switcher on its own
    return 'unknown'
  }
}

/** Set "Press 🌐 key to" to Do Nothing; false if macOS refused */
export async function setFnKeyDoNothing(): Promise<boolean> {
  if (process.platform !== 'darwin') return false
  try {
    await run('defaults', ['write', 'com.apple.HIToolbox', 'AppleFnUsageType', '-int', '0'])
  } catch {
    return false
  }
  await run(ACTIVATE_SETTINGS, ['-u']).catch(() => {})
  return (await getFnKeyAction()) === 'nothing'
}

export async function openKeyboardSettings(): Promise<void> {
  await shell.openExternal('x-apple.systempreferences:com.apple.Keyboard-Settings.extension')
}
