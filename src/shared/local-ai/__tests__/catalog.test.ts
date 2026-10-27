import { describe, it, expect } from 'vitest'
import {
  FAMILY_LABELS,
  MODEL_CATALOG,
  getModel,
  isInsecureKeyUse,
  isPrivateHost,
  localEngineCheck,
  normalizeBaseUrl,
  rateModel,
  recommendedModelId,
  stripThinking,
  supportsLanguages
} from '../catalog'
import type { DeviceProfile, LocalModelEntry } from '../types'

function profile(overrides: Partial<DeviceProfile> = {}): DeviceProfile {
  return {
    platform: 'darwin',
    arch: 'arm64',
    cpuModel: 'Apple M2',
    cpuCores: 8,
    totalRamGB: 16,
    freeDiskGB: 100,
    appleSilicon: true,
    emulated: false,
    gpuName: 'Apple M2',
    accel: 'metal',
    runtimes: {
      whisper: { available: true },
      parakeet: { available: true },
      llama: { available: true }
    },
    modelsDir: '/models',
    ...overrides
  }
}

const intelMac = profile({ arch: 'x64', appleSilicon: false, accel: 'cpu', totalRamGB: 8 })
const lowEndPc = profile({ platform: 'win32', arch: 'x64', accel: 'cpu', totalRamGB: 4 })
const rosetta = profile({ arch: 'x64', emulated: true })

function model(id: string): LocalModelEntry {
  const entry = getModel(id)
  if (!entry) throw new Error(`missing catalog entry ${id}`)
  return entry
}

describe('MODEL_CATALOG', () => {
  it('has unique ids, a complete source, a known family and licenses for every entry', () => {
    const ids = new Set(MODEL_CATALOG.map((m) => m.id))
    expect(ids.size).toBe(MODEL_CATALOG.length)
    for (const m of MODEL_CATALOG) {
      expect(m.source.repo).toMatch(/^[\w.-]+\/[\w.-]+$/)
      expect(Boolean(m.source.file) !== Boolean(m.source.quant?.length)).toBe(true)
      expect(FAMILY_LABELS[m.family]).toBeTruthy()
      expect(m.license && m.licenseUrl && m.learnMoreUrl).toBeTruthy()
      expect(m.minRamGB).toBeLessThanOrEqual(m.recommendedRamGB)
    }
  })

  it('runs speech models on a speech runtime and language models on llama.cpp', () => {
    for (const m of MODEL_CATALOG) {
      if (m.kind === 'llm') expect(m.runtime).toBe('llama')
      if (m.runtime === 'whisper' || m.runtime === 'parakeet') expect(m.kind).toBe('stt')
      // Audio models served by llama-server need their projector
      if (m.kind === 'stt' && m.runtime === 'llama') expect(m.source.mmproj).toBe(true)
    }
  })

  it('recommends only models that exist', () => {
    for (const p of [profile(), intelMac, lowEndPc, rosetta]) {
      for (const kind of ['stt', 'llm'] as const) {
        const id = recommendedModelId(kind, p)
        if (id) expect(getModel(id)?.kind).toBe(kind)
      }
    }
  })
})

describe('recommendedModelId', () => {
  it('scales with the hardware', () => {
    expect(recommendedModelId('stt', profile())).toBe('whisper-large-v3-turbo-q5')
    expect(recommendedModelId('llm', profile())).toBe('qwen3.5-4b')
    expect(recommendedModelId('stt', intelMac)).toBe('whisper-small-q5')
    expect(recommendedModelId('llm', intelMac)).toBe('qwen3.5-2b')
    expect(recommendedModelId('stt', lowEndPc)).toBe('whisper-base-q5')
    expect(recommendedModelId('llm', lowEndPc)).toBe('qwen3.5-0.8b')
    expect(recommendedModelId('llm', profile({ totalRamGB: 2, accel: 'cpu' }))).toBeNull()
  })

  it('treats an emulated build as slow even on fast hardware', () => {
    expect(recommendedModelId('stt', rosetta)).toBe('whisper-base-q5')
  })
})

describe('rateModel', () => {
  it('marks the recommended model', () => {
    expect(rateModel(model('qwen3.5-4b'), profile(), [], false)).toBe('recommended')
  })

  it('marks models whose program cannot start here', () => {
    const noParakeet = profile({
      runtimes: {
        whisper: { available: true },
        parakeet: { available: false, issue: 'blocked' },
        llama: { available: true }
      }
    })
    expect(rateModel(model('parakeet-tdt-0.6b-v3'), noParakeet, [], true)).toBe(
      'runtime-unavailable'
    )
    expect(rateModel(model('whisper-base'), noParakeet, [], true)).not.toBe('runtime-unavailable')
  })

  it('blocks models that do not fit in memory or on disk', () => {
    expect(rateModel(model('qwen3-8b'), lowEndPc, [], false)).toBe('insufficient-ram')
    expect(rateModel(model('gpt-oss-20b'), profile(), [], false)).toBe('slow')
    const fullDisk = profile({ freeDiskGB: 1 })
    expect(rateModel(model('whisper-large-v3-turbo'), fullDisk, [], false)).toBe(
      'insufficient-disk'
    )
    // Already on disk: free space no longer matters
    expect(rateModel(model('whisper-large-v3-turbo'), fullDisk, [], true)).not.toBe(
      'insufficient-disk'
    )
  })

  it('warns about heavy models without a GPU', () => {
    expect(rateModel(model('mistral-7b-v0.3'), profile({ accel: 'cpu' }), [], false)).toBe('slow')
    expect(rateModel(model('whisper-large-v3-q5'), intelMac, [], false)).toBe('slow')
  })

  it('flags English-only speech models for other or unknown languages', () => {
    const en = model('whisper-base-en')
    expect(rateModel(en, profile(), ['en'], false)).not.toBe('unsupported-language')
    expect(rateModel(en, profile(), ['ar'], false)).toBe('unsupported-language')
    expect(rateModel(en, profile(), ['ar', 'en'], false)).toBe('unsupported-language')
    expect(rateModel(en, profile(), [], false)).toBe('unsupported-language')
  })
})

describe('supportsLanguages', () => {
  it('handles models with a fixed list of languages', () => {
    const parakeet = model('parakeet-tdt-0.6b-v3')
    expect(supportsLanguages(parakeet, ['de', 'en'])).toBe(true)
    expect(supportsLanguages(parakeet, ['ar'])).toBe(false)
    // Auto-detect works when the model knows several languages
    expect(supportsLanguages(parakeet, [])).toBe(true)
    expect(supportsLanguages(model('whisper-base-en'), [])).toBe(false)
  })

  it('accepts regional codes', () => {
    expect(supportsLanguages(model('whisper-tiny-en'), ['en-US'])).toBe(true)
    expect(supportsLanguages(model('whisper-tiny'), ['ar', 'en'])).toBe(true)
  })
})

describe('stripThinking', () => {
  it('removes complete and dangling reasoning blocks', () => {
    expect(stripThinking('<think>\nhmm\n</think>\n\nHello there.')).toBe('Hello there.')
    expect(stripThinking('half a thought</think>Done.')).toBe('Done.')
    expect(stripThinking('No reasoning here.')).toBe('No reasoning here.')
    expect(stripThinking('<think>Okay, the user wants')).toBe('')
  })
})

describe('normalizeBaseUrl', () => {
  it('adds a scheme and strips trailing slashes and /v1', () => {
    expect(normalizeBaseUrl('localhost:11434')).toBe('http://localhost:11434')
    expect(normalizeBaseUrl('http://192.168.1.5:1234/v1/')).toBe('http://192.168.1.5:1234')
    expect(normalizeBaseUrl('https://ai.example.com/api/v1')).toBe('https://ai.example.com/api')
  })

  it('rejects empty and non-http input', () => {
    expect(normalizeBaseUrl('  ')).toBeNull()
    expect(normalizeBaseUrl('ftp://host')).toBeNull()
    expect(normalizeBaseUrl('http://')).toBeNull()
  })
})

describe('isPrivateHost / isInsecureKeyUse', () => {
  it('recognises local network hosts', () => {
    for (const host of ['localhost', '127.0.0.1', '10.0.0.2', '172.20.1.1', '192.168.0.9']) {
      expect(isPrivateHost(host)).toBe(true)
    }
    expect(isPrivateHost('100.101.1.2')).toBe(true)
    expect(isPrivateHost('nas.local')).toBe(true)
    expect(isPrivateHost('[::1]')).toBe(true)
    expect(isPrivateHost('172.32.0.1')).toBe(false)
    expect(isPrivateHost('8.8.8.8')).toBe(false)
    expect(isPrivateHost('fcbarcelona.com')).toBe(false)
  })

  it('only warns for a key sent over plain http to a public host', () => {
    expect(isInsecureKeyUse('http://example.com', 'sk-1')).toBe(true)
    expect(isInsecureKeyUse('https://example.com', 'sk-1')).toBe(false)
    expect(isInsecureKeyUse('http://192.168.1.2:8000', 'sk-1')).toBe(false)
    expect(isInsecureKeyUse('http://example.com', '')).toBe(false)
  })
})

describe('localEngineCheck', () => {
  it('is available when any program for the kind starts', () => {
    const onlyLlama = profile({
      runtimes: {
        whisper: { available: false, issue: 'missing-library' },
        parakeet: { available: false, issue: 'missing-library' },
        llama: { available: true }
      }
    })
    expect(localEngineCheck('stt', onlyLlama)).toEqual({ available: true })
    const none = profile({
      runtimes: {
        whisper: { available: false, issue: 'not-bundled' },
        parakeet: { available: false, issue: 'not-bundled' },
        llama: { available: false, issue: 'not-bundled' }
      }
    })
    expect(localEngineCheck('llm', none)).toEqual({ available: false, issue: 'not-bundled' })
  })
})
