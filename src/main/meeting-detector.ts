/**
 * Recognises when a call is in the foreground (Zoom, Google Meet, Teams,
 * Slack huddles, Webex, FaceTime…) so TapWisper can offer to take notes —
 * the call app keeps working as usual, nothing joins the meeting.
 *
 * Detection is heuristic, from the frontmost app name and window title.
 */

import { getActiveApp } from './app-context'

export interface DetectedMeeting {
  /** Friendly app name shown to the user */
  app: string
  /** Stable key so the same call isn't offered twice */
  key: string
}

interface Rule {
  app: string
  /** Matches the owning process / app name */
  owner?: RegExp
  /** Matches the window title */
  title: RegExp
}

const RULES: Rule[] = [
  { app: 'Zoom', owner: /zoom/i, title: /zoom meeting|zoom webinar|^meeting$/i },
  {
    app: 'Google Meet',
    title: /^meet\s*[-–—]\s*[a-z]{3}-[a-z]{4}-[a-z]{3}|google meet|meet\.google\.com/i
  },
  { app: 'Microsoft Teams', owner: /teams/i, title: /meeting|call|\| microsoft teams.*\(.*\)/i },
  { app: 'Slack huddle', owner: /slack/i, title: /huddle/i },
  { app: 'Webex', owner: /webex/i, title: /meeting|webex/i },
  { app: 'FaceTime', owner: /facetime/i, title: /.+/ },
  { app: 'Discord', owner: /discord/i, title: /voice connected|stage/i },
  { app: 'Whereby', title: /whereby/i },
  { app: 'Around', owner: /around/i, title: /.+/ }
]

export function matchMeeting(appName: string, title: string): DetectedMeeting | null {
  for (const rule of RULES) {
    if (rule.owner && !rule.owner.test(appName)) continue
    if (!rule.title.test(title || appName)) continue
    return { app: rule.app, key: `${rule.app}:${(title || '').slice(0, 80)}` }
  }
  return null
}

const POLL_MS = 5000
/** Don't offer the same call again for this long after it was offered */
const SNOOZE_MS = 30 * 60_000

let timer: ReturnType<typeof setInterval> | null = null
const offered = new Map<string, number>()

/**
 * Start polling. `onDetected` fires once per call (snoozed afterwards);
 * `isBusy` suppresses offers while a meeting is already being recorded.
 */
export function startMeetingDetector(
  onDetected: (meeting: DetectedMeeting) => void,
  isBusy: () => boolean
): void {
  stopMeetingDetector()
  timer = setInterval(async () => {
    if (isBusy()) return
    const active = await getActiveApp()
    if (!active) return
    const meeting = matchMeeting(active.name, active.title ?? '')
    if (!meeting) return
    const now = Date.now()
    const last = offered.get(meeting.key) ?? offered.get(meeting.app)
    if (last && now - last < SNOOZE_MS) return
    offered.set(meeting.key, now)
    // Also snooze the app as a whole so title changes don't re-prompt
    offered.set(meeting.app, now)
    onDetected(meeting)
  }, POLL_MS)
}

export function stopMeetingDetector(): void {
  if (timer) clearInterval(timer)
  timer = null
}
