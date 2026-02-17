import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import path from 'path'

import { registerGlobalShortcuts, unregisterAllShortcuts } from './shortcuts'
import { WindowManager } from './windows'
import { registerIpcHandlers } from './ipc-handlers'
import { initStore } from './store'
import { ClipboardManager } from './clipboard'
import { initDatabase, closeDatabase } from './database'
import { runMigrations } from './migrate-data'
import { cleanupAllAudio } from './audio'

// ── Single Instance Lock ──────────────────────────────────────────
// Prevent multiple instances of the app from running simultaneously.
// If a second instance is launched, focus the existing window instead.
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

let tray: Tray | null = null
let windowManager: WindowManager | null = null
let clipboardManager: ClipboardManager | null = null

function setAppIcon(): void {
  try {
    const iconPath = path.join(__dirname, '../../build/icon.png')
    const icon = nativeImage.createFromPath(iconPath)
    if (!icon.isEmpty() && process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(icon)
    }
  } catch {
    // Ignore — icon path may not exist in all environments
  }
}

function createTray(): void {
  // ── Load tray icon from resources (logo.png copied there at build time) ──
  let trayIcon: Electron.NativeImage

  try {
    // Try @2x first for Retina displays, fall back to 1x
    const icon2xPath = path.join(__dirname, '../../resources/tray-icon@2x.png')
    const icon1xPath = path.join(__dirname, '../../resources/tray-icon.png')

    trayIcon = nativeImage.createFromPath(icon2xPath)
    if (trayIcon.isEmpty()) {
      trayIcon = nativeImage.createFromPath(icon1xPath)
    }

    if (trayIcon.isEmpty()) {
      // Absolute fallback — tiny embedded PNG
      trayIcon = nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAAAXNSR0IArs4c6QAAAIRJREFUOMtjYBhOgBFd4P////8ZGBj+M6AB5v///zMxMDAwMJNoEAsDAwMzAwMDE6mGsKALMDIy/mdiYmIk1RAWBgYGJkKGEGsQCzoDiTWIhVgXkOoiFnQBcl3EQqyNZAUbC7oAKYaw4AoaUgxhITWFkBpsLKQmVhZiE+t/BgYGkr0GADz+JMcjfbJqAAAAAElFTkSuQmCC'
      )
    }

    // Resize to proper menu bar size (18x18 logical pixels)
    trayIcon = trayIcon.resize({ width: 18, height: 18 })
  } catch {
    // Should never happen, but just in case
    trayIcon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAAAXNSR0IArs4c6QAAAIRJREFUOMtjYBhOgBFd4P////8ZGBj+M6AB5v///zMxMDAwMJNoEAsDAwMzAwMDE6mGsKALMDIy/mdiYmIk1RAWBgYGJkKGEGsQCzoDiTWIhVgXkOoiFnQBcl3EQqyNZAUbC7oAKYaw4AoaUgxhITWFkBpsLKQmVhZiE+t/BgYGkr0GADz+JMcjfbJqAAAAAElFTkSuQmCC'
    )
    trayIcon = trayIcon.resize({ width: 18, height: 18 })
  }

  tray = new Tray(trayIcon)
  tray.setToolTip('TapWisper - Voice Dictation with AI')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open TapWisper',
      click: (): void => {
        windowManager?.showMainWindow()
      }
    },
    {
      label: 'Start Recording',
      click: (): void => {
        windowManager?.showPinnedPanel()
      }
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: (): void => {
        windowManager?.showMainWindow()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit TapWisper',
      click: (): void => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  // Single click on tray icon opens the main window
  tray.on('click', () => {
    windowManager?.showMainWindow()
  })
}

function initialize(): void {
  // Initialize config store
  initStore()

  // Initialize database (stats & activity)
  initDatabase()

  // Migrate data from old electron-store format to SQLite (one-time migration)
  runMigrations()

  // Clean up leftover temp audio files from previous sessions
  cleanupAllAudio().catch(() => {})

  // Initialize managers
  windowManager = new WindowManager()
  clipboardManager = new ClipboardManager()

  // Create system tray
  createTray()

  // Register IPC handlers
  registerIpcHandlers(windowManager, clipboardManager)

  // Register global shortcuts (deferred on macOS if accessibility isn't granted yet)
  try {
    registerGlobalShortcuts(windowManager, clipboardManager)
  } catch {
    // If shortcut registration fails (e.g. accessibility not granted),
    // the app still runs — shortcuts will be started after onboarding.
  }

  // Create the main settings window (hidden initially)
  windowManager.createAllWindows()

  // Pre-create overlay windows (hidden) so the first shortcut press
  // doesn't suffer lazy-creation delay that causes a flash-and-disappear.
  windowManager.warmUpOverlays()
}

// App lifecycle
app.whenReady().then(() => {
  // Set app user model id for Windows
  electronApp.setAppUserModelId('com.tapwisper.desktop')

  // Open DevTools by F12 in development only
  if (is.dev) {
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })
  }

  initialize()

  // Use TapWisper logo for dock/taskbar (dev mode shows Electron icon by default)
  setAppIcon()

  app.on('activate', () => {
    // On macOS, re-create a window when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager?.createAllWindows()
    }
  })
})

app.on('will-quit', () => {
  unregisterAllShortcuts()
  closeDatabase()
  // Clean up temp audio files on quit
  cleanupAllAudio().catch(() => {})
})

app.on('window-all-closed', () => {
  // Keep running in the system tray on all platforms.
  // The user can quit explicitly via the tray menu → "Quit TapWisper".
})
