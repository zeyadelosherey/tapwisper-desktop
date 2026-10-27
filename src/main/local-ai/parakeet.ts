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
import type { TranscribeInput } from '../../shared/local-ai/types'

export interface ParakeetOptions {
  binary: string
  modelFile: string
  useGpu: boolean
  threads: number
}

/** One run at a time: two would each load the whole model */
let queue: Promise<unknown> = Promise.resolve()

export function parakeetTranscribe(
  options: ParakeetOptions,
  input: TranscribeInput
): Promise<string> {
  const run = queue.then(() => transcribeOnce(options, input))
  queue = run.catch(() => undefined)
  return run
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
          timeout: Math.max(60_000, input.seconds * 3000),
          maxBuffer: 16 * 1024 * 1024
        },
        (err, stdout, stderr) => {
          if (!err) return resolve(stdout.replace(/\s+/g, ' ').trim())
          const e = err as NodeJS.ErrnoException & { killed?: boolean }
          if (e.code === 'ENOENT') return reject(new LocalAiError('runtime-unavailable', e.message))
          if (e.killed) return reject(new LocalAiError('timeout', 'parakeet-cli timed out'))
          reject(new LocalAiError('server-failed', String(stderr).slice(-2000) || e.message))
        }
      )
    })
  } finally {
    await rm(wav, { force: true })
  }
}
