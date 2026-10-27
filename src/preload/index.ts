import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type {
  ChatInput,
  DeviceProfile,
  LocalAiResult,
  LocalModelKind,
  SelfHostedEndpoint,
  SelfHostedTestResult,
  SidecarStatus,
  TranscribeInput
} from '../shared/local-ai/types'

export type IpcCallback = (...args: unknown[]) => void

/** A rectangle in window (CSS pixel) coordinates. */
export interface OverlayRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ActivityRecordDTO {
  id: string
  timestamp: number
  type: 'voice' | 'voice-with-llm'
  transcription: string
  durationSeconds: number
  wordCount: number
  llmAction?: string
  llmInput?: string
  llmResult?: string
  /** Transcript before dictionary / Smart Formatting, when it differs */
  rawTranscription?: string | null
  /** App the text was dictated into */
  appName?: string | null
  /** Spoken language (ISO-639-1), when known */
  language?: string | null
}

export type ActivityRecordUpdate = Partial<
  Pick<
    ActivityRecordDTO,
    'transcription' | 'rawTranscription' | 'wordCount' | 'language' | 'llmResult'
  >
>

export interface ActiveAppInfo {
  name: string
  bundleId?: string
  title?: string
}

// ── Notetaker (meeting notes) ─────────────────────────────────────

export type MeetingStatus = 'recording' | 'processing' | 'done' | 'interrupted'
/** 'you' = the user's microphone, 'others' = meeting (system) audio */
export type SegmentSource = 'you' | 'others'

export interface MeetingDTO {
  id: string
  title: string
  startedAt: number
  endedAt: number | null
  durationSeconds: number
  status: MeetingStatus
  appName: string | null
  notes: string
  summary: string
  speakerNames: Partial<Record<SegmentSource, string>>
  wordCount: number
}

export interface MeetingSegmentDTO {
  id: string
  meetingId: string
  source: SegmentSource
  startMs: number
  endMs: number
  text: string
  /** Live translation of `text`, when enabled */
  translation?: string | null
  /** Language code `translation` is in */
  translatedTo?: string | null
}

export type MeetingUpdateDTO = Partial<
  Pick<
    MeetingDTO,
    | 'title'
    | 'endedAt'
    | 'durationSeconds'
    | 'status'
    | 'appName'
    | 'notes'
    | 'summary'
    | 'speakerNames'
  >
>

export interface MeetingRecorderState {
  meetingId: string | null
  status: 'idle' | 'recording' | 'paused'
  appName: string | null
  /** Recorded time (pauses excluded) at the moment of this report, ms */
  elapsedMs: number
  /** Epoch ms when the current running span began; null while paused/idle */
  runningSince: number | null
}

export interface ActivityQueryParams {
  offset?: number
  limit?: number
  search?: string
}

export interface ActivityQueryResult {
  records: ActivityRecordDTO[]
  total: number
}

// ── Initial theme ────────────────────────────────────────────────
// The main process passes the resolved theme as a command-line switch so the
// `dark` class is on <html> before the first paint (no flash of the wrong
// theme). App.tsx takes over once React mounts.
const themeSwitch = process.argv.find((arg) => arg.startsWith('--tapwisper-theme='))
if (themeSwitch) {
  const isDark = themeSwitch.endsWith('=dark')
  const applyInitialTheme = (): boolean => {
    const root = document.documentElement
    if (!root) return false
    root.classList.toggle('dark', isDark)
    return true
  }
  if (!applyInitialTheme()) {
    document.addEventListener('readystatechange', applyInitialTheme, { once: true })
  }
}

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

  // ── Overlay click-through ──────────────────────────────────────
  // Transparent overlays ignore the mouse except over their visible card.
  overlay: {
    /** macOS/Windows: report that the cursor entered (true) / left (false) the card. */
    setInteractive: (interactive: boolean): Promise<void> =>
      ipcRenderer.invoke('overlay:set-interactive', interactive),
    /** Linux: report the visible rectangles; everything else is click-through. */
    setHitRegion: (rects: OverlayRect[]): Promise<void> =>
      ipcRenderer.invoke('overlay:set-hit-region', rects)
  },

  // ── Recording Pill ─────────────────────────────────────────────
  recordingPill: {
    show: () => ipcRenderer.invoke('recording-pill:show'),
    hide: () => ipcRenderer.invoke('recording-pill:hide'),
    expand: () => ipcRenderer.invoke('recording-pill:expand'),
    collapse: () => ipcRenderer.invoke('recording-pill:collapse'),
    expandFull: () => ipcRenderer.invoke('recording-pill:expand-full'),
    collapseToResults: () => ipcRenderer.invoke('recording-pill:collapse-to-results'),
    setClickable: (clickable: boolean) =>
      ipcRenderer.invoke('recording-pill:set-clickable', clickable)
  },

  // ── Recording Control ────────────────────────────────────────────
  recording: {
    cancel: () => ipcRenderer.invoke('recording:cancel'),
    transcriptionDone: (text: string) => ipcRenderer.invoke('recording:transcription-done', text)
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
    /** Rejects shortcuts main can't listen for (`error: 'unsupported-shortcut'`) */
    update: (shortcuts: { record?: string }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('shortcuts:update', shortcuts),
    reset: () => ipcRenderer.invoke('shortcuts:reset'),
    /** macOS: whether the fn/Globe helper is installed (else fn acts as Ctrl+Option) */
    fnAvailable: (): Promise<boolean> => ipcRenderer.invoke('shortcuts:fn-available')
  },

  // ── App ────────────────────────────────────────────────────────
  app: {
    setAutoLaunch: (enabled: boolean): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('app:set-auto-launch', enabled),
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version')
  },

  // ── Permissions ──────────────────────────────────────────────────
  permissions: {
    check: () => ipcRenderer.invoke('permissions:check'),
    request: (type: string) => ipcRenderer.invoke('permissions:request', type),
    allGranted: () => ipcRenderer.invoke('permissions:all-granted')
  },

  // ── Platform Info ──────────────────────────────────────────────
  platform: {
    info: () => ipcRenderer.invoke('platform:info'),
    /** Synchronous OS identifier: 'darwin' | 'win32' | 'linux' | ... */
    os: process.platform as string
  },

  // ── Database (Stats & Activity) ────────────────────────────────
  db: {
    stats: {
      get: () => ipcRenderer.invoke('db:stats:get'),
      getFromActivity: () => ipcRenderer.invoke('db:stats:get-from-activity'),
      update: (data: Record<string, unknown>) => ipcRenderer.invoke('db:stats:update', data),
      resetWeekly: () => ipcRenderer.invoke('db:stats:reset-weekly')
    },
    activity: {
      getAll: (limit?: number) => ipcRenderer.invoke('db:activity:get-all', limit),
      /** Paged + searchable query, newest first; `total` counts all matches. */
      query: (params: ActivityQueryParams): Promise<ActivityQueryResult> =>
        ipcRenderer.invoke('db:activity:query', params),
      add: (record: ActivityRecordDTO) => ipcRenderer.invoke('db:activity:add', record),
      update: (id: string, update: ActivityRecordUpdate): Promise<void> =>
        ipcRenderer.invoke('db:activity:update', id, update),
      delete: (id: string) => ipcRenderer.invoke('db:activity:delete', id),
      clearAll: () => ipcRenderer.invoke('db:activity:clear-all'),
      getByDateRange: (startDate: number, endDate: number) =>
        ipcRenderer.invoke('db:activity:get-by-date-range', startDate, endDate),
      getStats: (startDate: number, endDate: number) =>
        ipcRenderer.invoke('db:activity:get-stats', startDate, endDate)
    },
    cleanupOldRecords: (keepCount?: number) =>
      ipcRenderer.invoke('db:cleanup-old-records', keepCount),
    exportJSON: () => ipcRenderer.invoke('db:export-json'),
    importJSON: (data: unknown) => ipcRenderer.invoke('db:import-json', data)
  },

  // ── Saved dictation audio (keyed by activity record id) ─────────
  recordings: {
    /** No-op when the user disabled keepRecordings */
    save: (id: string, data: ArrayBuffer, mimeType: string): Promise<void> =>
      ipcRenderer.invoke('recordings:save', id, data, mimeType),
    load: (id: string): Promise<{ data: ArrayBuffer; mimeType: string } | null> =>
      ipcRenderer.invoke('recordings:load', id),
    has: (id: string): Promise<boolean> => ipcRenderer.invoke('recordings:has', id),
    /** Batch version of `has` — one call per history page */
    hasMany: (ids: string[]): Promise<Record<string, boolean>> =>
      ipcRenderer.invoke('recordings:has-many', ids),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('recordings:delete', id),
    clear: (): Promise<void> => ipcRenderer.invoke('recordings:clear')
  },

  // ── Notetaker (meeting notes) ───────────────────────────────────
  meetings: {
    create: (meeting: {
      id: string
      startedAt: number
      appName?: string | null
    }): Promise<MeetingDTO> => ipcRenderer.invoke('meetings:create', meeting),
    get: (id: string): Promise<MeetingDTO | null> => ipcRenderer.invoke('meetings:get', id),
    /** Newest first; search covers title, notes, summary and transcript */
    list: (query?: {
      search?: string
      limit?: number
      offset?: number
    }): Promise<{ meetings: MeetingDTO[]; total: number }> =>
      ipcRenderer.invoke('meetings:list', query),
    /** Broadcasts `meetings:changed` (the updated meeting) to every window */
    update: (id: string, update: MeetingUpdateDTO): Promise<MeetingDTO | null> =>
      ipcRenderer.invoke('meetings:update', id, update),
    /** Broadcasts `meetings:changed` with `{ id, deleted: true }` */
    delete: (id: string): Promise<void> => ipcRenderer.invoke('meetings:delete', id),
    /** Broadcasts `meetings:segment` (the segment) to every window */
    addSegment: (segment: MeetingSegmentDTO): Promise<void> =>
      ipcRenderer.invoke('meetings:add-segment', segment),
    segments: (meetingId: string): Promise<MeetingSegmentDTO[]> =>
      ipcRenderer.invoke('meetings:segments', meetingId),
    /** Broadcasts `meetings:segment-translated` (the updated segment) */
    setSegmentTranslation: (
      id: string,
      translation: string,
      translatedTo: string
    ): Promise<MeetingSegmentDTO | null> =>
      ipcRenderer.invoke('meetings:set-segment-translation', id, translation, translatedTo),
    /** Reported by the notepad's recorder; broadcast as `meeting:state` */
    setState: (state: MeetingRecorderState): Promise<void> =>
      ipcRenderer.invoke('meetings:set-state', state),
    getState: (): Promise<MeetingRecorderState> => ipcRenderer.invoke('meetings:get-state'),
    /** Open the notepad and start recording (notepad receives `notepad:request` {start}) */
    start: (appName?: string): Promise<void> => ipcRenderer.invoke('meetings:start', appName),
    /** Ask the notepad to stop (notepad receives `notepad:stop`) */
    stop: (): Promise<void> => ipcRenderer.invoke('meetings:stop'),
    /** Show the notepad, optionally on a meeting (notepad receives `notepad:request` {meetingId}) */
    openNotepad: (meetingId?: string): Promise<void> =>
      ipcRenderer.invoke('meetings:open-notepad', meetingId),
    hideNotepad: (): Promise<void> => ipcRenderer.invoke('meetings:hide-notepad'),
    /** Latest uncollected `notepad:request` (the notepad calls this on mount) */
    takeNotepadRequest: (): Promise<{
      meetingId?: string
      start?: boolean
      appName?: string
    } | null> => ipcRenderer.invoke('meetings:take-notepad-request'),
    /** reason: 'macos-too-old' | 'permission-needed' | 'linux-use-monitor' */
    systemAudioSupport: (): Promise<{ supported: boolean; reason?: string }> =>
      ipcRenderer.invoke('meetings:system-audio-support'),
    /** Save dialog → writes the Markdown file; resolves { saved: false } if cancelled */
    exportMarkdown: (
      suggestedName: string,
      content: string
    ): Promise<{ saved: boolean; filePath?: string }> =>
      ipcRenderer.invoke('meetings:export-markdown', suggestedName, content),
    /** Re-read the recognizeMeetings setting and start/stop detection */
    applyDetectionSetting: (): Promise<void> =>
      ipcRenderer.invoke('meetings:apply-detection-setting')
  },

  // ── Context ─────────────────────────────────────────────────────
  context: {
    /** Frontmost app (null if unavailable, e.g. missing permission) */
    activeApp: (): Promise<ActiveAppInfo | null> => ipcRenderer.invoke('context:active-app')
  },

  // ── Local models (on-device whisper.cpp / llama.cpp) ────────────
  // Progress and status arrive as `localAi:download-progress` / `localAi:status` events
  localAi: {
    profile: (): Promise<DeviceProfile> => ipcRenderer.invoke('localAi:profile'),
    /** Ids of downloaded catalog models */
    installed: (): Promise<string[]> => ipcRenderer.invoke('localAi:installed'),
    status: (): Promise<SidecarStatus[]> => ipcRenderer.invoke('localAi:status'),
    download: (id: string): Promise<LocalAiResult<void>> =>
      ipcRenderer.invoke('localAi:download', id),
    cancelDownload: (id: string): Promise<void> =>
      ipcRenderer.invoke('localAi:cancel-download', id),
    delete: (id: string): Promise<LocalAiResult<void>> => ipcRenderer.invoke('localAi:delete', id),
    /** Load the active model ahead of the first request */
    warmUp: (kind: LocalModelKind): Promise<LocalAiResult<void>> =>
      ipcRenderer.invoke('localAi:warm-up', kind),
    /** Clear a failed state so the next request starts the server again */
    retry: (kind: LocalModelKind): Promise<void> => ipcRenderer.invoke('localAi:retry', kind),
    transcribe: (input: TranscribeInput): Promise<LocalAiResult<string>> =>
      ipcRenderer.invoke('localAi:transcribe', input),
    chat: (input: ChatInput): Promise<LocalAiResult<string>> =>
      ipcRenderer.invoke('localAi:chat', input),
    chooseModelsDir: (): Promise<string | null> => ipcRenderer.invoke('localAi:choose-models-dir'),
    openModelsDir: (): Promise<void> => ipcRenderer.invoke('localAi:open-models-dir')
  },

  // ── Self-hosted OpenAI-compatible servers ───────────────────────
  selfHosted: {
    test: (
      kind: LocalModelKind,
      target: SelfHostedEndpoint & { apiKey: string }
    ): Promise<LocalAiResult<SelfHostedTestResult>> =>
      ipcRenderer.invoke('selfHosted:test', kind, target),
    transcribe: (input: TranscribeInput): Promise<LocalAiResult<string>> =>
      ipcRenderer.invoke('selfHosted:transcribe', input),
    chat: (input: ChatInput): Promise<LocalAiResult<string>> =>
      ipcRenderer.invoke('selfHosted:chat', input)
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
    window: (params: { action: string }) => ipcRenderer.invoke('trigger:window', params),
    launchApp: (params: { appPath: string; appName: string }) =>
      ipcRenderer.invoke('trigger:launch-app', params),
    listApps: () =>
      ipcRenderer.invoke('trigger:list-apps') as Promise<{ name: string; path: string }[]>,
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
