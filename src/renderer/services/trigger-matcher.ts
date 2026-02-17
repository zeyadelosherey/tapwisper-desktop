import { compareTwoStrings } from 'string-similarity'
import type { Trigger, TriggerMatch } from '../models/trigger'

const SIMILARITY_THRESHOLD = 0.8

/**
 * Strip punctuation and extra whitespace that speech-to-text engines add.
 * e.g. "Ask Google." → "ask google", "Run the command!" → "run the command"
 */
function normalizeTranscription(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"()[\]{}…–—]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Match transcribed speech against configured triggers.
 * Returns the best match or null if no trigger matches.
 *
 * Strategy:
 * 1. Try start-of-input exact prefix match first (highest priority)
 * 2. Scan for the trigger phrase anywhere in the transcription.
 *    - Prefix triggers: text after the phrase → speechInput
 *    - Exact triggers: entire transcription → speechInput
 * 3. Fall back to fuzzy matching on the start of the input
 * 4. Longest matching trigger phrase wins (prevents "go" from matching over "google")
 */
export function matchTrigger(
  transcription: string,
  triggers: Trigger[]
): TriggerMatch | null {
  const input = normalizeTranscription(transcription)
  if (!input) return null

  const enabledTriggers = triggers.filter((t) => t.enabled)
  if (enabledTriggers.length === 0) return null

  let bestMatch: TriggerMatch | null = null
  let bestPhraseLength = 0

  for (const trigger of enabledTriggers) {
    const phrase = normalizeTranscription(trigger.triggerPhrase)
    if (!phrase) continue

    // 1. Try exact match at the start of input (highest priority)
    const exactResult = tryStartMatch(input, phrase, trigger, transcription)
    if (exactResult && phrase.length > bestPhraseLength) {
      bestMatch = exactResult
      bestPhraseLength = phrase.length
      continue
    }

    // 2. Scan for the phrase anywhere in the transcription
    const midResult = tryMidMatch(input, phrase, trigger, transcription)
    if (midResult && phrase.length > bestPhraseLength) {
      bestMatch = midResult
      bestPhraseLength = phrase.length
      continue
    }

    // 3. Fuzzy match on the start of input
    const fuzzyResult = tryFuzzyMatch(input, phrase, trigger, transcription)
    if (fuzzyResult && phrase.length > bestPhraseLength) {
      bestMatch = fuzzyResult
      bestPhraseLength = phrase.length
    }
  }

  return bestMatch
}

/**
 * Try matching the trigger phrase at the very start of the normalized input.
 */
function tryStartMatch(
  input: string,
  phrase: string,
  trigger: Trigger,
  originalTranscription: string
): TriggerMatch | null {
  if (trigger.triggerType === 'exact') {
    // Exact triggers pass the entire transcription to the action
    if (input === phrase || input.startsWith(phrase + ' ')) {
      return { trigger, speechInput: originalTranscription.trim(), prefixText: '' }
    }
    return null
  }

  // Prefix trigger: transcription must start with the trigger phrase
  if (input === phrase || input.startsWith(phrase + ' ')) {
    const phraseWordCount = phrase.split(/\s+/).length
    const originalWords = originalTranscription.trim().split(/\s+/)
    const speechInput = originalWords.slice(phraseWordCount).join(' ')
    return { trigger, speechInput, prefixText: '' }
  }

  return null
}

/**
 * Scan for the trigger phrase anywhere in the input.
 *
 * - Prefix triggers: text before the phrase → prefixText (injected as dictation),
 *   text after the phrase → speechInput (passed to the action handler).
 *   e.g. "so google about the movie" → prefixText "so", speechInput "about the movie"
 *
 * - Exact triggers: the entire transcription → speechInput, no prefixText.
 *   e.g. "Could you google about this?" → speechInput is the full sentence
 */
function tryMidMatch(
  input: string,
  phrase: string,
  trigger: Trigger,
  originalTranscription: string
): TriggerMatch | null {
  const inputWords = input.split(/\s+/)
  const phraseWords = phrase.split(/\s+/)
  const phraseWordCount = phraseWords.length

  // Slide through input words looking for an exact match of the phrase
  for (let i = 1; i <= inputWords.length - phraseWordCount; i++) {
    const slice = inputWords.slice(i, i + phraseWordCount).join(' ')
    if (slice === phrase) {
      if (trigger.triggerType === 'exact') {
        // Exact triggers pass the entire transcription to the action
        return { trigger, speechInput: originalTranscription.trim(), prefixText: '' }
      }

      // Prefix triggers split text around the trigger phrase
      const originalWords = originalTranscription.trim().split(/\s+/)
      const prefixText = originalWords.slice(0, i).join(' ')
      const speechInput = originalWords.slice(i + phraseWordCount).join(' ')
      return { trigger, speechInput, prefixText }
    }
  }

  return null
}

/**
 * Fuzzy match the trigger phrase against the first N words of the input.
 */
function tryFuzzyMatch(
  input: string,
  phrase: string,
  trigger: Trigger,
  originalTranscription: string
): TriggerMatch | null {
  const phraseWords = phrase.split(/\s+/)
  const inputWords = input.split(/\s+/)

  if (inputWords.length < phraseWords.length) return null

  // Take the same number of words from input as the phrase has
  const inputSlice = inputWords.slice(0, phraseWords.length).join(' ')
  const similarity = compareTwoStrings(inputSlice, phrase)

  if (similarity >= SIMILARITY_THRESHOLD) {
    if (trigger.triggerType === 'exact') {
      // Exact triggers pass the entire transcription to the action
      return { trigger, speechInput: originalTranscription.trim(), prefixText: '' }
    }

    const originalWords = originalTranscription.trim().split(/\s+/)
    const speechInput = originalWords.slice(phraseWords.length).join(' ')
    return { trigger, speechInput, prefixText: '' }
  }

  return null
}
