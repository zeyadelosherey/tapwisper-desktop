/**
 * Notetaker types, derived from the preload API so they never drift from
 * what the main process actually returns.
 */
type MeetingsAPI = Window['tapwisper']['meetings']

export type Meeting = NonNullable<Awaited<ReturnType<MeetingsAPI['get']>>>
export type MeetingSegment = Awaited<ReturnType<MeetingsAPI['segments']>>[number]
/** 'you' = the user's microphone, 'others' = the meeting's audio */
export type SegmentSource = MeetingSegment['source']
export type MeetingStatus = Meeting['status']
export type MeetingUpdate = Parameters<MeetingsAPI['update']>[1]
export type MeetingRecorderState = Awaited<ReturnType<MeetingsAPI['getState']>>
