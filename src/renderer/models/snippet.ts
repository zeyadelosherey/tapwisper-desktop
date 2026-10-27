export interface Snippet {
  id: string
  trigger: string // e.g., "/addr"
  expansion: string // e.g., "123 Main Street, City, State 12345"
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Ways a trigger can come out of speech recognition: "/sig" is usually
 * transcribed as "slash sig" (often with trailing punctuation), and phrase
 * triggers ("my calendar link") can arrive with different capitalisation.
 */
function triggerPattern(trigger: string): RegExp {
  const t = trigger.trim()
  const alternatives = [escapeRegExp(t)]
  if (t.startsWith('/')) {
    const name = t.slice(1).replace(/[-_]+/g, ' ')
    alternatives.push(`slash\\s+${escapeRegExp(name).replace(/ /g, '\\s+')}`)
  }
  // Unicode-aware word boundaries; swallow trailing punctuation the STT added
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])[.!?]?`, 'giu')
}

/**
 * Find and expand snippet triggers in text
 */
export function expandSnippets(
  text: string,
  snippets: Pick<Snippet, 'trigger' | 'expansion'>[]
): string {
  let result = text
  // Longest triggers first so "/sig-long" isn't eaten by "/sig"
  const ordered = [...snippets]
    .filter((s) => s.trigger.trim())
    .sort((a, b) => b.trigger.length - a.trigger.length)
  for (const snippet of ordered) {
    result = result.replace(triggerPattern(snippet.trigger), () => snippet.expansion)
  }
  return result
}

/**
 * Validate snippet trigger format: either "/name" (letters, digits, - and _)
 * or a spoken phrase of at least two characters ("my calendar link").
 */
export function isValidTrigger(trigger: string): boolean {
  const t = trigger.trim()
  return /^\/[\p{L}\p{N}_-]+$/u.test(t) || /^[\p{L}\p{N}][\p{L}\p{N}' -]*[\p{L}\p{N}]$/u.test(t)
}

/**
 * Normalize a trigger for comparison (trimmed, case-insensitive)
 */
export function normalizeTrigger(trigger: string): string {
  return trigger.trim().toLowerCase()
}

/**
 * Find another snippet that already uses the same trigger (case-insensitive).
 * `excludeId` skips the snippet currently being edited.
 */
export function findDuplicateTrigger(
  trigger: string,
  snippets: Snippet[],
  excludeId?: string
): Snippet | undefined {
  const normalized = normalizeTrigger(trigger)
  if (!normalized) return undefined
  return snippets.find((s) => s.id !== excludeId && normalizeTrigger(s.trigger) === normalized)
}
