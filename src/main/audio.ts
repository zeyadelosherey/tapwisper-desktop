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
export function encodeWav(
  samples: Float32Array,
  sampleRate: number = 16000
): Buffer {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
  const blockAlign = (numChannels * bitsPerSample) / 8
  const dataSize = samples.length * (bitsPerSample / 8)
  const headerSize = 44
  const buffer = Buffer.alloc(headerSize + dataSize)

  // RIFF header
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)

  // fmt chunk
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16) // chunk size
  buffer.writeUInt16LE(1, 20) // PCM format
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)

  // data chunk
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  // Convert float32 to int16
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    const val = s < 0 ? s * 0x8000 : s * 0x7fff
    buffer.writeInt16LE(Math.round(val), headerSize + i * 2)
  }

  return buffer
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
    await Promise.all(
      files.map((file) => fsp.unlink(path.join(TEMP_DIR, file)).catch(() => {}))
    )
  } catch {
    // Ignore cleanup errors (directory may not exist)
  }
}
