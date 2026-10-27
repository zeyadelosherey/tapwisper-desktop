/**
 * Personal dictionary: words the recognizer should get right.
 *
 * `term` is the correct spelling. It is sent to the voice provider as
 * vocabulary so recognition favours it. `aliases` are the wrong spellings the
 * recognizer tends to produce instead ("tap whisper", "tapwhisper"); they are
 * replaced with `term` after transcription.
 */
export interface DictionaryEntry {
  id: string
  term: string
  aliases: string[]
  createdAt: number
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replace every alias with its term (case-insensitive, whole words only).
 * Longer aliases win so "tap whisper app" isn't half-replaced by "tap".
 */
export function applyDictionary(text: string, entries: DictionaryEntry[] | undefined): string {
  if (!text || !entries?.length) return text
  const pairs = entries
    .flatMap((e) => e.aliases.map((alias) => ({ alias: alias.trim(), term: e.term })))
    .filter((p) => p.alias && p.term && p.alias.toLowerCase() !== p.term.toLowerCase())
    .sort((a, b) => b.alias.length - a.alias.length)

  let result = text
  for (const { alias, term } of pairs) {
    // \b fails next to non-Latin letters, so use Unicode-aware boundaries
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(alias)}(?![\\p{L}\\p{N}])`, 'giu')
    result = result.replace(pattern, term)
  }
  return result
}

/** Terms to bias recognition toward (sent as provider vocabulary / prompt). */
export function dictionaryTerms(entries: DictionaryEntry[] | undefined): string[] {
  return (entries ?? []).map((e) => e.term.trim()).filter(Boolean)
}
