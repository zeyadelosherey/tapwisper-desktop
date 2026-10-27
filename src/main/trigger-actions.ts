import { shell } from 'electron'
import { exec, execFile, spawn } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

const isMac = process.platform === 'darwin'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ── Web Search ──────────────────────────────────────────────────

export interface WebSearchParams {
  url: string
  browser: 'default' | 'safari' | 'chrome' | 'firefox'
}

export async function executeWebSearch(params: WebSearchParams): Promise<{ success: boolean; error?: string }> {
  try {
    const { url, browser } = params

    if (browser === 'default' || !isMac) {
      await shell.openExternal(url)
    } else {
      const browserApp = getBrowserAppName(browser)
      await execFileAsync('open', ['-a', browserApp, url])
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: errorMessage(err) }
  }
}

function getBrowserAppName(browser: string): string {
  switch (browser) {
    case 'safari': return 'Safari'
    case 'chrome': return 'Google Chrome'
    case 'firefox': return 'Firefox'
    default: return 'Safari'
  }
}

// ── Terminal Command ────────────────────────────────────────────

export interface TerminalParams {
  commands: string[]
  executionMode: 'background' | 'visual'
  speechInput?: string
}

export async function executeTerminal(params: TerminalParams): Promise<{ success: boolean; output?: string; error?: string }> {
  try {
    const { commands, executionMode, speechInput } = params

    // Replace $SPEECH_INPUT placeholder in commands and filter out empty commands
    const processedCommands = commands
      .map((cmd) => cmd.replace(/\$SPEECH_INPUT/g, speechInput || '').trim())
      .filter((cmd) => cmd.length > 0)

    if (processedCommands.length === 0) {
      return { success: false, error: 'No commands to execute' }
    }

    if (executionMode === 'visual' && process.platform === 'darwin') {
      // Open in Terminal.app
      const script = processedCommands.join(' && ')
      const escapedScript = script.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      await execAsync(`osascript -e 'tell application "Terminal" to do script "${escapedScript}"'`)
      return { success: true }
    }

    // Background execution
    const results: string[] = []
    for (const cmd of processedCommands) {
      const { stdout, stderr } = await execAsync(cmd, { timeout: 30000 })
      if (stdout) results.push(stdout.trim())
      if (stderr) results.push(stderr.trim())
    }

    return { success: true, output: results.join('\n') }
  } catch (err) {
    return { success: false, error: errorMessage(err) }
  }
}

// ── Keyboard Shortcut ───────────────────────────────────────────

export interface KeyboardParams {
  shortcut: string
  delay?: number
}

export async function executeKeyboard(params: KeyboardParams): Promise<{ success: boolean; error?: string }> {
  try {
    const { shortcut, delay } = params

    if (delay && delay > 0) {
      await new Promise((r) => setTimeout(r, delay))
    }

    if (process.platform === 'darwin') {
      // Use AppleScript to simulate keyboard shortcuts on macOS
      const keys = shortcut.split('+').map((k) => k.trim().toLowerCase())
      const appleScript = buildAppleScriptKeyStroke(keys)
      await execAsync(`osascript -e '${appleScript}'`)
    } else {
      // On other platforms, use xdotool (Linux) or PowerShell (Windows)
      if (process.platform === 'linux') {
        const xdoKey = convertToXdotoolKey(shortcut)
        await execAsync(`xdotool key ${xdoKey}`)
      } else if (process.platform === 'win32') {
        const psScript = convertToPowerShellKey(shortcut)
        await execAsync(`powershell -command "${psScript}"`)
      }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: errorMessage(err) }
  }
}

function buildAppleScriptKeyStroke(keys: string[]): string {
  const modifiers: string[] = []
  let mainKey = ''

  for (const key of keys) {
    switch (key) {
      case 'cmd': case 'command': case 'meta':
        modifiers.push('command down'); break
      case 'ctrl': case 'control':
        modifiers.push('control down'); break
      case 'alt': case 'option':
        modifiers.push('option down'); break
      case 'shift':
        modifiers.push('shift down'); break
      default:
        mainKey = key; break
    }
  }

  const modStr = modifiers.length > 0 ? ` using {${modifiers.join(', ')}}` : ''
  return `tell application "System Events" to keystroke "${mainKey}"${modStr}`
}

function convertToXdotoolKey(shortcut: string): string {
  return shortcut
    .replace(/cmd|command|meta/gi, 'super')
    .replace(/ctrl|control/gi, 'ctrl')
    .replace(/alt|option/gi, 'alt')
    .replace(/\+/g, '+')
}

function convertToPowerShellKey(shortcut: string): string {
  const keys = shortcut.split('+').map((k) => k.trim())
  return `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${keys.join('')}')`
}

// ── Apple Shortcut ──────────────────────────────────────────────

export interface AppleShortcutParams {
  shortcutName: string
  speechInput?: string
}

export async function executeAppleShortcut(params: AppleShortcutParams): Promise<{ success: boolean; output?: string; error?: string }> {
  try {
    if (process.platform !== 'darwin') {
      return { success: false, error: 'Apple Shortcuts are only available on macOS' }
    }

    const args = ['run', params.shortcutName]
    if (params.speechInput) {
      args.push('--input-text', params.speechInput)
    }

    const { stdout } = await execFileAsync('shortcuts', args, { timeout: 30000 })
    return { success: true, output: stdout?.trim() || '' }
  } catch (err) {
    return { success: false, error: errorMessage(err) }
  }
}

// ── Window Management ───────────────────────────────────────────

export interface WindowParams {
  action:
    | 'left-half' | 'right-half' | 'top-half' | 'bottom-half'
    | 'top-left-quarter' | 'top-right-quarter'
    | 'bottom-left-quarter' | 'bottom-right-quarter'
    | 'center' | 'maximize' | 'fullscreen'
}

export async function executeWindow(params: WindowParams): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isMac) {
      return { success: false, error: 'Window management actions are only supported on macOS' }
    }
    const lines = getWindowAppleScriptLines(params.action)
    if (!lines || lines.length === 0) return { success: false, error: `Unknown window action: ${params.action}` }
    const args = lines.flatMap((line) => ['-e', line])
    await execFileAsync('osascript', args)
    return { success: true }
  } catch (err) {
    return { success: false, error: errorMessage(err) }
  }
}

function getWindowAppleScriptLines(action: string): string[] {
  // Get screen dimensions from Finder desktop bounds using a proper tell block.
  // The one-liner "tell app to set {a,b,c,d} to ..." doesn't support destructuring —
  // a full tell/end tell block is required for list assignment to work.
  const screenBounds = [
    'tell application "Finder"',
    'set {x1, y1, sw, sh} to bounds of window of desktop',
    'end tell'
  ]
  const frontAppOpen = 'tell application "System Events" to tell (first process whose frontmost is true)'
  const endTell = 'end tell'

  const positionWindow = (x: string, y: string, w: string, h: string): string[] => [
    ...screenBounds,
    frontAppOpen,
    `set position of window 1 to {${x}, ${y}}`,
    `set size of window 1 to {${w}, ${h}}`,
    endTell
  ]

  switch (action) {
    case 'left-half':
      return positionWindow('0', '0', 'sw / 2', 'sh')

    case 'right-half':
      return positionWindow('sw / 2', '0', 'sw / 2', 'sh')

    case 'top-half':
      return positionWindow('0', '0', 'sw', 'sh / 2')

    case 'bottom-half':
      return positionWindow('0', 'sh / 2', 'sw', 'sh / 2')

    case 'top-left-quarter':
      return positionWindow('0', '0', 'sw / 2', 'sh / 2')

    case 'top-right-quarter':
      return positionWindow('sw / 2', '0', 'sw / 2', 'sh / 2')

    case 'bottom-left-quarter':
      return positionWindow('0', 'sh / 2', 'sw / 2', 'sh / 2')

    case 'bottom-right-quarter':
      return positionWindow('sw / 2', 'sh / 2', 'sw / 2', 'sh / 2')

    case 'center':
      return [
        ...screenBounds,
        'tell application "System Events"',
        'set frontApp to first process whose frontmost is true',
        'tell frontApp',
        'set {w, h} to size of window 1',
        'set position of window 1 to {(sw - w) / 2, (sh - h) / 2}',
        'end tell',
        'end tell'
      ]

    case 'maximize':
      return positionWindow('0', '0', 'sw', 'sh')

    case 'fullscreen':
      return [
        'tell application "System Events" to tell (first process whose frontmost is true) to set value of attribute "AXFullScreen" of window 1 to true'
      ]

    default:
      return []
  }
}

// ── Launch App ──────────────────────────────────────────────────

export interface LaunchAppParams {
  appPath: string
  appName: string
}

export async function executeLaunchApp(params: LaunchAppParams): Promise<{ success: boolean; error?: string }> {
  try {
    const appName = params.appName?.trim()

    if (params.appPath) {
      // openPath resolves with an error string instead of throwing
      const error = await shell.openPath(params.appPath)
      if (error) return { success: false, error }
    } else if (!appName) {
      return { success: false, error: 'No app path or name provided' }
    } else if (isMac) {
      await execFileAsync('open', ['-a', appName])
    } else if (process.platform === 'win32') {
      await launchWindowsAppByName(appName)
    } else if (process.platform === 'linux') {
      await launchLinuxAppByName(appName)
    } else {
      return { success: false, error: 'Launching apps by name is not supported on this platform' }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: errorMessage(err) }
  }
}

/**
 * Windows: `start "" "<name>"` resolves App Paths registrations (e.g.
 * "chrome", "winword") and anything on PATH, like the Run dialog does.
 */
async function launchWindowsAppByName(appName: string): Promise<void> {
  // Strip characters that are special to cmd.exe so the name can't break
  // out of its quotes.
  const safeName = appName.replace(/["^&|<>%!]/g, '')
  if (!safeName) throw new Error(`Invalid application name: ${appName}`)
  await execAsync(`start "" "${safeName}"`, { windowsHide: true })
}

/**
 * Linux: try the desktop entry via gtk-launch (e.g. "firefox",
 * "org.gnome.Nautilus"), then fall back to running a command of that name.
 */
async function launchLinuxAppByName(appName: string): Promise<void> {
  const candidates = Array.from(new Set([appName, appName.toLowerCase()]))
  for (const id of candidates) {
    try {
      await execFileAsync('gtk-launch', [id], { timeout: 10000 })
      return
    } catch {
      // Not a desktop entry id (or gtk-launch missing) — try the next option
    }
  }

  const command = appName.toLowerCase()
  if (!/^[\w.+-]+$/.test(command)) {
    throw new Error(`Could not find an application named "${appName}"`)
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [], { detached: true, stdio: 'ignore' })
    child.once('error', () => reject(new Error(`Could not find an application named "${appName}"`)))
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

// ── List Installed Apps (macOS) ─────────────────────────────────

export async function listInstalledApps(): Promise<{ name: string; path: string }[]> {
  try {
    if (process.platform !== 'darwin') return []

    const { stdout } = await execAsync(
      'ls /Applications /System/Applications /Applications/Utilities 2>/dev/null | grep "\\.app$" | sort -u'
    )

    const apps = stdout
      .split('\n')
      .filter(Boolean)
      .map((name) => ({
        name: name.replace('.app', ''),
        path: `/Applications/${name}`
      }))

    return apps
  } catch {
    return []
  }
}

// ── List Apple Shortcuts (macOS) ────────────────────────────────

export async function listAppleShortcuts(): Promise<string[]> {
  try {
    if (process.platform !== 'darwin') return []

    const { stdout } = await execFileAsync('shortcuts', ['list'], { timeout: 10000 })
    return stdout.split('\n').filter(Boolean)
  } catch {
    return []
  }
}
