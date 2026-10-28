import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks: Electron, the native key hook and the store ─────────────
const KEY: Record<string, number> = {
  Ctrl: 29,
  CtrlRight: 3613,
  Alt: 56,
  AltRight: 3640,
  Meta: 3675,
  MetaRight: 3676,
  Shift: 42,
  ShiftRight: 54,
  Space: 57,
  C: 46,
  D: 32,
  Escape: 1,
  A: 30
}
const handlers: Record<string, (e: { keycode: number }) => void> = {}
vi.mock('uiohook-napi', () => ({
  uIOhook: {
    on: (event: string, fn: (e: { keycode: number }) => void) => {
      handlers[event] = fn
    },
    off: vi.fn(),
    start: vi.fn(),
    stop: vi.fn()
  },
  UiohookKey: new Proxy(KEY, { get: (t, k: string) => t[k] ?? 9999 })
}))
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/nonexistent' },
  globalShortcut: { register: () => true, unregister: vi.fn(), unregisterAll: vi.fn() },
  systemPreferences: { isTrustedAccessibilityClient: () => true }
}))
let storedRecord = 'RightControl'
vi.mock('../store', () => ({
  getStore: () => ({
    get: (key: string) => (key === 'shortcuts' ? { record: storedRecord } : undefined),
    set: vi.fn()
  })
}))
vi.mock('../windows', () => ({}))
vi.mock('../clipboard', () => ({}))

const shortcuts = await import('../shortcuts')

const sent: string[] = []
const windowManager = {
  sendToWindow: (_w: string, channel: string) => {
    if (channel.startsWith('recording:')) sent.push(channel)
  },
  showPinnedPanel: vi.fn(),
  hideAllOverlays: vi.fn(),
  showCommandPopup: vi.fn()
}

const down = (k: string): void => handlers.keydown({ keycode: KEY[k], ...mods() } as never)
const up = (k: string): void => handlers.keyup({ keycode: KEY[k], ...mods() } as never)
function mods(): Record<string, boolean> {
  return { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }
}
const advance = (ms: number): void => {
  vi.advanceTimersByTime(ms)
}

function useShortcut(record: string): void {
  storedRecord = record
  shortcuts.reloadShortcuts()
}

let started = false
beforeEach(() => {
  vi.useFakeTimers()
  if (!started) {
    shortcuts.registerGlobalShortcuts(windowManager as never, {} as never)
    started = true
  }
  sent.length = 0
  // Let cooldowns from the previous test expire
  advance(2000)
})

describe('hold triggers', () => {
  it('Right Ctrl: hold to talk, release to stop', () => {
    useShortcut('RightControl')
    down('CtrlRight')
    advance(1200)
    up('CtrlRight')
    expect(sent).toEqual(['recording:start', 'recording:start', 'recording:stop', 'recording:stop'])
  })

  it('Right Ctrl + C is a copy shortcut: recording is cancelled, not transcribed', () => {
    useShortcut('RightControl')
    down('CtrlRight')
    advance(300)
    down('C')
    up('C')
    up('CtrlRight')
    expect(sent).toContain('recording:cancel')
    expect(sent).not.toContain('recording:stop')
  })

  it('does not trigger after typing with the modifier already held', () => {
    useShortcut('Ctrl+Win')
    down('Ctrl')
    down('C') // Ctrl+C first…
    up('C')
    down('Meta') // …then Win while Ctrl is still down
    advance(800)
    up('Meta')
    up('Ctrl')
    expect(sent).toEqual([])
  })

  it('Ctrl+Win chord starts only when both are held, in either order', () => {
    useShortcut('Ctrl+Win')
    down('Meta')
    expect(sent).toEqual([])
    down('Ctrl')
    expect(sent[0]).toBe('recording:start')
    advance(1000)
    up('Ctrl')
    expect(sent).toContain('recording:stop')
    up('Meta')
  })

  it('Ctrl+Win+Shift is another shortcut, not ours', () => {
    useShortcut('Ctrl+Win')
    down('Shift')
    down('Ctrl')
    down('Meta')
    advance(800)
    up('Meta')
    up('Ctrl')
    up('Shift')
    expect(sent).toEqual([])
  })

  it('adding Space while holding switches to hands-free; a later tap stops', () => {
    useShortcut('RightControl')
    down('CtrlRight')
    advance(400)
    down('Space')
    up('Space')
    advance(200)
    up('CtrlRight')
    expect(sent).not.toContain('recording:stop')
    advance(1500)
    down('CtrlRight')
    advance(100)
    up('CtrlRight')
    expect(sent.filter((c) => c === 'recording:stop').length).toBeGreaterThan(0)
  })

  it('a quick tap locks recording on (hands-free) until tapped again', () => {
    useShortcut('RightControl')
    down('CtrlRight')
    advance(120)
    up('CtrlRight')
    expect(sent).not.toContain('recording:stop')
    advance(1500)
    down('CtrlRight')
    advance(100)
    up('CtrlRight')
    expect(sent).toContain('recording:stop')
  })

  it('right after a dictation, the key starts a new dictation (no action popup)', () => {
    useShortcut('RightControl')
    down('CtrlRight')
    advance(1200)
    up('CtrlRight')
    shortcuts.setLastDictation('Hello there')
    sent.length = 0
    advance(1000)
    down('CtrlRight')
    advance(1200)
    up('CtrlRight')
    expect(windowManager.showCommandPopup).not.toHaveBeenCalled()
    expect(sent[0]).toBe('recording:start')
    expect(sent).toContain('recording:stop')
  })
})
