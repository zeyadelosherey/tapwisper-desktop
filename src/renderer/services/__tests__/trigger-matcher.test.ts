import { describe, it, expect } from 'vitest'
import { matchTrigger } from '../trigger-matcher'
import type { Trigger } from '../../models/trigger'

function trigger(phrase: string, type: 'exact' | 'prefix', id = phrase): Trigger {
  return {
    id,
    name: phrase,
    triggerPhrase: phrase,
    triggerType: type,
    actionType: 'web-search',
    actionConfig: { type: 'web-search', engine: 'google' },
    enabled: true,
    createdAt: 0
  } as unknown as Trigger
}

describe('matchTrigger — prefix triggers', () => {
  const google = trigger('google', 'prefix')

  it('matches at the start and passes the rest as input', () => {
    const m = matchTrigger('Google, the best pizza in town.', [google])
    expect(m?.speechInput).toBe('the best pizza in town.')
    expect(m?.prefixText).toBe('')
  })

  it('does not fire on a single-word phrase inside ordinary dictation', () => {
    expect(matchTrigger("I'll google it later.", [google])).toBeNull()
  })

  it('fires mid-sentence for a single word after a sentence break', () => {
    const m = matchTrigger('This is my movie. Google about the movie', [google])
    expect(m?.prefixText).toBe('This is my movie.')
    expect(m?.speechInput).toBe('about the movie')
  })

  it('fires mid-sentence for multi-word phrases', () => {
    const m = matchTrigger('so this is cool ask google about the movie', [
      trigger('ask google', 'prefix')
    ])
    expect(m?.prefixText).toBe('so this is cool')
    expect(m?.speechInput).toBe('about the movie')
  })

  it('keeps word indices aligned when the transcript has punctuation-only tokens', () => {
    const m = matchTrigger('Hello — ask google — weather today', [trigger('ask google', 'prefix')])
    expect(m?.prefixText).toBe('Hello')
    expect(m?.speechInput).toBe('weather today')
  })

  it('fuzzy-matches small STT misspellings at the start', () => {
    const m = matchTrigger('Googled the weather', [google])
    expect(m?.speechInput).toBe('the weather')
  })

  it('prefers the longest phrase', () => {
    const m = matchTrigger('google maps coffee near me', [
      google,
      trigger('google maps', 'prefix')
    ])
    expect(m?.trigger.triggerPhrase).toBe('google maps')
    expect(m?.speechInput).toBe('coffee near me')
  })

  it('ignores disabled triggers', () => {
    expect(matchTrigger('google cats', [{ ...google, enabled: false }])).toBeNull()
  })
})

describe('matchTrigger — exact triggers', () => {
  const build = trigger('run build command', 'exact')

  it('matches when the whole utterance is the phrase (punctuation/case ignored)', () => {
    expect(matchTrigger('Run build command.', [build])?.trigger).toBe(build)
  })

  it('never fires when the phrase is part of a longer sentence', () => {
    expect(matchTrigger('I need to run build command later today', [build])).toBeNull()
    expect(matchTrigger('run build command and then deploy', [build])).toBeNull()
  })

  it('tolerates a small STT error on the whole utterance', () => {
    expect(matchTrigger('Run built command', [build])?.trigger).toBe(build)
  })

  it('does not fuzzy-match very short phrases', () => {
    expect(matchTrigger('so', [trigger('go', 'exact')])).toBeNull()
  })
})
