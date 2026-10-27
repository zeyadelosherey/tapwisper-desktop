import { describe, it, expect } from 'vitest'
import { expandSnippets, isValidTrigger } from '../snippet'
import { applyDictionary } from '../dictionary'

describe('expandSnippets', () => {
  const snippets = [
    { trigger: '/sig', expansion: 'Best,\nZeyad' },
    { trigger: 'my calendar link', expansion: 'https://cal.com/zeyad' }
  ]

  it('expands the literal trigger', () => {
    expect(expandSnippets('Thanks /sig', snippets)).toBe('Thanks Best,\nZeyad')
  })

  it('expands the spoken "slash" form with trailing punctuation', () => {
    expect(expandSnippets('Thanks. Slash sig.', snippets)).toBe('Thanks. Best,\nZeyad')
  })

  it('expands phrase triggers case-insensitively, whole words only', () => {
    expect(expandSnippets('Here is My Calendar Link.', snippets)).toBe(
      'Here is https://cal.com/zeyad'
    )
    expect(expandSnippets('my calendar linking', snippets)).toBe('my calendar linking')
  })

  it('validates triggers', () => {
    expect(isValidTrigger('/sig')).toBe(true)
    expect(isValidTrigger('my calendar link')).toBe(true)
    expect(isValidTrigger('/')).toBe(false)
    expect(isValidTrigger('a')).toBe(false)
  })
})

describe('applyDictionary', () => {
  const entries = [
    { id: '1', term: 'TapWisper', aliases: ['tap whisper', 'tapwhisper'], createdAt: 0 },
    { id: '2', term: 'Saudia', aliases: ['Saudiya'], createdAt: 0 }
  ]

  it('replaces aliases with the correct term, case-insensitively', () => {
    expect(applyDictionary('I love Tap Whisper and tapwhisper', entries)).toBe(
      'I love TapWisper and TapWisper'
    )
  })

  it('works next to non-Latin text', () => {
    expect(applyDictionary('الطلب مع Saudiya وصل', entries)).toBe('الطلب مع Saudia وصل')
  })

  it('does not replace inside other words', () => {
    expect(applyDictionary('Saudiyas', entries)).toBe('Saudiyas')
  })
})
