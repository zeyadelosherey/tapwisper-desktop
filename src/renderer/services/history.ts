/**
 * Replay and re-transcribe past dictations from their saved audio.
 */
import { transcribeAudio } from './ai-router'
import { postProcessTranscript } from './dictation-pipeline'

export async function hasRecording(recordId: string): Promise<boolean> {
  return window.tapwisper.recordings.has(recordId).catch(() => false)
}

/** Batch check: which records still have saved audio */
export async function hasRecordings(recordIds: string[]): Promise<Record<string, boolean>> {
  if (recordIds.length === 0) return {}
  return window.tapwisper.recordings.hasMany(recordIds).catch(() => ({}))
}

/**
 * Object URL for the record's audio, or null if it wasn't kept.
 * Call URL.revokeObjectURL() when done playing.
 */
export async function getRecordingUrl(recordId: string): Promise<string | null> {
  const rec = await window.tapwisper.recordings.load(recordId)
  if (!rec) return null
  return URL.createObjectURL(new Blob([rec.data], { type: rec.mimeType }))
}

export interface RetranscribeResult {
  transcription: string
  rawTranscription: string
}

/**
 * Transcribe the saved audio again with the current settings (language,
 * dictionary, provider, Smart Formatting) and update the history entry.
 * Throws if the audio is gone or transcription fails.
 */
export async function retranscribeRecord(
  recordId: string,
  appName?: string | null
): Promise<RetranscribeResult> {
  const rec = await window.tapwisper.recordings.load(recordId)
  if (!rec) throw new Error('recording-missing')

  const blob = new Blob([rec.data], { type: rec.mimeType })
  const result = await transcribeAudio(blob)
  const rawTranscription = result.text.trim()
  const transcription = await postProcessTranscript(rawTranscription, {
    appName: appName ?? undefined
  })

  await window.tapwisper.db.activity.update(recordId, {
    transcription,
    rawTranscription: rawTranscription !== transcription ? rawTranscription : null,
    wordCount: transcription.split(/\s+/).filter(Boolean).length
  })
  return { transcription, rawTranscription }
}
