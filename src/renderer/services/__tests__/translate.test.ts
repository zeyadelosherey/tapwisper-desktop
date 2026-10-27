import { describe, it, expect, vi, beforeEach } from 'vitest'

const processText = vi.fn()
vi.mock('../ai-router', () => ({ processText: (...args: unknown[]) => processText(...args) }))

const { translateBatch, translateText } = await import('../translate')
const { postProcessTranscript } = await import('../dictation-pipeline')

beforeEach(() => {
  processText.mockReset()
})

describe('translateBatch', () => {
  it('maps numbered lines back to their passages', async () => {
    processText.mockResolvedValue({ result: '[2] Second\n[1] First', provider: 'x', model: 'y' })
    expect(await translateBatch(['Premier', 'Deuxième'], 'en')).toEqual(['First', 'Second'])
    expect(processText).toHaveBeenCalledTimes(1)
  })

  it('retries passages the model dropped one by one', async () => {
    processText
      .mockResolvedValueOnce({ result: '[1] First', provider: 'x', model: 'y' })
      .mockResolvedValueOnce({ result: 'Second', provider: 'x', model: 'y' })
    expect(await translateBatch(['Premier', 'Deuxième'], 'en')).toEqual(['First', 'Second'])
    expect(processText).toHaveBeenCalledTimes(2)
  })
})

describe('translateText', () => {
  it('names the target language in the instructions', async () => {
    processText.mockResolvedValue({ result: 'Hello', provider: 'x', model: 'y' })
    await translateText('مرحبا', 'en')
    expect(processText.mock.calls[0][0].prompt).toContain('English')
  })
})

describe('translated dictation', () => {
  it('translates and cleans up in a single request when Smart Formatting is on', async () => {
    processText.mockResolvedValue({ result: 'Send the report tomorrow.', provider: 'x', model: 'y' })
    const out = await postProcessTranscript(
      'يعني ابعت التقرير بكرة',
      {},
      { dictationTranslateTo: 'en', smartFormatting: true }
    )
    expect(out).toBe('Send the report tomorrow.')
    expect(processText).toHaveBeenCalledTimes(1)
    expect(processText.mock.calls[0][0].prompt).toContain('filler')
  })

  it('pastes the original when translation fails', async () => {
    processText.mockRejectedValue(new Error('network'))
    const out = await postProcessTranscript('ابعت التقرير', {}, { dictationTranslateTo: 'en' })
    expect(out).toBe('ابعت التقرير')
  })
})
