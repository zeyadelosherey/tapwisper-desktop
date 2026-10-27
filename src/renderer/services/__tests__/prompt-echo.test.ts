import { describe, it, expect, vi } from 'vitest'

vi.mock('../gemini', () => ({}))
vi.mock('../together', () => ({}))
vi.mock('../openai', () => ({}))
vi.mock('../claude', () => ({}))
vi.mock('../whisper', () => ({}))
vi.mock('../soniox', () => ({}))

const { isPromptEcho } = await import('../ai-router')

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
