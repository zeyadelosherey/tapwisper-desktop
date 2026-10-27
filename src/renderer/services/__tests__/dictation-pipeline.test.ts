import { describe, it, expect, vi, beforeEach } from 'vitest'

const processText = vi.fn()
vi.mock('../ai-router', () => ({ processText: (...args: unknown[]) => processText(...args) }))

const { postProcessTranscript, smartFormat } = await import('../dictation-pipeline')
const { categorizeApp } = await import('../../models/style')

const dictionary = [{ id: '1', term: 'TapWisper', aliases: ['tap whisper'], createdAt: 0 }]

beforeEach(() => {
  processText.mockReset()
})

describe('categorizeApp', () => {
  it('maps apps and browser titles to style categories', () => {
    expect(categorizeApp('WhatsApp')).toBe('messages')
    expect(categorizeApp('Slack')).toBe('work')
    expect(categorizeApp('Brave Browser', 'Inbox (3) - zeyad@gmail.com - Gmail')).toBe('email')
    expect(categorizeApp('Finder')).toBe('other')
    expect(categorizeApp(undefined)).toBe('other')
  })
})

describe('postProcessTranscript', () => {
  it('applies dictionary corrections without calling the LLM when formatting is off', async () => {
    const out = await postProcessTranscript('I use tap whisper daily', {}, { dictionary })
    expect(out).toBe('I use TapWisper daily')
    expect(processText).not.toHaveBeenCalled()
  })

  it('uses the tone for the target app', async () => {
    processText.mockResolvedValue({ result: 'hey, running late', provider: 'x', model: 'y' })
    await postProcessTranscript(
      'um hey so running late',
      { appName: 'WhatsApp' },
      { smartFormatting: true, writingStyles: { messages: 'very-casual' } }
    )
    expect(processText.mock.calls[0][0].systemInstruction).toContain('Very casual')
  })
})

describe('smartFormat safeguards', () => {
  it('keeps the original when the model answers instead of cleaning up', async () => {
    processText.mockResolvedValue({
      result: 'Sure! Here is a detailed answer to your question about the meeting time. '.repeat(3),
      provider: 'x',
      model: 'y'
    })
    expect(await smartFormat('what time is the meeting', 'formal')).toBe('what time is the meeting')
  })

  it('keeps the original when the LLM fails', async () => {
    processText.mockImplementation(async () => {
      throw new Error('No API key')
    })
    expect(await smartFormat('send the report today please', 'formal')).toBe(
      'send the report today please'
    )
  })

  it('skips very short text', async () => {
    expect(await smartFormat('okay thanks', 'formal')).toBe('okay thanks')
    expect(processText).not.toHaveBeenCalled()
  })

  it('falls back to the original text when formatting is too slow', async () => {
    vi.useFakeTimers()
    processText.mockReturnValue(new Promise(() => {}))
    const pending = smartFormat('please send the report today', 'formal')
    await vi.advanceTimersByTimeAsync(4100)
    expect(await pending).toBe('please send the report today')
    vi.useRealTimers()
  })
})
