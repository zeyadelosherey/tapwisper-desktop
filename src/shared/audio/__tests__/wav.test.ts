import { describe, it, expect } from 'vitest'
import { encodeWav } from '../wav'

describe('encodeWav', () => {
  it('writes a 16 kHz mono 16-bit PCM header and clamped samples', () => {
    const bytes = encodeWav(new Float32Array([0, 1, -1, 2]), 16000)
    const view = new DataView(bytes.buffer)
    const text = (offset: number): string =>
      String.fromCharCode(...bytes.subarray(offset, offset + 4))

    expect(bytes.length).toBe(44 + 8)
    expect(text(0)).toBe('RIFF')
    expect(text(8)).toBe('WAVE')
    expect(text(36)).toBe('data')
    expect(view.getUint32(4, true)).toBe(36 + 8)
    expect(view.getUint16(20, true)).toBe(1) // PCM
    expect(view.getUint16(22, true)).toBe(1) // mono
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(8)
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([
      0, 32767, -32768, 32767
    ])
  })
})
