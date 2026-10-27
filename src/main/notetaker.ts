/**
 * Notetaker coordination in the main process:
 * - meeting storage IPC (meetings-db)
 * - which meeting is being recorded (the notepad window records; main only
 *   tracks state for the tray, the main window banner and detection)
 * - system-audio ("meeting audio") capture via getDisplayMedia loopback
 * - meeting detection → "Take notes?" notification
 */

import {
  BrowserWindow,
  dialog,
  ipcMain,
  IpcMainInvokeEvent,
  Notification,
  desktopCapturer,
  session,
  systemPreferences
} from 'electron'
import fsp from 'fs/promises'
import { WindowManager } from './windows'
import { getStore } from './store'
import {
  initMeetingsSchema,
  recoverInterruptedMeetings,
  createMeeting,
  getMeeting,
  listMeetings,
  updateMeeting,
  deleteMeeting,
  addSegment,
  getSegments,
  setSegmentTranslation,
  type MeetingSegment,
  type MeetingUpdate
} from './meetings-db'
import { startMeetingDetector, stopMeetingDetector, type DetectedMeeting } from './meeting-detector'

export type RecorderStatus = 'idle' | 'recording' | 'paused'

export interface MeetingState {
  meetingId: string | null
  status: RecorderStatus
  /** Meeting app, when known */
  appName: string | null
}

let state: MeetingState = { meetingId: null, status: 'idle', appName: null }
let windowManagerRef: WindowManager | null = null
let onStateChange: ((state: MeetingState) => void) | null = null

export function getMeetingState(): MeetingState {
  return state
}

function setState(next: MeetingState): void {
  state = next
  windowManagerRef?.broadcast('meeting:state', state)
  onStateChange?.(state)
}

/** Open the notepad and start a new meeting recording */
export function startMeetingNotes(appName?: string): void {
  windowManagerRef?.showNotepad({ start: true, appName })
}

/** Ask the notepad to stop the current recording (it finalizes and summarizes) */
export function stopMeetingNotes(): void {
  windowManagerRef?.sendToWindow('notepad', 'notepad:stop')
}

export function openNotepad(meetingId?: string): void {
  windowManagerRef?.showNotepad(meetingId ? { meetingId } : undefined)
}

// ── Meeting detection ─────────────────────────────────────────────

function onMeetingDetected(meeting: DetectedMeeting): void {
  windowManagerRef?.sendToWindow('main', 'meeting:detected', meeting)
  if (!Notification.isSupported()) return
  const notification = new Notification({
    title: `${meeting.app} call detected`,
    body: 'Click to take notes with TapWisper. Let everyone know you are recording.',
    silent: true
  })
  notification.on('click', () => startMeetingNotes(meeting.app))
  notification.show()
}

export function applyMeetingDetectionSetting(): void {
  if (getStore().get('recognizeMeetings') === false) {
    stopMeetingDetector()
  } else {
    startMeetingDetector(onMeetingDetected, () => state.status !== 'idle')
  }
}

// ── System audio (meeting audio) capture ──────────────────────────

/**
 * Grant getDisplayMedia() requests with loopback (system) audio so the
 * notepad can hear the other participants. The video track is discarded by
 * the renderer. Windows supports loopback natively; macOS needs 13+ and the
 * screen & system audio recording permission; Linux has no loopback (the
 * renderer falls back to a PulseAudio/PipeWire "Monitor" input if present).
 */
function registerDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => {
          if (sources.length === 0) {
            callback({})
            return
          }
          callback({ video: sources[0], audio: 'loopback' })
        })
        .catch(() => callback({}))
    },
    { useSystemPicker: false }
  )
}

/** Whether capturing meeting audio is likely to work on this machine */
function systemAudioSupport(): { supported: boolean; reason?: string } {
  if (process.platform === 'win32') return { supported: true }
  if (process.platform === 'darwin') {
    const major = Number(process.getSystemVersion().split('.')[0])
    if (major < 13) return { supported: false, reason: 'macos-too-old' }
    const status = systemPreferences.getMediaAccessStatus('screen')
    if (status !== 'granted') return { supported: true, reason: 'permission-needed' }
    return { supported: true }
  }
  return { supported: false, reason: 'linux-use-monitor' }
}

// ── IPC ───────────────────────────────────────────────────────────

export function registerNotetaker(
  windowManager: WindowManager,
  stateListener?: (state: MeetingState) => void
): void {
  windowManagerRef = windowManager
  onStateChange = stateListener ?? null

  initMeetingsSchema()
  recoverInterruptedMeetings()
  registerDisplayMediaHandler()
  applyMeetingDetectionSetting()

  ipcMain.handle(
    'meetings:create',
    (_e: IpcMainInvokeEvent, meeting: { id: string; startedAt: number; appName?: string | null }) =>
      createMeeting(meeting)
  )
  ipcMain.handle('meetings:get', (_e: IpcMainInvokeEvent, id: string) => getMeeting(id))
  ipcMain.handle(
    'meetings:list',
    (_e: IpcMainInvokeEvent, query?: { search?: string; limit?: number; offset?: number }) =>
      listMeetings(query ?? {})
  )
  ipcMain.handle('meetings:update', (_e: IpcMainInvokeEvent, id: string, update: MeetingUpdate) => {
    updateMeeting(id, update)
    const meeting = getMeeting(id)
    windowManager.broadcast('meetings:changed', meeting)
    return meeting
  })
  ipcMain.handle('meetings:delete', (_e: IpcMainInvokeEvent, id: string) => {
    deleteMeeting(id)
    windowManager.broadcast('meetings:changed', { id, deleted: true })
  })
  ipcMain.handle('meetings:add-segment', (_e: IpcMainInvokeEvent, segment: MeetingSegment) => {
    addSegment(segment)
    windowManager.broadcast('meetings:segment', segment)
  })
  ipcMain.handle('meetings:segments', (_e: IpcMainInvokeEvent, meetingId: string) =>
    getSegments(meetingId)
  )
  ipcMain.handle(
    'meetings:set-segment-translation',
    (_e: IpcMainInvokeEvent, id: string, translation: string, translatedTo: string) => {
      const segment = setSegmentTranslation(id, translation, translatedTo)
      if (segment) windowManager.broadcast('meetings:segment-translated', segment)
      return segment
    }
  )

  // Recorder state reported by the notepad
  ipcMain.handle('meetings:set-state', (_e: IpcMainInvokeEvent, next: MeetingState) => {
    setState({
      meetingId: next.meetingId ?? null,
      status: next.status ?? 'idle',
      appName: next.appName ?? null
    })
  })
  ipcMain.handle('meetings:get-state', () => state)

  ipcMain.handle('meetings:start', (_e: IpcMainInvokeEvent, appName?: string) =>
    startMeetingNotes(appName)
  )
  ipcMain.handle('meetings:stop', () => stopMeetingNotes())
  ipcMain.handle('meetings:open-notepad', (_e: IpcMainInvokeEvent, meetingId?: string) =>
    openNotepad(meetingId)
  )
  ipcMain.handle('meetings:hide-notepad', () => windowManager.hideNotepad())
  ipcMain.handle('meetings:system-audio-support', () => systemAudioSupport())
  ipcMain.handle('meetings:apply-detection-setting', () => applyMeetingDetectionSetting())

  // Save a meeting as a Markdown file chosen by the user
  ipcMain.handle(
    'meetings:export-markdown',
    async (e: IpcMainInvokeEvent, suggestedName: string, content: string) => {
      const owner = BrowserWindow.fromWebContents(e.sender) ?? undefined
      const safeName = (suggestedName || 'Meeting notes').replace(/[\\/:*?"<>|]+/g, ' ').trim()
      const options = {
        defaultPath: `${safeName.slice(0, 100)}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      }
      const result = owner
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return { saved: false }
      await fsp.writeFile(result.filePath, content, 'utf8')
      return { saved: true, filePath: result.filePath }
    }
  )
}
