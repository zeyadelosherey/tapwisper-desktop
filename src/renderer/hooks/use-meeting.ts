import { useEffect, useState } from 'react'
import type { Meeting, MeetingSegment } from '../models/meeting'
import { isDeletedMeeting, isMeeting, isSegment, mergeSegment } from '../utils/meeting'

export interface MeetingData {
  meeting: Meeting | null
  segments: MeetingSegment[]
  /** First load in progress */
  loading: boolean
  /** The meeting was deleted (here or in another window) */
  deleted: boolean
}

const EMPTY: MeetingData = { meeting: null, segments: [], loading: false, deleted: false }

/**
 * One stored meeting plus its transcript, kept live through the
 * `meetings:changed` and `meetings:segment` broadcasts.
 */
export function useMeeting(id: string | null): MeetingData {
  const [data, setData] = useState<MeetingData>(EMPTY)

  useEffect(() => {
    if (!id) {
      setData(EMPTY)
      return
    }
    let cancelled = false
    setData({ ...EMPTY, loading: true })
    Promise.all([window.tapwisper.meetings.get(id), window.tapwisper.meetings.segments(id)])
      .then(([meeting, segments]) => {
        if (cancelled) return
        setData((prev) => ({
          meeting: prev.meeting ?? meeting,
          // Segments that arrived while loading are kept
          segments: prev.segments.reduce(mergeSegment, [...segments].sort(byStart)),
          loading: false,
          deleted: !meeting
        }))
      })
      .catch(() => {
        if (!cancelled) setData((prev) => ({ ...prev, loading: false }))
      })

    const offChanged = window.tapwisper.on('meetings:changed', (payload: unknown) => {
      if (isDeletedMeeting(payload)) {
        if (payload.id === id) setData((prev) => ({ ...prev, meeting: null, deleted: true }))
      } else if (isMeeting(payload) && payload.id === id) {
        setData((prev) => ({ ...prev, meeting: payload }))
      }
    })
    const offSegment = window.tapwisper.on('meetings:segment', (payload: unknown) => {
      if (isSegment(payload) && payload.meetingId === id) {
        setData((prev) => ({ ...prev, segments: mergeSegment(prev.segments, payload) }))
      }
    })
    // Translations of existing lines (live translation, "Translate transcript")
    const offTranslated = window.tapwisper.on('meetings:segment-translated', (payload: unknown) => {
      if (isSegment(payload) && payload.meetingId === id) {
        setData((prev) => ({ ...prev, segments: mergeSegment(prev.segments, payload) }))
      }
    })
    return () => {
      cancelled = true
      offChanged()
      offSegment()
      offTranslated()
    }
  }, [id])

  return data
}

function byStart(a: MeetingSegment, b: MeetingSegment): number {
  return a.startMs - b.startMs
}
