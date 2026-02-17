import { ipcMain, IpcMainInvokeEvent, app } from 'electron'
import { WindowManager } from './windows'
import { ClipboardManager } from './clipboard'
import { getStore } from './store'
import { encodeWav, saveTempAudio, cleanupAudioFile } from './audio'
import { reloadShortcuts, cancelRecording, startShortcutsAfterPermission } from './shortcuts'
import { checkPermissions, requestPermission } from './permissions'
import type { PermissionType } from './permissions'
import * as db from './database'
import {
  executeWebSearch,
  executeTerminal,
  executeKeyboard,
  executeAppleShortcut,
  executeWindow,
  executeLaunchApp,
  listInstalledApps,
  listAppleShortcuts
} from './trigger-actions'

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

  ipcMain.handle('window:send', (_e: IpcMainInvokeEvent, type: string, channel: string, ...args: unknown[]) => {
    windowManager.sendToWindow(type as any, channel, ...args)
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

  // ── Recording Control ───────────────────────────────────────────
  ipcMain.handle('recording:cancel', () => {
    cancelRecording()
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
  ipcMain.handle('audio:encode-wav', async (_e: IpcMainInvokeEvent, samples: Float32Array, sampleRate: number) => {
    const wavBuffer = encodeWav(samples, sampleRate)
    return await saveTempAudio(wavBuffer)
  })

  ipcMain.handle('audio:cleanup', async (_e: IpcMainInvokeEvent, filepath: string) => {
    await cleanupAudioFile(filepath)
  })

  // ── Store (Config) ─────────────────────────────────────────────
  ipcMain.handle('store:get', (_e: IpcMainInvokeEvent, key: string) => {
    const store = getStore()
    return store.get(key as any)
  })

  ipcMain.handle('store:set', (_e: IpcMainInvokeEvent, key: string, value: unknown) => {
    const store = getStore()
    store.set(key as any, value as any)
  })

  ipcMain.handle('store:getAll', () => {
    const store = getStore()
    return store.store
  })

  ipcMain.handle('store:reset', () => {
    const store = getStore()
    store.clear()
  })

  // ── Auto Launch ────────────────────────────────────────────────
  ipcMain.handle('app:set-auto-launch', (_e: IpcMainInvokeEvent, enabled: boolean) => {
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: true
      })
    } catch {
      // "Operation not permitted" in dev mode or when app isn't properly signed
    }
  })

  // Apply stored auto-launch setting on startup
  {
    const currentStore = getStore()
    const savedAutoLaunch = currentStore.get('autoLaunch')
    if (savedAutoLaunch) {
      try {
        app.setLoginItemSettings({
          openAtLogin: true,
          openAsHidden: true
        })
      } catch {
        // Ignore in dev mode — login items require a packaged/signed app
      }
    }
  }

  // ── Shortcuts ────────────────────────────────────────────────────
  ipcMain.handle('shortcuts:update', (_e: IpcMainInvokeEvent, shortcuts: { record?: string }) => {
    const store = getStore()
    store.set('shortcuts', shortcuts)
    reloadShortcuts()
  })

  ipcMain.handle('shortcuts:get', () => {
    const store = getStore()
    return store.get('shortcuts')
  })

  ipcMain.handle('shortcuts:reset', () => {
    const store = getStore()
    store.set('shortcuts', {
      record: 'Option+Space'
    })
    reloadShortcuts()
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

  ipcMain.handle('db:activity:add', (_e: IpcMainInvokeEvent, record: db.ActivityRecord) => {
    db.addActivityRecord(record)
  })

  ipcMain.handle('db:activity:delete', (_e: IpcMainInvokeEvent, id: string) => {
    db.deleteActivityRecord(id)
  })

  ipcMain.handle('db:activity:clear-all', () => {
    db.clearAllActivityRecords()
  })

  ipcMain.handle('db:activity:get-by-date-range', (_e: IpcMainInvokeEvent, startDate: number, endDate: number) => {
    return db.getActivityRecordsByDateRange(startDate, endDate)
  })

  ipcMain.handle('db:activity:get-stats', (_e: IpcMainInvokeEvent, startDate: number, endDate: number) => {
    return db.getActivityStats(startDate, endDate)
  })

  ipcMain.handle('db:cleanup-old-records', (_e: IpcMainInvokeEvent, keepCount?: number) => {
    db.cleanupOldRecords(keepCount)
  })

  // Backup/Export operations
  ipcMain.handle('db:export-json', () => {
    return db.exportToJSON()
  })

  ipcMain.handle('db:import-json', (_e: IpcMainInvokeEvent, data: any) => {
    db.importFromJSON(data)
  })

  // ── Trigger Actions ─────────────────────────────────────────────
  ipcMain.handle('trigger:web-search', async (_e: IpcMainInvokeEvent, params: { url: string; browser: string }) => {
    return await executeWebSearch(params as any)
  })

  ipcMain.handle('trigger:terminal', async (_e: IpcMainInvokeEvent, params: { commands: string[]; executionMode: string; speechInput?: string }) => {
    return await executeTerminal(params as any)
  })

  ipcMain.handle('trigger:keyboard', async (_e: IpcMainInvokeEvent, params: { shortcut: string; delay?: number }) => {
    return await executeKeyboard(params)
  })

  ipcMain.handle('trigger:apple-shortcut', async (_e: IpcMainInvokeEvent, params: { shortcutName: string; speechInput?: string }) => {
    return await executeAppleShortcut(params)
  })

  ipcMain.handle('trigger:window', async (_e: IpcMainInvokeEvent, params: { action: string }) => {
    return await executeWindow(params as any)
  })

  ipcMain.handle('trigger:launch-app', async (_e: IpcMainInvokeEvent, params: { appPath: string; appName: string }) => {
    return await executeLaunchApp(params)
  })

  ipcMain.handle('trigger:list-apps', async () => {
    return await listInstalledApps()
  })

  ipcMain.handle('trigger:list-shortcuts', async () => {
    return await listAppleShortcuts()
  })
}
