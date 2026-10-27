/**
 * Audio recording utilities for the main process.
 * Actual audio capture happens in the renderer via Web Audio API.
 * This module handles WAV encoding and file management.
 *
 * All file I/O uses async fs.promises to avoid blocking the main process event loop.
 */

import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { app } from 'electron'
import { encodeWav as encodeWavBytes } from '../shared/audio/wav'

const TEMP_DIR = path.join(app.getPath('temp'), 'tapwisper-audio')

/**
 * Ensure the temp audio directory exists (async)
 */
export async function ensureAudioDir(): Promise<string> {
  try {
    await fsp.mkdir(TEMP_DIR, { recursive: true })
  } catch {
    // Directory may already exist
  }
  return TEMP_DIR
}

/**
 * Ensure the temp audio directory exists (sync — used only at startup)
 */
export function ensureAudioDirSync(): string {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true })
  }
  return TEMP_DIR
}

/**
 * Encode raw PCM float32 samples to WAV format (16kHz, mono, 16-bit)
 */
export function encodeWav(samples: Float32Array, sampleRate: number = 16000): Buffer {
  const bytes = encodeWavBytes(samples, sampleRate)
  // Wraps the encoded bytes instead of copying them
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

/**
 * Save audio buffer to a temporary WAV file (async — doesn't block main process)
 */
export async function saveTempAudio(wavBuffer: Buffer): Promise<string> {
  await ensureAudioDir()
  const filename = `recording-${Date.now()}.wav`
  const filepath = path.join(TEMP_DIR, filename)
  await fsp.writeFile(filepath, wavBuffer)
  return filepath
}

/**
 * Clean up a temporary audio file (async)
 */
export async function cleanupAudioFile(filepath: string): Promise<void> {
  try {
    await fsp.unlink(filepath)
  } catch {
    // Ignore cleanup errors (file may not exist)
  }
}

/**
 * Clean up all temporary audio files (async).
 * Called on app startup to remove leftovers from previous sessions,
 * and on app quit for clean shutdown.
 */
export async function cleanupAllAudio(): Promise<void> {
  try {
    const files = await fsp.readdir(TEMP_DIR)
    await Promise.all(files.map((file) => fsp.unlink(path.join(TEMP_DIR, file)).catch(() => {})))
  } catch {
    // Ignore cleanup errors (directory may not exist)
  }
}
