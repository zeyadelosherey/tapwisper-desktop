/**
 * Persisted dictation audio, keyed by activity record id, so history entries
 * can be replayed and re-transcribed (e.g. after fixing the language or
 * dictionary). Only the most recent MAX_RECORDINGS are kept.
 */

import fsp from 'fs/promises'
import path from 'path'
import { app } from 'electron'

const MAX_RECORDINGS = 50
const SAFE_ID = /^[\w-]{1,128}$/

const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav'
}

function recordingsDir(): string {
  return path.join(app.getPath('userData'), 'recordings')
}

function baseMime(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase()
}

async function findFile(id: string): Promise<string | null> {
  if (!SAFE_ID.test(id)) return null
  try {
    const files = await fsp.readdir(recordingsDir())
    const match = files.find((f) => f.startsWith(`${id}.`))
    return match ? path.join(recordingsDir(), match) : null
  } catch {
    return null
  }
}

export async function saveRecording(id: string, data: ArrayBuffer, mimeType: string): Promise<void> {
  if (!SAFE_ID.test(id)) throw new Error('Invalid recording id')
  const ext = EXTENSIONS[baseMime(mimeType)] ?? 'webm'
  await fsp.mkdir(recordingsDir(), { recursive: true })
  await fsp.writeFile(path.join(recordingsDir(), `${id}.${ext}`), Buffer.from(data))
  await pruneRecordings(MAX_RECORDINGS)
}

export async function loadRecording(
  id: string
): Promise<{ data: ArrayBuffer; mimeType: string } | null> {
  const file = await findFile(id)
  if (!file) return null
  const buf = await fsp.readFile(file)
  const ext = path.extname(file).slice(1)
  const mimeType = Object.entries(EXTENSIONS).find(([, e]) => e === ext)?.[0] ?? 'audio/webm'
  return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), mimeType }
}

export async function hasRecording(id: string): Promise<boolean> {
  return (await findFile(id)) !== null
}

/** Which of `ids` still have saved audio — one directory read for a whole page */
export async function hasRecordings(ids: string[]): Promise<Record<string, boolean>> {
  let files: string[] = []
  try {
    files = await fsp.readdir(recordingsDir())
  } catch {
    // No recordings directory yet
  }
  const present = new Set(files.map((f) => f.slice(0, f.lastIndexOf('.'))))
  return Object.fromEntries(ids.map((id) => [id, SAFE_ID.test(id) && present.has(id)]))
}

export async function deleteRecording(id: string): Promise<void> {
  const file = await findFile(id)
  if (file) await fsp.unlink(file).catch(() => {})
}

export async function clearRecordings(): Promise<void> {
  await fsp.rm(recordingsDir(), { recursive: true, force: true }).catch(() => {})
}

/** Keep only the newest `keep` recordings */
export async function pruneRecordings(keep: number): Promise<void> {
  try {
    const dir = recordingsDir()
    const files = await fsp.readdir(dir)
    if (files.length <= keep) return
    const withTimes = await Promise.all(
      files.map(async (f) => ({ f, t: (await fsp.stat(path.join(dir, f))).mtimeMs }))
    )
    withTimes.sort((a, b) => b.t - a.t)
    await Promise.all(withTimes.slice(keep).map(({ f }) => fsp.unlink(path.join(dir, f)).catch(() => {})))
  } catch {
    // Directory missing — nothing to prune
  }
}
