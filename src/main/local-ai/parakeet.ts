/**
 * NVIDIA Parakeet through whisper.cpp's parakeet-cli. There is no server for
 * it, so each transcription runs the program once; the model is memory-mapped,
 * so after the first run it loads from the OS cache in well under a second.
 */
import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { LocalAiError } from './errors'
import { transcriptionTimeout } from './http'
import { SerialQueue } from './serial-queue'
import type { TranscribeInput } from '../../shared/local-ai/types'

export interface ParakeetOptions {
  binary: string
  modelFile: string
  useGpu: boolean
  threads: number
}

/** One run at a time: two would each load the whole model */
const queue = new SerialQueue()

export function parakeetTranscribe(
  options: ParakeetOptions,
  input: TranscribeInput
): Promise<string> {
  return queue.add(() => transcribeOnce(options, input))
}

/** A transcription is waiting or running, so the model file is (about to be) open */
export function parakeetBusy(): boolean {
  return queue.size > 0
}

async function transcribeOnce(o: ParakeetOptions, input: TranscribeInput): Promise<string> {
  const wav = path.join(tmpdir(), `tapwisper-${randomUUID()}.wav`)
  await writeFile(wav, input.wav)
  try {
    const args = ['-m', o.modelFile, '-f', wav, '-t', String(o.threads), '-np']
    if (!o.useGpu) args.push('-ng')
    return await new Promise<string>((resolve, reject) => {
      execFile(
        o.binary,
        args,
        {
          cwd: path.dirname(o.binary),
          windowsHide: true,
          // Model load plus CPU decoding of long clips
          signal: transcriptionTimeout(input.seconds, 60_000),
          maxBuffer: 16 * 1024 * 1024
        },
        (err, stdout, stderr) => {
          if (!err) return resolve(stdout.replace(/\s+/g, ' ').trim())
          const e = err as NodeJS.ErrnoException
          if (e.code === 'ENOENT') return reject(new LocalAiError('runtime-unavailable', e.message))
          if (e.code === 'ABORT_ERR')
            return reject(new LocalAiError('timeout', 'parakeet-cli timed out'))
          reject(new LocalAiError('server-failed', String(stderr).slice(-2000) || e.message))
        }
      )
    })
  } finally {
    await rm(wav, { force: true })
  }
}
