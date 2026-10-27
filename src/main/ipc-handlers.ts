import { ipcMain, IpcMainInvokeEvent, app, BrowserWindow, type Rectangle } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { WindowManager, applyNativeTheme, type WindowType } from './windows'
import { ClipboardManager } from './clipboard'
import { getStore, getConfigValue, setConfigValue, getAllConfig } from './store'
import { encodeWav, saveTempAudio, cleanupAudioFile } from './audio'
import {
  reloadShortcuts,
  cancelRecording,
  startShortcutsAfterPermission,
  setPostRecordingState,
  isValidShortcut,
  defaultRecordShortcut,
  fnMonitorAvailable
} from './shortcuts'
import { checkPermissions, requestPermission } from './permissions'
import type { PermissionType } from './permissions'
import * as db from './database'
import {
  saveRecording,
  loadRecording,
  hasRecording,
  hasRecordings,
  deleteRecording,
  clearRecordings
} from './recordings'
import { getActiveApp } from './app-context'
import { applyMeetingDetectionSetting } from './notetaker'
import {
  executeWebSearch,
  executeTerminal,
  executeKeyboard,
  executeAppleShortcut,
  executeWindow,
  executeLaunchApp,
  listInstalledApps,
  listAppleShortcuts,
  type WebSearchParams,
  type TerminalParams,
  type WindowParams
} from './trigger-actions'

const WINDOW_TYPES: readonly WindowType[] = [
  'main',
  'recordingPill',
  'pinnedPanel',
  'commandPopup',
  'aiPanel'
]

function isWindowType(value: unknown): value is WindowType {
  return typeof value === 'string' && (WINDOW_TYPES as readonly string[]).includes(value)
}

// Settings that every window (including pre-warmed overlays) must react to
const BROADCAST_SETTINGS = ['theme', 'language'] as const

// ── Auto Launch ──────────────────────────────────────────────────

interface AutoLaunchResult {
  success: boolean
  error?: string
}

function getLinuxAutostartFile(): string {
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return path.join(configHome, 'autostart', 'tapwisper.desktop')
}

/** Quote an argument for the Exec key of a .desktop file (Desktop Entry spec). */
function quoteDesktopExecArg(arg: string): string {
  const safe = arg.replace(/%/g, '%%')
  if (!/[\s"'`$\\<>~|&;*?#()]/.test(arg)) return safe
  // Quote, escape the quoting-rule characters, then apply the key-file
  // string escape (backslashes doubled) which is decoded first.
  const quoted = `"${safe.replace(/(["`$\\])/g, '\\$1')}"`
  return quoted.replace(/\\/g, '\\\\')
}

/**
 * Electron's setLoginItemSettings only works on macOS and Windows. On Linux,
 * follow the XDG autostart spec by writing ~/.config/autostart/tapwisper.desktop.
 */
function setLinuxAutoLaunch(enabled: boolean): void {
  const file = getLinuxAutostartFile()
  if (!enabled) {
    fs.rmSync(file, { force: true })
    return
  }

  // AppImage builds run from a temporary mount; APPIMAGE is the real file.
  // In development the Electron binary needs the app path as an argument.
  let args: string[]
  if (process.env.APPIMAGE) {
    args = [process.env.APPIMAGE]
  } else if (app.isPackaged) {
    args = [process.execPath]
  } else {
    args = [process.execPath, app.getAppPath()]
  }

  const content = [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=TapWisper',
    'Comment=Voice dictation with AI',
    `Exec=${args.map(quoteDesktopExecArg).join(' ')}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    ''
  ].join('\n')

  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content, 'utf8')
}

function setAutoLaunch(enabled: boolean): AutoLaunchResult {
  try {
    if (process.platform === 'linux') {
      setLinuxAutoLaunch(enabled)
    } else {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: true
      })
    }
    return { success: true }
  } catch (err) {
    // e.g. "Operation not permitted" in dev mode or when the app isn't signed
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Tell every window the record shortcut changed (views showing keycaps update) */
function broadcastShortcuts(): void {
  const shortcuts = getStore().get('shortcuts')
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('shortcuts:changed', shortcuts)
  }
}

export function registerIpcHandlers(
  windowManager: WindowManager,
  clipboardManager: ClipboardManager
): void {
  // ── Window Management ──────────────────────────────────────────
  ipcMain.handle('window:show', (_e: IpcMainInvokeEvent, type: string) => {
    switch (type) {
      case 'main':
        windowManager.showMainWindow()
        break
      case 'pinnedPanel':
        windowManager.showPinnedPanel()
        break
      case 'commandPopup':
        windowManager.showCommandPopup()
        break
      case 'aiPanel':
        windowManager.showAIPanel()
        break
    }
  })

  ipcMain.handle('window:ai-panel:set-expanded', (_e: IpcMainInvokeEvent, expanded: boolean) => {
    windowManager.setAIPanelExpanded(expanded)
  })

  ipcMain.handle('window:hide', (_e: IpcMainInvokeEvent, type: string) => {
    switch (type) {
      case 'pinnedPanel':
        windowManager.hidePinnedPanel()
        break
      case 'commandPopup':
        windowManager.hideCommandPopup()
        break
      case 'aiPanel':
        windowManager.hideAIPanel()
        break
      case 'recordingPill':
        windowManager.hideRecordingPill()
        break
      case 'all':
        windowManager.hideAllOverlays()
        break
    }
  })

  ipcMain.handle(
    'window:send',
    (_e: IpcMainInvokeEvent, type: string, channel: string, ...args: unknown[]) => {
      if (!isWindowType(type)) return
      windowManager.sendToWindow(type, channel, ...args)
    }
  )

  // ── Overlay click-through ──────────────────────────────────────
  // Overlay renderers report when the cursor is over their visible card
  // (macOS/Windows) or which rectangles are visible (Linux) so transparent
  // regions don't swallow clicks meant for the apps underneath.
  ipcMain.handle('overlay:set-interactive', (e: IpcMainInvokeEvent, interactive: boolean) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) windowManager.setOverlayInteractive(win, interactive === true)
  })

  ipcMain.handle('overlay:set-hit-region', (e: IpcMainInvokeEvent, rects: Rectangle[]) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) windowManager.setOverlayHitRegion(win, Array.isArray(rects) ? rects : [])
  })

  // ── Recording Pill ─────────────────────────────────────────────
  ipcMain.handle('recording-pill:show', () => {
    windowManager.showRecordingPill()
  })

  ipcMain.handle('recording-pill:hide', () => {
    windowManager.hideRecordingPill()
  })

  ipcMain.handle('recording-pill:expand', () => {
    windowManager.expandRecordingPillForResults()
  })

  ipcMain.handle('recording-pill:collapse', () => {
    windowManager.collapseRecordingPill()
  })

  ipcMain.handle('recording-pill:expand-full', () => {
    windowManager.expandRecordingPillFull()
  })

  ipcMain.handle('recording-pill:collapse-to-results', () => {
    windowManager.collapseRecordingPillToResults()
  })

  ipcMain.handle('recording-pill:set-clickable', (_e: IpcMainInvokeEvent, clickable: boolean) => {
    windowManager.setRecordingPillClickable(clickable)
  })

  // ── Recording Control ───────────────────────────────────────────
  ipcMain.handle('recording:cancel', () => {
    cancelRecording()
  })

  ipcMain.handle('recording:transcription-done', (_e: IpcMainInvokeEvent, text: string) => {
    setPostRecordingState(text)
  })

  // ── Clipboard ──────────────────────────────────────────────────
  ipcMain.handle('clipboard:grab-selected-text', async () => {
    return await clipboardManager.grabSelectedText()
  })

  ipcMain.handle('clipboard:insert-text', async (_e: IpcMainInvokeEvent, text: string) => {
    await clipboardManager.insertText(text)
  })

  ipcMain.handle('clipboard:read', () => {
    return clipboardManager.readText()
  })

  ipcMain.handle('clipboard:write', (_e: IpcMainInvokeEvent, text: string) => {
    clipboardManager.writeText(text)
  })

  // ── Audio ──────────────────────────────────────────────────────
  ipcMain.handle(
    'audio:encode-wav',
    async (_e: IpcMainInvokeEvent, samples: Float32Array, sampleRate: number) => {
      const wavBuffer = encodeWav(samples, sampleRate)
      return await saveTempAudio(wavBuffer)
    }
  )

  ipcMain.handle('audio:cleanup', async (_e: IpcMainInvokeEvent, filepath: string) => {
    await cleanupAudioFile(filepath)
  })

  // ── Store (Config) ─────────────────────────────────────────────
  ipcMain.handle('store:get', (_e: IpcMainInvokeEvent, key: string) => {
    return getConfigValue(key)
  })

  ipcMain.handle('store:set', (_e: IpcMainInvokeEvent, key: string, value: unknown) => {
    setConfigValue(key, value)

    if (key === 'recognizeMeetings') applyMeetingDetectionSetting()

    if (key === 'theme') {
      applyNativeTheme()
      windowManager.applyThemeToMainWindow()
    }
    if ((BROADCAST_SETTINGS as readonly string[]).includes(key)) {
      windowManager.broadcast('settings:changed', key, value)
    }
  })

  ipcMain.handle('store:getAll', () => {
    return getAllConfig()
  })

  ipcMain.handle('store:reset', () => {
    const store = getStore()
    store.clear()

    // Defaults may differ from what overlays currently show
    applyNativeTheme()
    windowManager.applyThemeToMainWindow()
    for (const key of BROADCAST_SETTINGS) {
      windowManager.broadcast('settings:changed', key, store.get(key))
    }
  })

  // ── App ────────────────────────────────────────────────────────
  ipcMain.handle('app:get-version', () => app.getVersion())

  // ── Auto Launch ────────────────────────────────────────────────
  ipcMain.handle('app:set-auto-launch', (_e: IpcMainInvokeEvent, enabled: boolean) => {
    return setAutoLaunch(enabled === true)
  })

  // Apply stored auto-launch setting on startup (also refreshes the Linux
  // autostart entry in case the executable moved, e.g. after an update)
  if (getStore().get('autoLaunch')) {
    setAutoLaunch(true)
  }

  // ── Shortcuts ────────────────────────────────────────────────────
  ipcMain.handle('shortcuts:update', (_e: IpcMainInvokeEvent, shortcuts: { record?: string }) => {
    if (shortcuts.record && !isValidShortcut(shortcuts.record)) {
      return { success: false, error: 'unsupported-shortcut' }
    }
    const store = getStore()
    store.set('shortcuts', { ...store.get('shortcuts'), ...shortcuts })
    reloadShortcuts()
    broadcastShortcuts()
    return { success: true }
  })

  ipcMain.handle('shortcuts:fn-available', () => fnMonitorAvailable())

  ipcMain.handle('shortcuts:get', () => {
    const store = getStore()
    return store.get('shortcuts')
  })

  ipcMain.handle('shortcuts:reset', () => {
    const store = getStore()
    store.set('shortcuts', {
      record: defaultRecordShortcut()
    })
    reloadShortcuts()
    broadcastShortcuts()
    return store.get('shortcuts')
  })

  // ── Permissions ──────────────────────────────────────────────────
  ipcMain.handle('permissions:check', () => {
    return checkPermissions()
  })

  ipcMain.handle('permissions:request', async (_e: IpcMainInvokeEvent, type: PermissionType) => {
    return await requestPermission(type)
  })

  // Called by the renderer after onboarding completes and all permissions
  // are granted. Starts the global keyboard hook that was deferred because
  // accessibility permission wasn't available at app launch.
  ipcMain.handle('permissions:all-granted', () => {
    startShortcutsAfterPermission()
  })

  // ── Platform Info ──────────────────────────────────────────────
  ipcMain.handle('platform:info', () => {
    return {
      platform: process.platform,
      isMac: process.platform === 'darwin',
      isWindows: process.platform === 'win32',
      isLinux: process.platform === 'linux',
      arch: process.arch,
      version: process.versions.electron
    }
  })

  // ── Database (Stats & Activity) ────────────────────────────────
  // Stats operations
  ipcMain.handle('db:stats:get', () => {
    return db.getStats()
  })

  ipcMain.handle('db:stats:get-from-activity', () => {
    return db.getWeeklyStatsFromActivity()
  })

  ipcMain.handle('db:stats:update', (_e: IpcMainInvokeEvent, data: Partial<db.StatsData>) => {
    db.updateStats(data)
  })

  ipcMain.handle('db:stats:reset-weekly', () => {
    db.resetWeeklyStats()
  })

  // Activity records operations
  ipcMain.handle('db:activity:get-all', (_e: IpcMainInvokeEvent, limit?: number) => {
    return db.getActivityRecords(limit || 100)
  })

  ipcMain.handle('db:activity:query', (_e: IpcMainInvokeEvent, params?: db.ActivityQuery) => {
    return db.queryActivityRecords(params ?? {})
  })

  ipcMain.handle('db:activity:add', (_e: IpcMainInvokeEvent, record: db.ActivityRecord) => {
    db.addActivityRecord(record)
  })

  ipcMain.handle(
    'db:activity:update',
    (_e: IpcMainInvokeEvent, id: string, update: db.ActivityRecordUpdate) => {
      db.updateActivityRecord(id, update)
    }
  )

  ipcMain.handle('db:activity:delete', async (_e: IpcMainInvokeEvent, id: string) => {
    db.deleteActivityRecord(id)
    await deleteRecording(id)
  })

  ipcMain.handle('db:activity:clear-all', async () => {
    db.clearAllActivityRecords()
    await clearRecordings()
  })

  // ── Saved dictation audio (replay / re-transcribe) ─────────────
  ipcMain.handle(
    'recordings:save',
    (_e: IpcMainInvokeEvent, id: string, data: ArrayBuffer, mimeType: string) => {
      if (getStore().get('keepRecordings') === false) return
      return saveRecording(id, data, mimeType)
    }
  )
  ipcMain.handle('recordings:load', (_e: IpcMainInvokeEvent, id: string) => loadRecording(id))
  ipcMain.handle('recordings:has', (_e: IpcMainInvokeEvent, id: string) => hasRecording(id))
  ipcMain.handle('recordings:has-many', (_e: IpcMainInvokeEvent, ids: string[]) =>
    hasRecordings(Array.isArray(ids) ? ids : [])
  )
  ipcMain.handle('recordings:delete', (_e: IpcMainInvokeEvent, id: string) => deleteRecording(id))
  ipcMain.handle('recordings:clear', () => clearRecordings())

  // ── Context: the app being dictated into ───────────────────────
  ipcMain.handle('context:active-app', () => getActiveApp())

  ipcMain.handle(
    'db:activity:get-by-date-range',
    (_e: IpcMainInvokeEvent, startDate: number, endDate: number) => {
      return db.getActivityRecordsByDateRange(startDate, endDate)
    }
  )

  ipcMain.handle(
    'db:activity:get-stats',
    (_e: IpcMainInvokeEvent, startDate: number, endDate: number) => {
      return db.getActivityStats(startDate, endDate)
    }
  )

  ipcMain.handle('db:cleanup-old-records', (_e: IpcMainInvokeEvent, keepCount?: number) => {
    db.cleanupOldRecords(keepCount)
  })

  // Backup/Export operations
  ipcMain.handle('db:export-json', () => {
    return db.exportToJSON()
  })

  ipcMain.handle(
    'db:import-json',
    (_e: IpcMainInvokeEvent, data: Parameters<typeof db.importFromJSON>[0]) => {
      db.importFromJSON(data)
    }
  )

  // ── Trigger Actions ─────────────────────────────────────────────
  ipcMain.handle('trigger:web-search', async (_e: IpcMainInvokeEvent, params: WebSearchParams) => {
    return await executeWebSearch(params)
  })

  ipcMain.handle('trigger:terminal', async (_e: IpcMainInvokeEvent, params: TerminalParams) => {
    return await executeTerminal(params)
  })

  ipcMain.handle(
    'trigger:keyboard',
    async (_e: IpcMainInvokeEvent, params: { shortcut: string; delay?: number }) => {
      return await executeKeyboard(params)
    }
  )

  ipcMain.handle(
    'trigger:apple-shortcut',
    async (_e: IpcMainInvokeEvent, params: { shortcutName: string; speechInput?: string }) => {
      return await executeAppleShortcut(params)
    }
  )

  ipcMain.handle('trigger:window', async (_e: IpcMainInvokeEvent, params: WindowParams) => {
    return await executeWindow(params)
  })

  ipcMain.handle(
    'trigger:launch-app',
    async (_e: IpcMainInvokeEvent, params: { appPath: string; appName: string }) => {
      return await executeLaunchApp(params)
    }
  )

  ipcMain.handle('trigger:list-apps', async () => {
    return await listInstalledApps()
  })

  ipcMain.handle('trigger:list-shortcuts', async () => {
    return await listAppleShortcuts()
  })
}
