import { describe, it, expect } from 'vitest'
import { downmix } from '../audio-convert'

describe('downmix', () => {
  it('averages channels and passes mono through', () => {
    const mono = new Float32Array([0.5])
    expect(downmix([mono])).toBe(mono)
    expect(Array.from(downmix([new Float32Array([1, 0]), new Float32Array([0, 0.5])]))).toEqual([
      0.5, 0.25
    ])
  })
})
