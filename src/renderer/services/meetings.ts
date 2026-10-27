/**
 * Meeting operations shared by the notepad and the Meetings page.
 */
import type { Meeting } from '../models/meeting'
import { generateMeetingSummary } from './meeting-ai'

/** Below this much transcript, a summary isn't generated automatically */
export const MIN_WORDS_FOR_AUTO_SUMMARY = 120

/**
 * (Re)generate a meeting's title + summary and save them. Keeps a title the
 * user typed themselves. Throws 'empty-meeting' when there is nothing to
 * summarize, or the provider's error.
 */
export async function summarizeMeeting(meetingId: string): Promise<Meeting | null> {
  const [meeting, segments] = await Promise.all([
    window.tapwisper.meetings.get(meetingId),
    window.tapwisper.meetings.segments(meetingId)
  ])
  if (!meeting) return null
  const previousStatus = meeting.status
  await window.tapwisper.meetings.update(meetingId, { status: 'processing' })
  try {
    const { title, summary } = await generateMeetingSummary({
      segments,
      notes: meeting.notes,
      speakerNames: meeting.speakerNames,
      appName: meeting.appName,
      startedAt: meeting.startedAt
    })
    return await window.tapwisper.meetings.update(meetingId, {
      summary,
      title: meeting.title.trim() ? meeting.title : title,
      status: 'done'
    })
  } catch (err) {
    await window.tapwisper.meetings.update(meetingId, {
      status:
        previousStatus === 'recording' || previousStatus === 'processing' ? 'done' : previousStatus
    })
    throw err
  }
}
