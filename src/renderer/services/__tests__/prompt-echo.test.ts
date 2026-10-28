import { describe, it, expect, vi } from 'vitest'

vi.mock('../gemini', () => ({}))
vi.mock('../together', () => ({}))
vi.mock('../openai', () => ({}))
vi.mock('../claude', () => ({}))
vi.mock('../whisper', () => ({}))
vi.mock('../soniox', () => ({}))

const { isPromptEcho, isNoiseTranscript } = await import('../ai-router')

describe('isNoiseTranscript', () => {
  it('flags what models make of silence or noise', () => {
    expect(isNoiseTranscript('ẙẙẙẙẙẙẙẙẙẙẙẙẙẙẙ')).toBe(true)
    expect(isNoiseTranscript('ẙ ẙ ẙ ẙ ẙ ẙ ẙ ẙ ẙ ẙ ẙ ẙ ẙ ẙ ẙ ẙ')).toBe(true)
    expect(isNoiseTranscript('ẙẙẙẙẙ')).toBe(true) // ẙ as y + ring
    expect(isNoiseTranscript('. . . .')).toBe(true)
    expect(isNoiseTranscript('...')).toBe(true)
    expect(isNoiseTranscript('you you you you you you you')).toBe(true)
  })

  it('keeps real dictation', () => {
    expect(isNoiseTranscript('Hello, how are you?')).toBe(false)
    expect(isNoiseTranscript('مرحبا كيف حالك')).toBe(false)
    expect(isNoiseTranscript('OK')).toBe(false)
    expect(isNoiseTranscript('no no no')).toBe(false)
    expect(isNoiseTranscript('The code is 11111')).toBe(false)
    expect(isNoiseTranscript('11111')).toBe(false)
    expect(isNoiseTranscript('')).toBe(false)
  })
})

describe('isPromptEcho', () => {
  const prompt = 'TapWisper, Kubernetes cluster, Zeyad, ask google'

  it('flags the prompt echoed back', () => {
    expect(isPromptEcho('TapWisper, Kubernetes cluster, Zeyad, ask google.', prompt)).toBe(true)
    expect(isPromptEcho('Kubernetes cluster, Zeyad', prompt)).toBe(true)
  })

  it('keeps a single vocabulary term the user really said', () => {
    expect(isPromptEcho('Kubernetes cluster', prompt)).toBe(false)
    expect(isPromptEcho('Zeyad', prompt)).toBe(false)
  })

  it('keeps normal dictation', () => {
    expect(isPromptEcho('Deploy the Kubernetes cluster for Zeyad today', prompt)).toBe(false)
  })
})
