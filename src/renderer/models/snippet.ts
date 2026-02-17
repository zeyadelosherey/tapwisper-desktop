export interface Snippet {
  id: string
  trigger: string   // e.g., "/addr"
  expansion: string  // e.g., "123 Main Street, City, State 12345"
}

/**
 * Find and expand snippet triggers in text
 */
export function expandSnippets(text: string, snippets: Pick<Snippet, 'trigger' | 'expansion'>[]): string {
  let result = text
  for (const snippet of snippets) {
    if (result.includes(snippet.trigger)) {
      result = result.replaceAll(snippet.trigger, snippet.expansion)
    }
  }
  return result
}

/**
 * Validate snippet trigger format
 * Must start with / and be alphanumeric
 */
export function isValidTrigger(trigger: string): boolean {
  return /^\/[a-zA-Z0-9_-]+$/.test(trigger)
}
