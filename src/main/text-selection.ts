import { ClipboardManager } from './clipboard'

/**
 * Text selection handler for grabbing text from any application.
 * Uses clipboard simulation to capture selected text.
 */
export class TextSelectionManager {
  private clipboardManager: ClipboardManager
  private lastSelectedText: string = ''

  constructor(clipboardManager: ClipboardManager) {
    this.clipboardManager = clipboardManager
  }

  /**
   * Grab currently selected text from any application
   */
  async grabSelectedText(): Promise<string> {
    const text = await this.clipboardManager.grabSelectedText()
    if (text) {
      this.lastSelectedText = text
    }
    return text
  }

  /**
   * Get the last successfully grabbed text
   */
  getLastSelectedText(): string {
    return this.lastSelectedText
  }

  /**
   * Insert processed text back into the active application
   */
  async insertProcessedText(text: string): Promise<void> {
    await this.clipboardManager.insertText(text)
  }
}
