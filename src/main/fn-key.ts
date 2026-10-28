/**
 * The macOS fn/Globe key has a system action of its own ("Press 🌐 key to:"
 * in System Settings → Keyboard). Unless it is "Do Nothing", holding fn to
 * dictate also switches the keyboard language, opens the emoji picker or
 * starts Apple Dictation. These helpers read that setting and turn it off.
 */

import { execFile } from 'child_process'
import { shell } from 'electron'
import type { FnKeyUsage } from '../shared/fn-key'

const DOMAIN = 'com.apple.HIToolbox'
const KEY = 'AppleFnUsageType'
const KEYBOARD_SETTINGS_URL = 'x-apple.systempreferences:com.apple.Keyboard-Settings.extension'

/** AppleFnUsageType values: 0 Do Nothing, 1 Change Input Source, 2 Emoji, 3 Dictation */
const USAGE_BY_VALUE: Record<string, FnKeyUsage> = {
  '0': 'nothing',
  '1': 'input-source',
  '2': 'emoji',
  '3': 'dictation'
}

function defaults(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/defaults', args, { timeout: 3000 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout.trim())
    })
  })
}

/** The fn/Globe key's own action ('nothing' off macOS) */
export async function getFnKeyUsage(): Promise<FnKeyUsage> {
  if (process.platform !== 'darwin') return 'nothing'
  try {
    return USAGE_BY_VALUE[await defaults(['read', DOMAIN, KEY])] ?? 'unknown'
  } catch {
    // Never set: the system default, which is one of the actions above
    return 'unknown'
  }
}

/**
 * Set "Press 🌐 key to" to Do Nothing, then open Keyboard settings so the
 * user sees the change (and can confirm it if the system kept the old value).
 */
export async function setFnKeyDoNothing(): Promise<FnKeyUsage> {
  if (process.platform !== 'darwin') return 'nothing'
  try {
    await defaults(['write', DOMAIN, KEY, '-int', '0'])
  } catch {
    // Fall through: the user can change it in System Settings
  }
  await shell.openExternal(KEYBOARD_SETTINGS_URL).catch(() => {})
  return getFnKeyUsage()
}
