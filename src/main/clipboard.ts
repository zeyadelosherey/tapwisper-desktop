import { clipboard } from 'electron'
import { exec } from 'child_process'

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

export class ClipboardManager {
  private savedContent: string | null = null

  /**
   * Save current clipboard content for later restoration
   */
  saveClipboard(): void {
    this.savedContent = clipboard.readText()
  }

  /**
   * Restore previously saved clipboard content
   */
  restoreClipboard(): void {
    if (this.savedContent !== null) {
      clipboard.writeText(this.savedContent)
      this.savedContent = null
    }
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
   * Simulate Cmd+C / Ctrl+C (non-blocking).
   */
  private async simulateCopy(): Promise<void> {
    if (process.platform === 'darwin') {
      await execAsync(
        `osascript -e 'tell application "System Events" to keystroke "c" using command down'`
      )
    } else {
      await execAsync(
        `powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')"`
      )
    }
  }

  /**
   * Simulate Cmd+V / Ctrl+V (non-blocking).
   */
  private async simulatePaste(): Promise<void> {
    if (process.platform === 'darwin') {
      await execAsync(
        `osascript -e 'tell application "System Events" to keystroke "v" using command down'`
      )
    } else {
      await execAsync(
        `powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"`
      )
    }
  }

  /**
   * Grab selected text from any application:
   * 1. Save current clipboard
   * 2. Simulate Cmd/Ctrl+C (async, non-blocking)
   * 3. Poll clipboard until it changes (or timeout)
   * 4. Restore original clipboard
   */
  async grabSelectedText(): Promise<string> {
    // Save current clipboard
    this.saveClipboard()

    // Use a unique sentinel so we can detect when the copy actually lands
    const sentinel = `__tapwisper_sentinel_${Date.now()}__`
    clipboard.writeText(sentinel)

    // First copy attempt (non-blocking — event loop stays free)
    await this.simulateCopy()

    // Poll clipboard until it changes from the sentinel (copy landed)
    // Use longer timeout to handle large selections (full documents)
    const maxWaitMs = 850
    const pollIntervalMs = 25
    const retryAfterMs = 300
    let elapsed = 0
    let selectedText = ''
    let retried = false

    while (elapsed < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
      elapsed += pollIntervalMs
      const current = clipboard.readText()
      if (current !== sentinel) {
        selectedText = current
        break
      }

      // Retry the copy command once if the first attempt hasn't landed yet
      if (!retried && elapsed >= retryAfterMs) {
        retried = true
        await this.simulateCopy()
      }
    }

    // If clipboard still has the sentinel, no text was copied (nothing selected).
    // Also check for ANY sentinel pattern — concurrent calls can cause one call
    // to read another call's sentinel, which would falsely appear as selected text.
    if (selectedText === sentinel || /^__tapwisper_sentinel_\d+__$/.test(selectedText)) {
      selectedText = ''
    }

    // Restore original clipboard
    this.restoreClipboard()

    return selectedText
  }

  /**
   * Insert text into the active application by:
   * 1. Save current clipboard
   * 2. Write result text to clipboard
   * 3. Simulate Cmd/Ctrl+V (async, non-blocking)
   * 4. Restore original clipboard
   */
  async insertText(text: string): Promise<void> {
    // Save current clipboard
    this.saveClipboard()

    // Write text to clipboard
    clipboard.writeText(text)

    // Simulate paste (non-blocking)
    await this.simulatePaste()

    // Small delay then restore
    await new Promise((resolve) => setTimeout(resolve, 200))
    this.restoreClipboard()
  }
}
