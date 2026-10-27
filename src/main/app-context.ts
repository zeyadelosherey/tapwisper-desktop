/**
 * The app the user is dictating into, used to pick a writing style.
 * get-windows is ESM-only, so it is loaded lazily with a dynamic import.
 */

export interface ActiveAppInfo {
  name: string
  bundleId?: string
  title?: string
}

type ActiveWindowFn = (options?: {
  accessibilityPermission?: boolean
  screenRecordingPermission?: boolean
}) => Promise<
  | {
      title?: string
      owner?: { name?: string; bundleId?: string }
    }
  | undefined
>

let activeWindowFn: ActiveWindowFn | null = null

export async function getActiveApp(): Promise<ActiveAppInfo | null> {
  try {
    if (!activeWindowFn) {
      const mod = (await import('get-windows')) as { activeWindow: ActiveWindowFn }
      activeWindowFn = mod.activeWindow
    }
    // Don't trigger the macOS screen-recording prompt just to read a title
    const win = await activeWindowFn({ screenRecordingPermission: false })
    if (!win?.owner?.name) return null
    return { name: win.owner.name, bundleId: win.owner.bundleId, title: win.title || undefined }
  } catch {
    return null
  }
}
