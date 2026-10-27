import { describe, it, expect, vi } from 'vitest'

// CI installs without Electron's binary, so keep the real package out of the test
vi.mock('electron', () => ({ powerMonitor: { getSystemIdleTime: () => 0 } }))
vi.mock('../app-context', () => ({ getActiveApp: async () => null }))

const { matchMeeting } = await import('../meeting-detector')

describe('matchMeeting', () => {
  it('recognises common call apps', () => {
    expect(matchMeeting('zoom.us', 'Zoom Meeting')?.app).toBe('Zoom')
    expect(matchMeeting('Google Chrome', 'Meet - abc-defg-hij')?.app).toBe('Google Meet')
    expect(matchMeeting('Brave Browser', 'Weekly sync - Google Meet')?.app).toBe('Google Meet')
    expect(matchMeeting('Slack', 'Huddle in #design')?.app).toBe('Slack huddle')
    expect(matchMeeting('FaceTime', 'Sara')?.app).toBe('FaceTime')
  })

  it('ignores the same apps when no call is open', () => {
    expect(matchMeeting('zoom.us', 'Zoom Workplace')).toBeNull()
    expect(matchMeeting('Slack', '#general - Acme')).toBeNull()
    expect(matchMeeting('Google Chrome', 'Inbox - Gmail')).toBeNull()
    expect(matchMeeting('Finder', 'Downloads')).toBeNull()
  })
})
