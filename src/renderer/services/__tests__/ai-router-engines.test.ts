import { describe, it, expect, vi, beforeEach } from 'vitest'

const processWithGemini = vi.fn()
const transcribeWithWhisper = vi.fn()
const chatOnDevice = vi.fn()
const transcribeOnDevice = vi.fn()

vi.mock('../gemini', () => ({ processWithGemini: (...a: unknown[]) => processWithGemini(...a) }))
vi.mock('../together', () => ({}))
vi.mock('../openai', () => ({}))
vi.mock('../claude', () => ({}))
vi.mock('../soniox', () => ({}))
vi.mock('../whisper', () => ({
  transcribeWithWhisper: (...a: unknown[]) => transcribeWithWhisper(...a)
}))
vi.mock('../local-ai', () => ({
  chatOnDevice: (...a: unknown[]) => chatOnDevice(...a),
  transcribeOnDevice: (...a: unknown[]) => transcribeOnDevice(...a)
}))

let config: Record<string, unknown> = {}
vi.stubGlobal('window', {
  tapwisper: {
    store: {
      getAll: async () => config,
      get: async (key: string) => config[key]
    }
  }
})

const { processText, transcribeAudio, getMaxInputChars } = await import('../ai-router')
const audio = new Blob(['x'], { type: 'audio/webm' })

beforeEach(() => {
  vi.clearAllMocks()
  config = { apiKeys: { gemini: 'key', together: 'key' } }
})

describe('processText engines', () => {
  it('uses the cloud provider by default', async () => {
    processWithGemini.mockResolvedValue({ result: 'cloud', provider: 'gemini', model: 'g' })
    expect((await processText({ prompt: 'p', text: 't' })).result).toBe('cloud')
    expect(chatOnDevice).not.toHaveBeenCalled()
  })

  it('sends requests to a local model without needing an API key', async () => {
    config = { llmEngine: 'local', localModels: { llm: 'qwen3-1.7b' } }
    chatOnDevice.mockResolvedValue(' local answer ')
    const response = await processText({ prompt: 'p', text: 't', temperature: 0.2 })
    expect(response).toEqual({ result: 'local answer', provider: 'local', model: 'qwen3-1.7b' })
    expect(chatOnDevice).toHaveBeenCalledWith(
      'local',
      expect.objectContaining({ temperature: 0.2 })
    )
  })

  it('lets a trigger force a cloud provider', async () => {
    config = { ...config, llmEngine: 'self-hosted' }
    processWithGemini.mockResolvedValue({ result: 'cloud', provider: 'gemini', model: 'g' })
    await processText({ prompt: 'p', text: 't', providerOverride: 'gemini' })
    expect(processWithGemini).toHaveBeenCalled()
    expect(chatOnDevice).not.toHaveBeenCalled()
  })

  it('limits input size for small local context windows', async () => {
    expect(await getMaxInputChars()).toBe(120_000)
    config = { llmEngine: 'local' }
    expect(await getMaxInputChars()).toBeLessThan(30_000)
  })
})

describe('transcribeAudio engines', () => {
  it('passes language and vocabulary hints to a self-hosted server', async () => {
    config = {
      speechEngine: 'self-hosted',
      speechLanguages: ['ar'],
      dictionary: [{ term: 'TapWisper' }]
    }
    transcribeOnDevice.mockResolvedValue('مرحبا TapWisper')
    const result = await transcribeAudio(audio)
    expect(result).toMatchObject({
      text: 'مرحبا TapWisper',
      provider: 'self-hosted',
      language: 'ar'
    })
    expect(transcribeOnDevice).toHaveBeenCalledWith('self-hosted', audio, {
      language: 'ar',
      prompt: 'TapWisper'
    })
  })

  it('auto-detects when several languages are spoken', async () => {
    config = { speechEngine: 'local', speechLanguages: ['ar', 'en'] }
    transcribeOnDevice.mockResolvedValue('hello')
    await transcribeAudio(audio)
    expect(transcribeOnDevice.mock.calls[0][2].language).toBeUndefined()
  })

  it('still drops an echoed vocabulary prompt', async () => {
    config = { speechEngine: 'local', dictionary: [{ term: 'Kubernetes' }, { term: 'Zeyad' }] }
    transcribeOnDevice.mockResolvedValue('Kubernetes, Zeyad')
    expect((await transcribeAudio(audio)).text).toBe('')
  })

  it('keeps the cloud API key check for cloud providers', async () => {
    config = { voiceProvider: 'whisper', apiKeys: {} }
    await expect(transcribeAudio(audio)).rejects.toThrow(/API key/)
    expect(transcribeWithWhisper).not.toHaveBeenCalled()
  })
})
