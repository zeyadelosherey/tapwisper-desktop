import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: {} }))
vi.mock('../../store', () => ({ getConfigValue: () => undefined }))

const { accelerationFor } = await import('../hardware')
type GpuInfo = import('../hardware').GpuInfo

const nvidia: GpuInfo = { name: 'NVIDIA GeForce RTX 4060', vendor: 'nvidia' }
const intelUhd: GpuInfo = { name: 'Intel(R) UHD Graphics 770', vendor: 'intel' }
const intelArc: GpuInfo = { name: 'Intel(R) Arc(TM) A770 Graphics', vendor: 'intel' }
const both = { metal: true, vulkan: true }

describe('accelerationFor', () => {
  it('uses Metal on Apple Silicon only', () => {
    expect(accelerationFor('darwin', { name: 'Apple M3', vendor: 'apple' }, both)).toBe('metal')
    expect(accelerationFor('darwin', intelUhd, { metal: false, vulkan: false })).toBe('cpu')
  })

  it('uses Vulkan on Windows and Linux for capable GPUs', () => {
    for (const platform of ['win32', 'linux'] as const) {
      expect(accelerationFor(platform, nvidia, both)).toBe('vulkan')
      expect(accelerationFor(platform, { name: 'AMD Radeon RX 7800', vendor: 'amd' }, both)).toBe(
        'vulkan'
      )
      expect(accelerationFor(platform, intelArc, both)).toBe('vulkan')
    }
  })

  it('stays on the CPU for integrated Intel graphics or a build without Vulkan', () => {
    expect(accelerationFor('win32', intelUhd, both)).toBe('cpu')
    expect(accelerationFor('linux', nvidia, { metal: false, vulkan: false })).toBe('cpu')
    expect(accelerationFor('linux', { name: null, vendor: null }, both)).toBe('cpu')
  })
})
