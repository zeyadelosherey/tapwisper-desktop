/**
 * Writing style applied by Smart Formatting, chosen per kind of app the
 * user is dictating into.
 */

export type StyleCategory = 'messages' | 'work' | 'email' | 'other'

export type StyleTone = 'formal' | 'casual' | 'very-casual'

export type WritingStyles = Record<StyleCategory, StyleTone>

export const DEFAULT_WRITING_STYLES: WritingStyles = {
  messages: 'casual',
  work: 'casual',
  email: 'formal',
  other: 'formal'
}

/** App-name fragments (lowercase) used to pick a style category */
const CATEGORY_APPS: Record<Exclude<StyleCategory, 'other'>, string[]> = {
  messages: ['whatsapp', 'messages', 'telegram', 'signal', 'messenger', 'discord', 'imessage', 'wechat', 'line'],
  work: ['slack', 'teams', 'notion', 'linear', 'jira', 'asana', 'clickup', 'zoom', 'figma', 'confluence', 'code', 'cursor', 'xcode', 'terminal', 'iterm', 'warp'],
  email: ['mail', 'outlook', 'gmail', 'spark', 'superhuman', 'thunderbird', 'airmail', 'hey']
}

export function categorizeApp(appName: string | undefined, windowTitle?: string): StyleCategory {
  const haystack = `${appName ?? ''} ${windowTitle ?? ''}`.toLowerCase()
  if (!haystack.trim()) return 'other'
  for (const category of ['email', 'messages', 'work'] as const) {
    if (CATEGORY_APPS[category].some((name) => haystack.includes(name))) return category
  }
  return 'other'
}
