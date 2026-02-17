import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

export type IpcCallback = (...args: unknown[]) => void

// Exposed API to renderer processes
const api = {
  // ── Window Management ──────────────────────────────────────────
  window: {
    show: (type: string) => ipcRenderer.invoke('window:show', type),
    hide: (type: string) => ipcRenderer.invoke('window:hide', type),
    send: (type: string, channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke('window:send', type, channel, ...args),
    setAIPanelExpanded: (expanded: boolean) =>
      ipcRenderer.invoke('window:ai-panel:set-expanded', expanded)
  },

  // ── Recording Pill ─────────────────────────────────────────────
  recordingPill: {
    show: () => ipcRenderer.invoke('recording-pill:show'),
    hide: () => ipcRenderer.invoke('recording-pill:hide'),
    expand: () => ipcRenderer.invoke('recording-pill:expand'),
    collapse: () => ipcRenderer.invoke('recording-pill:collapse'),
    expandFull: () => ipcRenderer.invoke('recording-pill:expand-full'),
    collapseToResults: () => ipcRenderer.invoke('recording-pill:collapse-to-results')
  },

  // ── Recording Control ────────────────────────────────────────────
  recording: {
    cancel: () => ipcRenderer.invoke('recording:cancel')
  },

  // ── Clipboard ──────────────────────────────────────────────────
  clipboard: {
    grabSelectedText: () => ipcRenderer.invoke('clipboard:grab-selected-text'),
    insertText: (text: string) => ipcRenderer.invoke('clipboard:insert-text', text),
    read: () => ipcRenderer.invoke('clipboard:read'),
    write: (text: string) => ipcRenderer.invoke('clipboard:write', text)
  },

  // ── Audio ──────────────────────────────────────────────────────
  audio: {
    encodeWav: (samples: Float32Array, sampleRate: number) =>
      ipcRenderer.invoke('audio:encode-wav', samples, sampleRate),
    cleanup: (filepath: string) => ipcRenderer.invoke('audio:cleanup', filepath)
  },

  // ── Store (Config) ─────────────────────────────────────────────
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
    getAll: () => ipcRenderer.invoke('store:getAll'),
    reset: () => ipcRenderer.invoke('store:reset')
  },

  // ── Shortcuts ────────────────────────────────────────────────────
  shortcuts: {
    get: () => ipcRenderer.invoke('shortcuts:get'),
    update: (shortcuts: { record?: string }) =>
      ipcRenderer.invoke('shortcuts:update', shortcuts),
    reset: () => ipcRenderer.invoke('shortcuts:reset')
  },

  // ── App ────────────────────────────────────────────────────────
  app: {
    setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('app:set-auto-launch', enabled)
  },

  // ── Permissions ──────────────────────────────────────────────────
  permissions: {
    check: () => ipcRenderer.invoke('permissions:check'),
    request: (type: string) => ipcRenderer.invoke('permissions:request', type),
    allGranted: () => ipcRenderer.invoke('permissions:all-granted')
  },

  // ── Platform Info ──────────────────────────────────────────────
  platform: {
    info: () => ipcRenderer.invoke('platform:info')
  },

  // ── Database (Stats & Activity) ────────────────────────────────
  db: {
    stats: {
      get: () => ipcRenderer.invoke('db:stats:get'),
      getFromActivity: () => ipcRenderer.invoke('db:stats:get-from-activity'),
      update: (data: any) => ipcRenderer.invoke('db:stats:update', data),
      resetWeekly: () => ipcRenderer.invoke('db:stats:reset-weekly')
    },
    activity: {
      getAll: (limit?: number) => ipcRenderer.invoke('db:activity:get-all', limit),
      add: (record: any) => ipcRenderer.invoke('db:activity:add', record),
      delete: (id: string) => ipcRenderer.invoke('db:activity:delete', id),
      clearAll: () => ipcRenderer.invoke('db:activity:clear-all'),
      getByDateRange: (startDate: number, endDate: number) =>
        ipcRenderer.invoke('db:activity:get-by-date-range', startDate, endDate),
      getStats: (startDate: number, endDate: number) =>
        ipcRenderer.invoke('db:activity:get-stats', startDate, endDate)
    },
    cleanupOldRecords: (keepCount?: number) => ipcRenderer.invoke('db:cleanup-old-records', keepCount),
    exportJSON: () => ipcRenderer.invoke('db:export-json'),
    importJSON: (data: any) => ipcRenderer.invoke('db:import-json', data)
  },

  // ── Trigger Actions ──────────────────────────────────────────────
  triggers: {
    webSearch: (params: { url: string; browser: string }) =>
      ipcRenderer.invoke('trigger:web-search', params),
    terminal: (params: { commands: string[]; executionMode: string; speechInput?: string }) =>
      ipcRenderer.invoke('trigger:terminal', params),
    keyboard: (params: { shortcut: string; delay?: number }) =>
      ipcRenderer.invoke('trigger:keyboard', params),
    appleShortcut: (params: { shortcutName: string; speechInput?: string }) =>
      ipcRenderer.invoke('trigger:apple-shortcut', params),
    window: (params: { action: string }) =>
      ipcRenderer.invoke('trigger:window', params),
    launchApp: (params: { appPath: string; appName: string }) =>
      ipcRenderer.invoke('trigger:launch-app', params),
    listApps: () => ipcRenderer.invoke('trigger:list-apps') as Promise<{ name: string; path: string }[]>,
    listShortcuts: () => ipcRenderer.invoke('trigger:list-shortcuts') as Promise<string[]>
  },

  // ── Event Listeners (from main process) ────────────────────────
  on: (channel: string, callback: IpcCallback) => {
    const subscription = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  },

  once: (channel: string, callback: IpcCallback) => {
    ipcRenderer.once(channel, (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args))
  },

  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  }
}

// Expose the API to the renderer
contextBridge.exposeInMainWorld('tapwisper', api)

// Type declaration for TypeScript
export type TapWisperAPI = typeof api
