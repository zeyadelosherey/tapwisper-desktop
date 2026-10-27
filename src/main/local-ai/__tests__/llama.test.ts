import { describe, it, expect } from 'vitest'
import { llamaLaunch } from '../llama'
import type { RuntimeOptions } from '../sidecar'

function args(overrides: Partial<RuntimeOptions>): string[] {
  return llamaLaunch({
    binary: 'llama-server',
    modelFile: 'model.gguf',
    modelId: 'm',
    modelBytes: 1,
    useGpu: true,
    threads: 4,
    idleUnloadMs: 0,
    ...overrides
  }).args(8080)
}

describe('llamaLaunch', () => {
  it('keeps an audio projector on the CPU when the GPU is off', () => {
    const cpu = args({ mmprojFile: 'mmproj.gguf', useGpu: false })
    expect(cpu).toEqual(expect.arrayContaining(['--mmproj', 'mmproj.gguf', '--no-mmproj-offload']))
    expect(cpu[cpu.indexOf('-ngl') + 1]).toBe('0')
    expect(args({ mmprojFile: 'mmproj.gguf' })).not.toContain('--no-mmproj-offload')
    expect(args({ useGpu: false })).not.toContain('--mmproj')
  })
})
