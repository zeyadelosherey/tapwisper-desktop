import { compareTwoStrings } from 'string-similarity'
import type { Trigger, TriggerMatch } from '../models/trigger'

/** Fuzzy threshold for a prefix trigger's phrase at the start of the input */
const PREFIX_SIMILARITY_THRESHOLD = 0.8
/** Exact triggers compare the whole utterance, so allow a little more slack for STT noise */
const EXACT_SIMILARITY_THRESHOLD = 0.85
/** Bigram similarity is meaningless for very short strings ("go" vs "so") */
const MIN_FUZZY_PHRASE_CHARS = 4

const SENTENCE_END = /[.!?؟。]$/

/**
 * Strip punctuation and extra whitespace that speech-to-text engines add.
 * e.g. "Ask Google." → "ask google", "Run the command!" → "run the command"
 */
function normalizeTranscription(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"()[\]{}…–—،؛؟]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Token {
  /** Word as spoken, with punctuation (used to rebuild speechInput / prefixText) */
  original: string
  /** Normalized word used for matching */
  norm: string
}

/**
 * Split into words, keeping the original and normalized form side by side so
 * indices always line up (punctuation-only tokens like "—" are dropped from both).
 */
function tokenize(text: string): Token[] {
  return text
    .trim()
    .split(/\s+/)
    .map((original) => ({ original, norm: normalizeTranscription(original) }))
    .filter((t) => t.norm.length > 0)
}

function joinOriginal(tokens: Token[]): string {
  return tokens.map((t) => t.original).join(' ')
}

/** Strip a leading "," / ":" etc. left over after removing the trigger phrase */
function cleanSpeechInput(text: string): string {
  return text.replace(/^[\s,.:;!?،؛\-–—]+/, '').trim()
}

/**
 * Match transcribed speech against configured triggers.
 * Returns the best match or null if no trigger matches.
 *
 * - Exact triggers ("phrase only"): the whole utterance must be the phrase.
 *   They run commands, keystrokes, window moves — they must never fire because
 *   the phrase happened to appear inside ordinary dictation.
 * - Prefix triggers ("phrase + speech"): the utterance starts with the phrase
 *   (exact or fuzzy). Mid-sentence use ("…so google the movie") is supported for
 *   multi-word phrases, or after a sentence break for single words, so that
 *   dictating "I'll google it later" doesn't launch a search.
 * - Longest matching phrase wins (prevents "go" from beating "google").
 */
export function matchTrigger(transcription: string, triggers: Trigger[]): TriggerMatch | null {
  const tokens = tokenize(transcription)
  if (tokens.length === 0) return null
  const input = tokens.map((t) => t.norm).join(' ')

  let bestMatch: TriggerMatch | null = null
  let bestScore = 0

  for (const trigger of triggers) {
    if (!trigger.enabled) continue
    const phrase = normalizeTranscription(trigger.triggerPhrase)
    if (!phrase) continue

    const result =
      trigger.triggerType === 'exact'
        ? matchExact(input, phrase, trigger, transcription)
        : matchPrefix(tokens, phrase, trigger)
    if (!result) continue

    // Prefer longer phrases; break ties in favour of exact (non-fuzzy) hits
    const score = phrase.length + (result.fuzzy ? 0 : 0.5)
    if (score > bestScore) {
      bestScore = score
      bestMatch = result.match
    }
  }

  return bestMatch
}

interface MatchResult {
  match: TriggerMatch
  fuzzy: boolean
}

function matchExact(
  input: string,
  phrase: string,
  trigger: Trigger,
  originalTranscription: string
): MatchResult | null {
  const speechInput = originalTranscription.trim()
  if (input === phrase) {
    return { match: { trigger, speechInput, prefixText: '' }, fuzzy: false }
  }
  if (
    phrase.length >= MIN_FUZZY_PHRASE_CHARS &&
    compareTwoStrings(input, phrase) >= EXACT_SIMILARITY_THRESHOLD
  ) {
    return { match: { trigger, speechInput, prefixText: '' }, fuzzy: true }
  }
  return null
}

function matchPrefix(tokens: Token[], phrase: string, trigger: Trigger): MatchResult | null {
  const phraseWords = phrase.split(' ')
  const n = phraseWords.length
  if (tokens.length < n) return null

  const sliceNorm = (start: number): string =>
    tokens
      .slice(start, start + n)
      .map((t) => t.norm)
      .join(' ')

  const build = (start: number, fuzzy: boolean): MatchResult => ({
    match: {
      trigger,
      prefixText: joinOriginal(tokens.slice(0, start)),
      speechInput: cleanSpeechInput(joinOriginal(tokens.slice(start + n)))
    },
    fuzzy
  })

  // 1. Phrase at the very start
  if (sliceNorm(0) === phrase) return build(0, false)

  // 2. Phrase mid-sentence — only where it plausibly starts a new command
  for (let i = 1; i <= tokens.length - n; i++) {
    if (sliceNorm(i) !== phrase) continue
    const afterSentenceBreak = SENTENCE_END.test(tokens[i - 1].original)
    if (n >= 2 || afterSentenceBreak) return build(i, false)
  }

  // 3. Fuzzy match at the start (STT misspellings like "googel")
  if (
    phrase.length >= MIN_FUZZY_PHRASE_CHARS &&
    compareTwoStrings(sliceNorm(0), phrase) >= PREFIX_SIMILARITY_THRESHOLD
  ) {
    return build(0, true)
  }

  return null
}
