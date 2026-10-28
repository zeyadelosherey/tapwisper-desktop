import { EventEmitter } from 'events'
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

// The fn/Globe shortcut exists on macOS only, reported by the fn-monitor helper
const realPlatform = process.platform
Object.defineProperty(process, 'platform', { value: 'darwin' })
afterAll(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform })
})

// ── Mocks: Electron, the key hook, the store and the fn-monitor helper ─
vi.mock('uiohook-napi', () => ({
  uIOhook: { on: vi.fn(), off: vi.fn(), start: vi.fn(), stop: vi.fn() },
  UiohookKey: new Proxy({}, { get: () => 9999 })
}))
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/app' },
  globalShortcut: { register: () => true, unregister: vi.fn(), unregisterAll: vi.fn() },
  systemPreferences: { isTrustedAccessibilityClient: () => true }
}))
vi.mock('../store', () => ({
  getStore: () => ({
    get: (key: string) => (key === 'shortcuts' ? { record: 'Fn' } : undefined),
    set: vi.fn()
  })
}))
vi.mock('../windows', () => ({}))
vi.mock('../clipboard', () => ({}))
vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  existsSync: () => true
}))
const helper = { stdout: new EventEmitter() }
vi.mock('child_process', () => ({
  spawn: () => Object.assign(new EventEmitter(), { stdout: helper.stdout, stdin: { end: vi.fn() } })
}))

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

const fn = (line: string): void => {
  helper.stdout.emit('data', Buffer.from(`${line}\n`))
}
const advance = (ms: number): void => {
  vi.advanceTimersByTime(ms)
}

let started = false
beforeEach(() => {
  vi.useFakeTimers()
  if (!started) {
    shortcuts.registerGlobalShortcuts(windowManager as never, {} as never)
    started = true
  }
  sent.length = 0
  windowManager.showCommandPopup.mockClear()
  advance(2000) // let cooldowns from the previous test expire
})

describe('fn / Globe record key', () => {
  it('hold fn to talk, release to stop', () => {
    fn('down')
    advance(1000)
    fn('up')
    expect(sent).toContain('recording:stop')
  })

  it('a quick fn tap (language switch, emoji) records nothing', () => {
    fn('down')
    advance(120)
    fn('up')
    expect(sent).toContain('recording:cancel')
    expect(sent).not.toContain('recording:stop')
    // and nothing keeps listening in the background
    sent.length = 0
    advance(5000)
    expect(sent).toEqual([])
  })

  it('fn+Space switches to hands-free; a later hold stops', () => {
    fn('down')
    advance(400)
    fn('key 49')
    advance(200)
    fn('up')
    expect(sent).not.toContain('recording:stop')
    advance(1500)
    fn('down')
    advance(100)
    fn('up')
    expect(sent).toContain('recording:stop')
  })

  it('fn with another key is a keyboard shortcut, not dictation', () => {
    fn('down')
    advance(300)
    fn('key 123') // fn+←
    fn('up')
    expect(sent).toContain('recording:cancel')
    expect(sent).not.toContain('recording:stop')
  })

  it('right after a dictation, holding fn records again', () => {
    shortcuts.setLastDictation('hello world')
    fn('down')
    advance(1000)
    fn('up')
    expect(sent).toEqual(expect.arrayContaining(['recording:start', 'recording:stop']))
    expect(windowManager.showCommandPopup).not.toHaveBeenCalled()
  })
})
