import { systemPreferences, shell } from 'electron'

// ── Types ────────────────────────────────────────────────────────

export type PermissionType = 'microphone' | 'accessibility' | 'screenRecording'

export type PermissionStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'

export interface PermissionResult {
  microphone: PermissionStatus
  accessibility: PermissionStatus
  screenRecording: PermissionStatus
}

// ── macOS System Settings deep links ─────────────────────────────

const MAC_SETTINGS_URLS: Record<string, string> = {
  accessibility:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  screenRecording:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  microphone:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
}

// ── Windows Settings deep links ──────────────────────────────────

const WINDOWS_SETTINGS_URLS: Record<string, string> = {
  microphone: 'ms-settings:privacy-microphone'
}

// ── Permission Checking ──────────────────────────────────────────

/**
 * Check all permission statuses for the current platform.
 *
 * - macOS: checks microphone, accessibility, and screen recording
 * - Windows/Linux: only microphone is relevant; accessibility and
 *   screen recording are always reported as 'granted'
 */
export function checkPermissions(): PermissionResult {
  const isMac = process.platform === 'darwin'

  return {
    microphone: checkMicrophonePermission(),
    accessibility: isMac ? checkAccessibilityPermission() : 'granted',
    screenRecording: isMac ? checkScreenRecordingPermission() : 'granted'
  }
}

function checkMicrophonePermission(): PermissionStatus {
  try {
    const status = systemPreferences.getMediaAccessStatus('microphone')
    return normalizeStatus(status)
  } catch {
    return 'unknown'
  }
}

function checkAccessibilityPermission(): PermissionStatus {
  try {
    const trusted = systemPreferences.isTrustedAccessibilityClient(false)
    return trusted ? 'granted' : 'denied'
  } catch {
    return 'unknown'
  }
}

function checkScreenRecordingPermission(): PermissionStatus {
  try {
    const status = systemPreferences.getMediaAccessStatus('screen')
    return normalizeStatus(status)
  } catch {
    return 'unknown'
  }
}

/**
 * Normalize Electron's media access status string to our PermissionStatus type.
 * Electron returns: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'
 */
function normalizeStatus(status: string): PermissionStatus {
  switch (status) {
    case 'granted':
      return 'granted'
    case 'denied':
      return 'denied'
    case 'not-determined':
      return 'not-determined'
    case 'restricted':
      return 'restricted'
    default:
      return 'unknown'
  }
}

// ── Permission Requesting ────────────────────────────────────────

/**
 * Request or prompt the user to grant a specific permission.
 *
 * - Microphone (macOS): triggers the native permission dialog
 * - Microphone (Windows): returns 'use-renderer' so the renderer
 *   can call `getUserMedia()` which triggers the Windows privacy prompt
 * - Accessibility / Screen Recording (macOS): opens System Settings
 *   since these can only be toggled manually by the user
 * - Accessibility / Screen Recording (Windows): no-op (always granted)
 *
 * Returns the updated permission status after the request.
 */
export async function requestPermission(
  type: PermissionType
): Promise<{ status: PermissionStatus; action: 'requested' | 'opened-settings' | 'use-renderer' | 'not-required' }> {
  const isMac = process.platform === 'darwin'
  const isWindows = process.platform === 'win32'

  switch (type) {
    case 'microphone':
      return await requestMicrophonePermission(isMac, isWindows)

    case 'accessibility':
      if (!isMac) return { status: 'granted', action: 'not-required' }
      return await openSystemSettings('accessibility')

    case 'screenRecording':
      if (!isMac) return { status: 'granted', action: 'not-required' }
      return await openSystemSettings('screenRecording')

    default:
      return { status: 'unknown', action: 'not-required' }
  }
}

async function requestMicrophonePermission(
  isMac: boolean,
  isWindows: boolean
): Promise<{ status: PermissionStatus; action: 'requested' | 'opened-settings' | 'use-renderer' }> {
  if (isMac) {
    try {
      const granted = await systemPreferences.askForMediaAccess('microphone')
      return {
        status: granted ? 'granted' : 'denied',
        action: 'requested'
      }
    } catch {
      return { status: 'unknown', action: 'requested' }
    }
  }

  // On Windows, the native microphone prompt is triggered via getUserMedia
  // in the renderer process. If already denied, open Windows privacy settings.
  if (isWindows) {
    const current = checkMicrophonePermission()
    if (current === 'denied') {
      await shell.openExternal(WINDOWS_SETTINGS_URLS.microphone)
      return { status: current, action: 'opened-settings' }
    }
    return { status: current, action: 'use-renderer' }
  }

  // Linux: similar to Windows — getUserMedia triggers the prompt
  return { status: checkMicrophonePermission(), action: 'use-renderer' }
}

async function openSystemSettings(
  type: 'accessibility' | 'screenRecording' | 'microphone'
): Promise<{ status: PermissionStatus; action: 'opened-settings' }> {
  const url = MAC_SETTINGS_URLS[type]
  if (url) {
    await shell.openExternal(url)
  }

  // Re-check after opening (user hasn't toggled yet, but status is current)
  const permissions = checkPermissions()
  const status = type === 'screenRecording' ? permissions.screenRecording : permissions[type]

  return { status, action: 'opened-settings' }
}
