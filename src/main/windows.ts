import {
  BrowserWindow,
  nativeImage,
  nativeTheme,
  screen,
  shell,
  type BrowserWindowConstructorOptions,
  type Rectangle
} from 'electron'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import { getStore } from './store'

export type WindowType =
  | 'main'
  | 'recordingPill'
  | 'pinnedPanel'
  | 'commandPopup'
  | 'aiPanel'
  | 'notepad'

type ThemePreference = 'system' | 'dark' | 'light'

interface Size {
  width: number
  height: number
}

// ── Overlay geometry ─────────────────────────────────────────────

const OVERLAY_TOP_MARGIN = 8
const PILL_SIZE: Size = { width: 140, height: 50 }
const PILL_RESULTS_SIZE: Size = { width: 400, height: 520 }
const PINNED_PANEL_SIZE: Size = { width: 220, height: 56 }
// The command popup card is 360x440; the window adds 32px of transparent
// padding on every side so the card and its shadow are never clipped.
const COMMAND_POPUP_SIZE: Size = { width: 424, height: 504 }
const AI_PANEL_SIZE: Size = { width: 660, height: 540 }

// Height of the Windows title bar overlay (window controls). Must match the
// drag strip rendered by the main window on Windows (h-10 = 40px).
const TITLE_BAR_OVERLAY_HEIGHT = 40

// Match the renderer's paper canvas so the first paint and the Windows
// caption-button strip blend in (see --tw-bg in globals.css)
const THEME_COLORS = {
  dark: { background: '#121110', symbol: '#F3F0EA' },
  light: { background: '#F5F3EE', symbol: '#1B1A17' }
}

// Mouse-move forwarding for click-through windows only exists on macOS and
// Windows. On Linux we fall back to window shapes (setShape).
const SUPPORTS_MOUSE_FORWARDING = process.platform === 'darwin' || process.platform === 'win32'
const SUPPORTS_WINDOW_SHAPE = process.platform === 'linux'

// ── Helpers ──────────────────────────────────────────────────────

function getThemePreference(): ThemePreference {
  try {
    const theme = getStore().get('theme')
    return theme === 'dark' || theme === 'light' ? theme : 'system'
  } catch {
    return 'system'
  }
}

/**
 * Sync Electron's native theme with the stored preference so native chrome
 * (title bar, window controls, context menus) and `prefers-color-scheme`
 * follow the app theme.
 */
export function applyNativeTheme(): void {
  nativeTheme.themeSource = getThemePreference()
}

export function isDarkTheme(): boolean {
  const pref = getThemePreference()
  if (pref === 'dark') return true
  if (pref === 'light') return false
  return nativeTheme.shouldUseDarkColors
}

function getThemeColors(): { background: string; symbol: string } {
  return isDarkTheme() ? THEME_COLORS.dark : THEME_COLORS.light
}

/** Work area of the display the mouse cursor is currently on. */
function getCursorWorkArea(): Rectangle {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
}

/** Work area of the display a window currently sits on. */
function getWindowWorkArea(win: BrowserWindow): Rectangle {
  return screen.getDisplayMatching(win.getBounds()).workArea
}

function topCenteredBounds(workArea: Rectangle, size: Size): Rectangle {
  return {
    x: workArea.x + Math.round((workArea.width - size.width) / 2),
    y: workArea.y + OVERLAY_TOP_MARGIN,
    width: size.width,
    height: size.height
  }
}

/** Meeting notepad default size */
const NOTEPAD_SIZE = { width: 400, height: 640 }

function centeredBounds(workArea: Rectangle, size: Size): Rectangle {
  const width = Math.min(size.width, workArea.width)
  const height = Math.min(size.height, workArea.height)
  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height
  }
}

function windowWebPreferences(): BrowserWindowConstructorOptions['webPreferences'] {
  return {
    preload: path.join(__dirname, '../preload/index.js'),
    sandbox: false,
    contextIsolation: true,
    nodeIntegration: false,
    additionalArguments: [`--tapwisper-theme=${isDarkTheme() ? 'dark' : 'light'}`]
  }
}

export class WindowManager {
  private windows: Map<WindowType, BrowserWindow> = new Map()
  private pillHideTimeout: ReturnType<typeof setTimeout> | null = null
  private windowReady: Map<WindowType, Promise<void>> = new Map()
  private windowReadyResolvers: Map<WindowType, () => void> = new Map()
  // Overlays whose transparent regions should let clicks fall through to
  // the apps underneath. Only the visible card is interactive.
  private hitTestWindows: Set<WindowType> = new Set()
  // Hit-test windows whose card is currently under the cursor.
  private interactiveWindows: Set<WindowType> = new Set()

  constructor() {
    applyNativeTheme()
    nativeTheme.on('updated', () => this.applyThemeToMainWindow())
  }

  createAllWindows(): void {
    this.createMainWindow()
  }

  /**
   * Pre-create (warm up) the recording overlay windows so they are loaded
   * and ready when the global shortcut fires for the first time.
   * Without this, the first shortcut press triggers lazy window creation,
   * and the DOM isn't ready yet when recording:start / recording:stop IPC
   * messages arrive — causing the panel to flash and disappear.
   */
  warmUpOverlays(): void {
    this.ensurePinnedPanel()
    this.ensureRecordingPill()
    this.ensureCommandPopup()
  }

  // ── Main Settings Window ──────────────────────────────────────
  private createMainWindow(): void {
    const iconPath = path.join(__dirname, '../../build/icon.png')
    const icon = nativeImage.createFromPath(iconPath)
    const colors = getThemeColors()

    // macOS: inset traffic lights over our own sidebar header.
    // Windows: hidden title bar + native window-controls overlay.
    // Linux: native frame — window managers vary too much for a custom one.
    let titleBarOptions: BrowserWindowConstructorOptions
    if (process.platform === 'darwin') {
      titleBarOptions = { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 15, y: 15 } }
    } else if (process.platform === 'win32') {
      titleBarOptions = {
        titleBarStyle: 'hidden',
        titleBarOverlay: {
          color: colors.background,
          symbolColor: colors.symbol,
          height: TITLE_BAR_OVERLAY_HEIGHT
        }
      }
    } else {
      titleBarOptions = { autoHideMenuBar: true }
    }

    const mainWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 800,
      minHeight: 600,
      show: false,
      title: 'TapWisper',
      ...(process.platform !== 'darwin' && !icon.isEmpty() && { icon }),
      ...titleBarOptions,
      backgroundColor: colors.background,
      webPreferences: windowWebPreferences()
    })

    mainWindow.on('ready-to-show', () => {
      mainWindow.show()
      mainWindow.focus()
    })

    mainWindow.on('close', (e) => {
      // Hide instead of close (keep in tray) — unless the app is quitting
      if (this.quitting) return
      e.preventDefault()
      mainWindow.hide()
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    this.loadWindow(mainWindow, 'main')
    this.windows.set('main', mainWindow)
  }

  /**
   * Re-apply the stored theme to native window chrome. Called when the
   * theme setting changes or the OS theme changes.
   */
  applyThemeToMainWindow(): void {
    const win = this.windows.get('main')
    if (!win || win.isDestroyed()) return
    const colors = getThemeColors()
    win.setBackgroundColor(colors.background)
    if (process.platform === 'win32') {
      try {
        win.setTitleBarOverlay({
          color: colors.background,
          symbolColor: colors.symbol,
          height: TITLE_BAR_OVERLAY_HEIGHT
        })
      } catch {
        // Window controls overlay not enabled — nothing to update
      }
    }
  }

  // ── Lazy Window Helpers ─────────────────────────────────────────
  // Ensures a window of the given type exists, creating it on first access.

  private ensureRecordingPill(): BrowserWindow {
    let pill = this.windows.get('recordingPill')
    if (pill && !pill.isDestroyed()) return pill

    pill = new BrowserWindow({
      ...topCenteredBounds(getCursorWorkArea(), PILL_SIZE),
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      focusable: false,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      type: 'panel',
      webPreferences: windowWebPreferences()
    })

    pill.setIgnoreMouseEvents(true)
    this.loadWindow(pill, 'recording-pill')
    this.trackWindowReady(pill, 'recordingPill')
    this.windows.set('recordingPill', pill)
    return pill
  }

  private ensurePinnedPanel(): BrowserWindow {
    let panel = this.windows.get('pinnedPanel')
    if (panel && !panel.isDestroyed()) return panel

    panel = new BrowserWindow({
      ...topCenteredBounds(getCursorWorkArea(), PINNED_PANEL_SIZE),
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      focusable: false,
      resizable: false,
      skipTaskbar: true,
      hasShadow: false,
      type: 'panel',
      webPreferences: windowWebPreferences()
    })

    this.loadWindow(panel, 'pinned-panel')
    this.trackWindowReady(panel, 'pinnedPanel')
    this.windows.set('pinnedPanel', panel)
    return panel
  }

  private ensureCommandPopup(): BrowserWindow {
    let popup = this.windows.get('commandPopup')
    if (popup && !popup.isDestroyed()) return popup

    popup = new BrowserWindow({
      ...centeredBounds(getCursorWorkArea(), COMMAND_POPUP_SIZE),
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      hasShadow: true,
      webPreferences: windowWebPreferences()
    })

    this.loadWindow(popup, 'command-popup')
    this.trackWindowReady(popup, 'commandPopup')
    this.windows.set('commandPopup', popup)
    return popup
  }

  private ensureAIPanel(): BrowserWindow {
    let aiPanel = this.windows.get('aiPanel')
    if (aiPanel && !aiPanel.isDestroyed()) return aiPanel

    aiPanel = new BrowserWindow({
      ...centeredBounds(getCursorWorkArea(), AI_PANEL_SIZE),
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: true,
      skipTaskbar: true,
      hasShadow: true,
      webPreferences: windowWebPreferences()
    })

    // The panel card is much smaller than the window; let clicks on the
    // transparent margin fall through to the apps underneath.
    this.enableHitTesting(aiPanel, 'aiPanel')

    this.loadWindow(aiPanel, 'ai-panel')
    this.trackWindowReady(aiPanel, 'aiPanel')
    this.windows.set('aiPanel', aiPanel)
    return aiPanel
  }

  // ── Meeting notepad (Notetaker) ───────────────────────────────

  /**
   * Floating notepad shown during a meeting. It records in its own renderer,
   * so closing it only hides it — recording continues until Stop is pressed.
   */
  private ensureNotepad(): BrowserWindow {
    let notepad = this.windows.get('notepad')
    if (notepad && !notepad.isDestroyed()) return notepad

    const area = getCursorWorkArea()
    const width = Math.min(NOTEPAD_SIZE.width, area.width)
    const height = Math.min(NOTEPAD_SIZE.height, area.height - 32)
    const colors = getThemeColors()
    notepad = new BrowserWindow({
      x: area.x + area.width - width - 16,
      y: area.y + Math.round((area.height - height) / 2),
      width,
      height,
      minWidth: 340,
      minHeight: 420,
      show: false,
      title: 'TapWisper Notes',
      alwaysOnTop: true,
      resizable: true,
      fullscreenable: false,
      ...(process.platform === 'darwin'
        ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 12, y: 13 } }
        : { autoHideMenuBar: true }),
      backgroundColor: colors.background,
      webPreferences: {
        ...windowWebPreferences(),
        // Keep recording/transcribing while hidden or in the background
        backgroundThrottling: false
      }
    })
    // Float above full-screen meeting windows as well
    notepad.setAlwaysOnTop(true, 'floating')
    notepad.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    notepad.on('close', (e) => {
      if (this.quitting) return
      e.preventDefault()
      notepad?.hide()
    })

    this.loadWindow(notepad, 'notepad')
    this.trackWindowReady(notepad, 'notepad')
    this.windows.set('notepad', notepad)
    return notepad
  }

  /** Show the notepad; `request` tells it what to do (open a meeting, start recording…) */
  showNotepad(request?: { meetingId?: string; start?: boolean; appName?: string }): void {
    const notepad = this.ensureNotepad()
    const reveal = (): void => {
      if (notepad.isDestroyed()) return
      notepad.show()
      notepad.focus()
      if (request) notepad.webContents.send('notepad:request', request)
    }
    const ready = this.windowReady.get('notepad')
    if (ready) ready.then(reveal)
    else reveal()
  }

  hideNotepad(): void {
    const notepad = this.windows.get('notepad')
    if (notepad && !notepad.isDestroyed()) notepad.hide()
  }

  /** Set before app quit so windows that normally hide on close can close */
  quitting = false

  // ── Click-through for transparent overlays ────────────────────

  /**
   * Make the transparent parts of an overlay click-through. On macOS and
   * Windows the window ignores the mouse but still receives mouse-move
   * events, so the renderer can report when the cursor enters the visible
   * card (see setOverlayInteractive). On Linux, where forwarding isn't
   * supported, the renderer reports the visible rectangles instead and the
   * window shape is clipped to them (see setOverlayHitRegion).
   */
  private enableHitTesting(win: BrowserWindow, type: WindowType): void {
    this.hitTestWindows.add(type)
    this.applyHitTestState(win, type)
  }

  private applyHitTestState(win: BrowserWindow, type: WindowType): void {
    if (!SUPPORTS_MOUSE_FORWARDING || this.interactiveWindows.has(type)) {
      // Linux relies on the window shape; on macOS/Windows the cursor is
      // over the card, so the window must accept clicks.
      win.setIgnoreMouseEvents(false)
    } else {
      win.setIgnoreMouseEvents(true, { forward: true })
    }
  }

  private disableHitTesting(win: BrowserWindow, type: WindowType, clickable: boolean): void {
    this.hitTestWindows.delete(type)
    this.interactiveWindows.delete(type)
    if (SUPPORTS_WINDOW_SHAPE) {
      try {
        win.setShape([])
      } catch {
        // setShape is experimental — ignore failures
      }
    }
    win.setIgnoreMouseEvents(!clickable)
  }

  private getWindowType(win: BrowserWindow): WindowType | undefined {
    for (const [type, w] of this.windows) {
      if (w === win) return type
    }
    return undefined
  }

  /**
   * Called by an overlay renderer when the cursor enters (true) or leaves
   * (false) its visible card. No-op for windows not in hit-test mode.
   */
  setOverlayInteractive(win: BrowserWindow, interactive: boolean): void {
    const type = this.getWindowType(win)
    if (!type || win.isDestroyed()) return
    if (interactive) {
      this.interactiveWindows.add(type)
    } else {
      this.interactiveWindows.delete(type)
    }
    if (this.hitTestWindows.has(type)) this.applyHitTestState(win, type)
  }

  /**
   * Called by an overlay renderer (Linux only) with the rectangles, in
   * window coordinates, that are visible. Everything outside them is neither
   * drawn nor clickable. An empty list hides the whole window surface.
   */
  setOverlayHitRegion(win: BrowserWindow, rects: Rectangle[]): void {
    const type = this.getWindowType(win)
    if (!type || !this.hitTestWindows.has(type) || win.isDestroyed()) return
    if (!SUPPORTS_WINDOW_SHAPE) return

    const [winWidth, winHeight] = win.getContentSize()
    const shape = (Array.isArray(rects) ? rects : [])
      .filter(
        (r) =>
          r &&
          Number.isFinite(r.x) &&
          Number.isFinite(r.y) &&
          Number.isFinite(r.width) &&
          Number.isFinite(r.height)
      )
      .map((r) => {
        const x = Math.max(0, Math.floor(r.x))
        const y = Math.max(0, Math.floor(r.y))
        return {
          x,
          y,
          width: Math.max(0, Math.min(winWidth - x, Math.ceil(r.width))),
          height: Math.max(0, Math.min(winHeight - y, Math.ceil(r.height)))
        }
      })
      .filter((r) => r.width > 0 && r.height > 0)

    try {
      // An empty shape would revert to a fully rectangular (click-eating)
      // window, so use a 1px region when nothing is visible.
      win.setShape(shape.length > 0 ? shape : [{ x: 0, y: 0, width: 1, height: 1 }])
    } catch {
      // setShape is experimental — ignore failures
    }
  }

  // ── Window Loading ────────────────────────────────────────────

  /**
   * Track window readiness. Creates a promise that resolves when the
   * window's webContents finish loading (dom-ready), meaning the React
   * components have mounted and IPC listeners are registered.
   */
  private trackWindowReady(win: BrowserWindow, type: WindowType): void {
    const promise = new Promise<void>((resolve) => {
      this.windowReadyResolvers.set(type, resolve)
      win.webContents.once('dom-ready', () => {
        this.windowReady.delete(type)
        this.windowReadyResolvers.delete(type)
        resolve()
      })
    })
    this.windowReady.set(type, promise)
  }

  private loadWindow(win: BrowserWindow, route: string): void {
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/${route}`)
    } else {
      win.loadFile(path.join(__dirname, '../renderer/index.html'), {
        hash: `/${route}`
      })
    }
  }

  // ── Public API ────────────────────────────────────────────────
  getWindow(type: WindowType): BrowserWindow | undefined {
    return this.windows.get(type)
  }

  /** Send a message to every open window (main + overlays). */
  broadcast(channel: string, ...args: unknown[]): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, ...args)
    }
  }

  showMainWindow(): void {
    const win = this.windows.get('main')
    if (win) {
      win.show()
      win.focus()
    }
  }

  showRecordingPill(): void {
    this.ensureRecordingPill()

    // Cancel any pending hide timeout to prevent stale hides
    if (this.pillHideTimeout) {
      clearTimeout(this.pillHideTimeout)
      this.pillHideTimeout = null
    }

    const readyPromise = this.windowReady.get('recordingPill')
    const doShow = (): void => {
      const pill = this.windows.get('recordingPill')
      if (pill && !pill.isDestroyed()) {
        // Re-center on the display the user is working on, unless the pill
        // is already showing (e.g. expanded with results) on some display.
        if (!pill.isVisible()) {
          pill.setBounds(topCenteredBounds(getCursorWorkArea(), pill.getBounds()))
        }
        pill.show()
        pill.webContents.send('recording-pill:show')
      }
    }

    if (readyPromise) {
      readyPromise.then(doShow)
    } else {
      doShow()
    }
  }

  hideRecordingPill(): void {
    const pill = this.windows.get('recordingPill')
    if (pill && !pill.isDestroyed()) {
      // Restore to collapsed state before hiding
      this.collapseRecordingPill()
      pill.webContents.send('recording-pill:hide')

      // Cancel any previous pending hide timeout to prevent stale fires
      if (this.pillHideTimeout) {
        clearTimeout(this.pillHideTimeout)
      }
      // Delay hide for animation
      this.pillHideTimeout = setTimeout(() => {
        this.pillHideTimeout = null
        if (!pill.isDestroyed()) pill.hide()
      }, 250)
    }
  }

  expandRecordingPillForResults(): void {
    const pill = this.ensureRecordingPill()
    pill.setBounds(topCenteredBounds(getWindowWorkArea(pill), PILL_RESULTS_SIZE))

    // Only the visible card accepts clicks; the transparent area around it
    // stays click-through. The pill never steals focus from the user's app.
    this.enableHitTesting(pill, 'recordingPill')
    pill.setFocusable(false)
  }

  expandRecordingPillFull(): void {
    const pill = this.ensureRecordingPill()
    const workArea = getWindowWorkArea(pill)
    const fullHeight = Math.min(700, workArea.height - 40)
    pill.setBounds(centeredBounds(workArea, { width: 520, height: fullHeight }))
    this.enableHitTesting(pill, 'recordingPill')
    pill.setFocusable(false)
  }

  collapseRecordingPillToResults(): void {
    this.expandRecordingPillForResults()
  }

  collapseRecordingPill(): void {
    const pill = this.windows.get('recordingPill')
    if (pill && !pill.isDestroyed()) {
      pill.setBounds(topCenteredBounds(getWindowWorkArea(pill), PILL_SIZE))
      this.disableHitTesting(pill, 'recordingPill', false)
      pill.setFocusable(false)
    }
  }

  setRecordingPillClickable(clickable: boolean): void {
    const pill = this.windows.get('recordingPill')
    if (pill && !pill.isDestroyed()) {
      this.disableHitTesting(pill, 'recordingPill', clickable)
      pill.setFocusable(false)
    }
  }

  showPinnedPanel(): void {
    const panel = this.ensurePinnedPanel()

    // Re-center horizontally near the top of the display under the cursor
    if (!panel.isVisible()) {
      panel.setBounds(topCenteredBounds(getCursorWorkArea(), panel.getBounds()))
    }

    // If the window is still loading (first-time creation), wait for it
    // before showing to avoid a flash of empty content
    const readyPromise = this.windowReady.get('pinnedPanel')
    if (readyPromise) {
      readyPromise.then(() => {
        if (!panel.isDestroyed()) panel.showInactive()
      })
    } else {
      panel.showInactive()
    }
  }

  hidePinnedPanel(): void {
    const panel = this.windows.get('pinnedPanel')
    if (panel && !panel.isDestroyed()) {
      panel.hide()
    }
  }

  showCommandPopup(selectedText?: string, options?: { grabText?: boolean }): void {
    this.ensureCommandPopup()
    const readyPromise = this.windowReady.get('commandPopup')
    const doShow = (): void => {
      const popup = this.windows.get('commandPopup')
      if (popup && !popup.isDestroyed()) {
        if (!popup.isVisible()) {
          popup.setBounds(centeredBounds(getCursorWorkArea(), COMMAND_POPUP_SIZE))
        }
        popup.show()
        popup.focus()
        if (typeof selectedText === 'string') {
          popup.webContents.send('command-popup:set-text', selectedText)
        } else if (options?.grabText) {
          popup.webContents.send('command-popup:grab-text')
        }
      }
    }
    if (readyPromise) {
      readyPromise.then(doShow)
    } else {
      doShow()
    }
  }

  hideCommandPopup(): void {
    const popup = this.windows.get('commandPopup')
    if (popup && !popup.isDestroyed()) {
      popup.hide()
    }
  }

  showAIPanel(data?: { text: string; action: string }): void {
    this.ensureAIPanel()
    const readyPromise = this.windowReady.get('aiPanel')
    const doShow = (): void => {
      const panel = this.windows.get('aiPanel')
      if (panel && !panel.isDestroyed()) {
        if (!panel.isVisible()) {
          panel.setBounds(centeredBounds(getCursorWorkArea(), panel.getBounds()))
        }
        panel.show()
        panel.focus()
        if (data) {
          panel.webContents.send('ai-panel:process', data)
        }
      }
    }
    if (readyPromise) {
      readyPromise.then(doShow)
    } else {
      doShow()
    }
  }

  hideAIPanel(): void {
    const panel = this.windows.get('aiPanel')
    if (panel && !panel.isDestroyed()) {
      // The renderer can't report mouseleave once hidden — reset so the
      // transparent margin is click-through the next time it is shown.
      this.setOverlayInteractive(panel, false)
      panel.hide()
    }
  }

  setAIPanelExpanded(expanded: boolean): void {
    const panel = this.windows.get('aiPanel')
    if (!panel || panel.isDestroyed()) return

    const workArea = getWindowWorkArea(panel)
    const size: Size = expanded
      ? {
          width: Math.min(800, Math.round(workArea.width * 0.85)),
          height: Math.min(720, Math.round(workArea.height * 0.85))
        }
      : AI_PANEL_SIZE
    panel.setBounds(centeredBounds(workArea, size))
  }

  hideAllOverlays(): void {
    this.hideRecordingPill()
    this.hidePinnedPanel()
    this.hideCommandPopup()
    this.hideAIPanel()
  }

  sendToWindow(type: WindowType, channel: string, ...args: unknown[]): void {
    const win = this.windows.get(type)
    if (!win || win.isDestroyed()) return

    const readyPromise = this.windowReady.get(type)
    if (readyPromise) {
      // Window is still loading — queue the message until it's ready
      readyPromise.then(() => {
        if (!win.isDestroyed()) {
          win.webContents.send(channel, ...args)
        }
      })
    } else {
      win.webContents.send(channel, ...args)
    }
  }
}
