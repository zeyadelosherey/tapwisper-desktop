import { shell } from 'electron'
import { exec, execFile } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

// ── Web Search ──────────────────────────────────────────────────

interface WebSearchParams {
  url: string
  browser: 'default' | 'safari' | 'chrome' | 'firefox'
}

export async function executeWebSearch(params: WebSearchParams): Promise<{ success: boolean; error?: string }> {
  try {
    const { url, browser } = params

    if (browser === 'default' || process.platform !== 'darwin') {
      await shell.openExternal(url)
    } else {
      const browserApp = getBrowserAppName(browser)
      await execAsync(`open -a "${browserApp}" "${url}"`)
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
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

interface TerminalParams {
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
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ── Keyboard Shortcut ───────────────────────────────────────────

interface KeyboardParams {
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
  } catch (err: any) {
    return { success: false, error: err.message }
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

interface AppleShortcutParams {
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
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ── Window Management ───────────────────────────────────────────

interface WindowParams {
  action:
    | 'left-half' | 'right-half' | 'top-half' | 'bottom-half'
    | 'top-left-quarter' | 'top-right-quarter'
    | 'bottom-left-quarter' | 'bottom-right-quarter'
    | 'center' | 'maximize' | 'fullscreen'
}

export async function executeWindow(params: WindowParams): Promise<{ success: boolean; error?: string }> {
  try {
    if (process.platform === 'darwin') {
      const lines = getWindowAppleScriptLines(params.action)
      if (!lines || lines.length === 0) return { success: false, error: `Unknown window action: ${params.action}` }
      const args = lines.flatMap((line) => ['-e', line])
      await execFileAsync('osascript', args)
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
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

interface LaunchAppParams {
  appPath: string
  appName: string
}

export async function executeLaunchApp(params: LaunchAppParams): Promise<{ success: boolean; error?: string }> {
  try {
    if (params.appPath) {
      await shell.openPath(params.appPath)
    } else if (params.appName && process.platform === 'darwin') {
      await execAsync(`open -a "${params.appName}"`)
    } else {
      return { success: false, error: 'No app path or name provided' }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
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
