import { BrowserWindow, nativeImage, screen, shell } from 'electron'
import path from 'path'
import { is } from '@electron-toolkit/utils'

export type WindowType = 'main' | 'recordingPill' | 'pinnedPanel' | 'commandPopup' | 'aiPanel'

export class WindowManager {
  private windows: Map<WindowType, BrowserWindow> = new Map()
  private pillHideTimeout: ReturnType<typeof setTimeout> | null = null
  private windowReady: Map<WindowType, Promise<void>> = new Map()
  private windowReadyResolvers: Map<WindowType, () => void> = new Map()

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

    const mainWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 800,
      minHeight: 600,
      show: false,
      title: 'TapWisper',
      ...(process.platform !== 'darwin' && !icon.isEmpty() && { icon }),
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 15, y: 15 },
      backgroundColor: '#000000',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    mainWindow.on('ready-to-show', () => {
      mainWindow.show()
      mainWindow.focus()
    })

    mainWindow.on('close', (e) => {
      // Hide instead of close (keep in tray)
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

  // ── Lazy Window Helpers ─────────────────────────────────────────
  // Ensures a window of the given type exists, creating it on first access.

  private ensureRecordingPill(): BrowserWindow {
    let pill = this.windows.get('recordingPill')
    if (pill && !pill.isDestroyed()) return pill

    const display = screen.getPrimaryDisplay()
    const { width: screenWidth } = display.workArea

    const pillWidth = 140
    const pillHeight = 50
    const x = Math.round((screenWidth - pillWidth) / 2)
    const y = 8

    pill = new BrowserWindow({
      width: pillWidth,
      height: pillHeight,
      x,
      y,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      focusable: false,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      type: 'panel',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
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

    const display = screen.getPrimaryDisplay()
    const { width: screenWidth } = display.workArea

    const panelWidth = 220
    const panelHeight = 56
    const x = Math.round((screenWidth - panelWidth) / 2)
    const y = 8

    panel = new BrowserWindow({
      width: panelWidth,
      height: panelHeight,
      x,
      y,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      focusable: false,
      resizable: false,
      skipTaskbar: true,
      hasShadow: false,
      type: 'panel',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    this.loadWindow(panel, 'pinned-panel')
    this.trackWindowReady(panel, 'pinnedPanel')
    this.windows.set('pinnedPanel', panel)
    return panel
  }

  private ensureCommandPopup(): BrowserWindow {
    let popup = this.windows.get('commandPopup')
    if (popup && !popup.isDestroyed()) return popup

    const display = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = display.workArea

    const popupWidth = 360
    const popupHeight = 440
    const x = Math.round((screenWidth - popupWidth) / 2)
    const y = Math.round((screenHeight - popupHeight) / 2)

    popup = new BrowserWindow({
      width: popupWidth,
      height: popupHeight,
      x,
      y,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      hasShadow: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    this.loadWindow(popup, 'command-popup')
    this.trackWindowReady(popup, 'commandPopup')
    this.windows.set('commandPopup', popup)
    return popup
  }

  private ensureAIPanel(): BrowserWindow {
    let aiPanel = this.windows.get('aiPanel')
    if (aiPanel && !aiPanel.isDestroyed()) return aiPanel

    const display = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = display.workArea

    const panelWidth = 660
    const panelHeight = 540
    const x = Math.round((screenWidth - panelWidth) / 2)
    const y = Math.round((screenHeight - panelHeight) / 2)

    aiPanel = new BrowserWindow({
      width: panelWidth,
      height: panelHeight,
      x,
      y,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: true,
      skipTaskbar: true,
      hasShadow: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    this.loadWindow(aiPanel, 'ai-panel')
    this.trackWindowReady(aiPanel, 'aiPanel')
    this.windows.set('aiPanel', aiPanel)
    return aiPanel
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
        // Re-center on primary display
        const display = screen.getPrimaryDisplay()
        const { width: screenWidth } = display.workArea
        const x = Math.round((screenWidth - 140) / 2)
        pill.setPosition(x, 8)
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
    const display = screen.getPrimaryDisplay()
    const { width: screenWidth } = display.workArea
    const expandedWidth = 400
    const expandedHeight = 520
    const x = Math.round((screenWidth - expandedWidth) / 2)
    pill.setSize(expandedWidth, expandedHeight)
    pill.setPosition(x, 8)

    // Allow mouse clicks but do NOT steal focus from the user's app.
    pill.setIgnoreMouseEvents(false)
    pill.setFocusable(false)
  }

  expandRecordingPillFull(): void {
    const pill = this.ensureRecordingPill()
    const display = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = display.workArea
    const fullWidth = 520
    const fullHeight = Math.min(700, screenHeight - 40)
    const x = Math.round((screenWidth - fullWidth) / 2)
    const y = Math.round((screenHeight - fullHeight) / 2)
    pill.setSize(fullWidth, fullHeight)
    pill.setPosition(x, y)
    pill.setIgnoreMouseEvents(false)
    pill.setFocusable(false)
  }

  collapseRecordingPillToResults(): void {
    this.expandRecordingPillForResults()
  }

  collapseRecordingPill(): void {
    const pill = this.windows.get('recordingPill')
    if (pill && !pill.isDestroyed()) {
      const display = screen.getPrimaryDisplay()
      const { width: screenWidth } = display.workArea
      const pillWidth = 140
      const pillHeight = 50
      const x = Math.round((screenWidth - pillWidth) / 2)
      pill.setSize(pillWidth, pillHeight)
      pill.setPosition(x, 8)
      pill.setIgnoreMouseEvents(true)
      pill.setFocusable(false)
    }
  }

  setRecordingPillClickable(clickable: boolean): void {
    const pill = this.windows.get('recordingPill')
    if (pill && !pill.isDestroyed()) {
      pill.setIgnoreMouseEvents(!clickable)
      pill.setFocusable(false)
    }
  }

  showPinnedPanel(): void {
    const panel = this.ensurePinnedPanel()

    // Re-center horizontally near top of screen
    const display = screen.getPrimaryDisplay()
    const { width: screenWidth } = display.workArea
    const panelWidth = 220
    const x = Math.round((screenWidth - panelWidth) / 2)
    panel.setPosition(x, 8)

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
      panel.hide()
    }
  }

  setAIPanelExpanded(expanded: boolean): void {
    const panel = this.windows.get('aiPanel')
    if (!panel || panel.isDestroyed()) return

    const display = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = display.workArea

    if (expanded) {
      const w = Math.min(800, Math.round(screenWidth * 0.85))
      const h = Math.min(720, Math.round(screenHeight * 0.85))
      const x = Math.round((screenWidth - w) / 2)
      const y = Math.round((screenHeight - h) / 2)
      panel.setSize(w, h)
      panel.setPosition(x, y)
    } else {
      const w = 660
      const h = 540
      const x = Math.round((screenWidth - w) / 2)
      const y = Math.round((screenHeight - h) / 2)
      panel.setSize(w, h)
      panel.setPosition(x, y)
    }
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
