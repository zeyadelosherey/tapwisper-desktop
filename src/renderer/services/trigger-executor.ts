import type {
  TriggerMatch,
  WebSearchConfig,
  AIChatConfig,
  TerminalConfig,
  KeyboardConfig,
  AppleShortcutConfig,
  WindowConfig,
  LaunchAppConfig,
  TriggerActionConfig
} from '../models/trigger'
import { buildSearchUrl } from '../models/trigger'
import { processText } from './ai-router'

export interface ExecutionResult {
  success: boolean
  output?: string
  error?: string
}

/**
 * Execute a matched trigger action.
 * Dispatches to the correct handler based on action type.
 */
export async function executeTrigger(match: TriggerMatch): Promise<ExecutionResult> {
  const { trigger, speechInput } = match
  const config = trigger.actionConfig

  try {
    switch (config.type) {
      case 'web-search':
        return await executeWebSearch(config, speechInput)
      case 'ai-chat':
        return await executeAIChat(config, speechInput)
      case 'terminal':
        return await executeTerminal(config, speechInput)
      case 'keyboard':
        return await executeKeyboard(config)
      case 'apple-shortcut':
        return await executeAppleShortcut(config, speechInput)
      case 'window':
        return await executeWindowAction(config)
      case 'launch-app':
        return await executeLaunchApp(config)
      default:
        return { success: false, error: `Unknown action type: ${(config as TriggerActionConfig).type}` }
    }
  } catch (err: any) {
    console.error('[TriggerExecutor] Execution failed:', err)
    return { success: false, error: err.message || 'Trigger execution failed' }
  }
}

async function executeWebSearch(config: WebSearchConfig, speechInput: string): Promise<ExecutionResult> {
  if (!speechInput) {
    return { success: false, error: 'No search query provided' }
  }

  const url = buildSearchUrl(config, speechInput)
  const result = await window.tapwisper.triggers.webSearch({ url, browser: config.browser })
  return result
}

async function executeAIChat(config: AIChatConfig, speechInput: string): Promise<ExecutionResult> {
  if (!speechInput) {
    return { success: false, error: 'No input provided for AI' }
  }

  // Always show loading state so the user sees feedback while AI is processing
  window.tapwisper.recordingPill.show()
  window.tapwisper.recordingPill.expand()
  window.tapwisper.window.send('recordingPill', 'result-panel:loading', { action: 'AI Chat' })

  try {
    const aiResult = await processText({
      prompt: speechInput,
      text: '',
      systemInstruction: config.systemPrompt || 'You are a helpful AI assistant. Respond to the user\'s request concisely.',
      providerOverride: config.provider,
      modelOverride: config.model || undefined
    })

    const result = aiResult.result || ''

    switch (config.responseHandling) {
      case 'inject':
        // Hide pill and overlays, then paste directly at cursor
        window.tapwisper.recordingPill.hide()
        window.tapwisper.window.hide('pinnedPanel')
        await new Promise((r) => setTimeout(r, 50))
        await window.tapwisper.clipboard.insertText(result)
        return { success: true, output: result }

      case 'clipboard':
        // Copy to clipboard and dismiss the pill
        await window.tapwisper.clipboard.write(result)
        window.tapwisper.recordingPill.hide()
        return { success: true, output: result }

      case 'modal':
      default:
        // Show result in RecordingPill — pill is already expanded from loading state above
        window.tapwisper.window.send('recordingPill', 'result-panel:result', {
          text: result,
          action: 'AI Chat'
        })
        return { success: true, output: result }
    }
  } catch (err: any) {
    // Show error in the pill for all modes since we always show the loading state
    window.tapwisper.window.send('recordingPill', 'result-panel:error', err.message || 'AI processing failed')
    return { success: false, error: err.message }
  }
}

async function executeTerminal(config: TerminalConfig, speechInput: string): Promise<ExecutionResult> {
  const result = await window.tapwisper.triggers.terminal({
    commands: config.commands,
    executionMode: config.executionMode,
    speechInput
  })

  if (result.success && config.showOutput && result.output) {
    // Show terminal output in the recording pill — expand so the result panel is visible
    window.tapwisper.recordingPill.show()
    window.tapwisper.recordingPill.expand()
    window.tapwisper.window.send('recordingPill', 'result-panel:result', {
      text: result.output,
      action: 'Terminal'
    })
  }

  return result
}

async function executeKeyboard(config: KeyboardConfig): Promise<ExecutionResult> {
  // Hide overlays first so the shortcut hits the correct window
  window.tapwisper.window.hide('pinnedPanel')
  window.tapwisper.recordingPill.hide()
  await new Promise((r) => setTimeout(r, 100))

  return await window.tapwisper.triggers.keyboard({
    shortcut: config.shortcut,
    delay: config.delay
  })
}

async function executeAppleShortcut(config: AppleShortcutConfig, speechInput: string): Promise<ExecutionResult> {
  return await window.tapwisper.triggers.appleShortcut({
    shortcutName: config.shortcutName,
    speechInput
  })
}

async function executeWindowAction(config: WindowConfig): Promise<ExecutionResult> {
  // Hide overlays first so the window action targets the user's window
  window.tapwisper.window.hide('pinnedPanel')
  window.tapwisper.recordingPill.hide()
  await new Promise((r) => setTimeout(r, 100))

  return await window.tapwisper.triggers.window({ action: config.action })
}

async function executeLaunchApp(config: LaunchAppConfig): Promise<ExecutionResult> {
  return await window.tapwisper.triggers.launchApp({
    appPath: config.appPath,
    appName: config.appName
  })
}
