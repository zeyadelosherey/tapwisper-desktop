import { clipboard } from 'electron'
import { exec } from 'child_process'
import { uIOhook, UiohookKey } from 'uiohook-napi'
import { waitForModifiersReleased } from './key-state'

/**
 * Promisified exec with a 3-second timeout to prevent hangs
 * if osascript/PowerShell stalls under heavy system load.
 */
function execAsync(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: 3000 }, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

/** Snapshot of the clipboard in every format we can faithfully restore. */
interface ClipboardSnapshot {
  text: string
  html: string
  rtf: string
  image: Electron.NativeImage | null
}

type ShortcutKey = 'c' | 'v'

const isWayland = process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland'

export class ClipboardManager {
  private snapshot: ClipboardSnapshot | null = null

  /**
   * Save current clipboard content (all formats) for later restoration
   */
  saveClipboard(): void {
    const image = clipboard.readImage()
    this.snapshot = {
      text: clipboard.readText(),
      html: clipboard.readHTML(),
      rtf: clipboard.readRTF(),
      image: image.isEmpty() ? null : image
    }
  }

  /**
   * Restore previously saved clipboard content.
   * If `onlyIfStillEquals` is given, skip restoring when the clipboard no longer
   * holds that text — the user copied something new in the meantime.
   */
  restoreClipboard(onlyIfStillEquals?: string): void {
    const snap = this.snapshot
    this.snapshot = null
    if (!snap) return
    if (onlyIfStillEquals !== undefined && clipboard.readText() !== onlyIfStillEquals) return

    if (!snap.html && !snap.rtf && !snap.image) {
      clipboard.writeText(snap.text)
      return
    }

    // A single write() so text, rich text and images all land together
    // (each clipboard write replaces everything that was there before)
    clipboard.write({
      text: snap.text,
      html: snap.html || undefined,
      rtf: snap.rtf || undefined,
      image: snap.image ?? undefined
    })
  }

  /**
   * Read current clipboard text
   */
  readText(): string {
    return clipboard.readText()
  }

  /**
   * Write text to clipboard
   */
  writeText(text: string): void {
    clipboard.writeText(text)
  }

  /**
   * Press Cmd/Ctrl + key in the focused app. Uses uiohook's in-process key
   * injection (no child process — ~0ms vs 150–800ms for osascript/PowerShell)
   * and falls back to a platform tool if injection is unavailable.
   */
  private async simulateShortcut(key: ShortcutKey, forceFallback = false): Promise<void> {
    await waitForModifiersReleased()

    if (!forceFallback && !isWayland) {
      try {
        const modifier = process.platform === 'darwin' ? UiohookKey.Meta : UiohookKey.Ctrl
        uIOhook.keyTap(key === 'c' ? UiohookKey.C : UiohookKey.V, [modifier])
        return
      } catch {
        // Fall through to the external tool
      }
    }

    if (process.platform === 'darwin') {
      await execAsync(
        `osascript -e 'tell application "System Events" to keystroke "${key}" using command down'`
      )
    } else if (process.platform === 'win32') {
      await execAsync(
        `powershell -NoProfile -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^${key}')"`
      )
    } else {
      // Linux: xdotool covers X11/XWayland, wtype covers native Wayland compositors
      try {
        await execAsync(`xdotool key --clearmodifiers ctrl+${key}`)
      } catch {
        await execAsync(`wtype -M ctrl -k ${key} -m ctrl`)
      }
    }
  }

  /**
   * Grab selected text from any application:
   * 1. Save current clipboard
   * 2. Simulate Cmd/Ctrl+C
   * 3. Poll clipboard until it changes (or timeout)
   * 4. Restore original clipboard
   */
  async grabSelectedText(): Promise<string> {
    this.saveClipboard()

    // Use a unique sentinel so we can detect when the copy actually lands
    const sentinel = `__tapwisper_sentinel_${Date.now()}__`
    clipboard.writeText(sentinel)

    let selectedText = ''
    try {
      await this.simulateShortcut('c')

      // Native apps answer within ~50ms, Electron/web apps within ~200ms.
      // If nothing is selected the clipboard never changes, so this timeout is
      // the cost paid on every plain dictation — keep it short.
      const maxWaitMs = 450
      const pollIntervalMs = 15
      const retryAfterMs = 220
      let elapsed = 0
      let retried = false

      while (elapsed < maxWaitMs) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
        elapsed += pollIntervalMs
        const current = clipboard.readText()
        if (current !== sentinel) {
          selectedText = current
          break
        }

        // Retry once through the external tool in case in-process injection was ignored
        if (!retried && elapsed >= retryAfterMs) {
          retried = true
          await this.simulateShortcut('c', true).catch(() => {})
        }
      }
    } catch {
      // Copy simulation failed entirely — treat as "nothing selected"
    }

    // Concurrent calls can read another call's sentinel — never treat it as a selection
    if (/^__tapwisper_sentinel_\d+__$/.test(selectedText)) {
      selectedText = ''
    }

    this.restoreClipboard()

    return selectedText
  }

  /**
   * Insert text into the active application by:
   * 1. Save current clipboard
   * 2. Write result text to clipboard
   * 3. Simulate Cmd/Ctrl+V
   * 4. Restore original clipboard
   */
  async insertText(text: string): Promise<void> {
    this.saveClipboard()

    clipboard.writeText(text)

    try {
      await this.simulateShortcut('v')
    } finally {
      // Give the target app time to read the clipboard before restoring it.
      // Electron/web apps read the paste asynchronously, so be generous.
      await new Promise((resolve) => setTimeout(resolve, 300))
      this.restoreClipboard(text)
    }
  }
}
