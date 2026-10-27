import { describe, it, expect, vi } from 'vitest'

// Keep the test independent of Electron and the native key hook
vi.mock('electron', () => ({ app: {}, globalShortcut: {}, systemPreferences: {} }))
vi.mock('uiohook-napi', async () => {
  const keys = new Proxy({} as Record<string, number>, {
    get: (_t, name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 100000, 7)
  })
  return { uIOhook: { on: vi.fn(), off: vi.fn(), start: vi.fn(), stop: vi.fn() }, UiohookKey: keys }
})
vi.mock('../store', () => ({ getStore: () => ({ get: vi.fn(), set: vi.fn() }) }))
vi.mock('../windows', () => ({}))
vi.mock('../clipboard', () => ({}))

const { isValidShortcut, defaultRecordShortcut } = await import('../shortcuts')

describe('record shortcut parsing', () => {
  it('accepts hold chords and single right-hand keys', () => {
    expect(isValidShortcut('Ctrl+Win')).toBe(true)
    expect(isValidShortcut('Ctrl+Option')).toBe(true)
    expect(isValidShortcut('Ctrl+Super')).toBe(true)
    expect(isValidShortcut('RightControl')).toBe(true)
    expect(isValidShortcut('Right Option')).toBe(true)
  })

  it('accepts classic combos', () => {
    expect(isValidShortcut('Option+Space')).toBe(true)
    expect(isValidShortcut('Ctrl+Shift+D')).toBe(true)
  })

  it('rejects shortcuts that would fire on ordinary typing', () => {
    expect(isValidShortcut('Ctrl')).toBe(false)
    expect(isValidShortcut('Shift')).toBe(false)
    expect(isValidShortcut('Fn+Space')).toBe(false)
  })

  it('only allows fn on macOS', () => {
    expect(isValidShortcut('Fn')).toBe(process.platform === 'darwin')
  })

  it('defaults to Wispr-style hold triggers per platform', () => {
    const expected =
      process.platform === 'darwin'
        ? 'Fn'
        : process.platform === 'win32'
          ? 'Ctrl+Win'
          : 'RightControl'
    expect(defaultRecordShortcut()).toBe(expected)
    expect(isValidShortcut(defaultRecordShortcut())).toBe(true)
  })
})
