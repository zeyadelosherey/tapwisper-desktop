/** whisper.cpp's whisper-server: launch arguments and the transcription request */
import { LocalAiError } from './errors'
import { assertOk, transcriptionForm, transcriptionTimeout } from './http'
import { loadTimeoutMs, type RuntimeOptions, type SidecarLaunch } from './sidecar'
import type { TranscribeInput } from '../../shared/local-ai/types'

export function whisperLaunch(o: RuntimeOptions): SidecarLaunch {
  return {
    binary: o.binary,
    modelId: o.modelId,
    loadTimeoutMs: loadTimeoutMs(o.modelBytes),
    idleUnloadMs: o.idleUnloadMs,
    args: (port) => [
      '-m',
      o.modelFile,
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '-t',
      String(o.threads),
      ...(o.useGpu ? [] : ['-ng'])
    ]
  }
}

export async function whisperTranscribe(baseUrl: string, input: TranscribeInput): Promise<string> {
  // whisper-server assumes English unless told to detect the language
  const form = transcriptionForm(input, { language: input.language || 'auto' })
  const res = await fetch(`${baseUrl}/inference`, {
    method: 'POST',
    body: form,
    signal: transcriptionTimeout(input.seconds, 30_000)
  })
  await assertOk(res)
  const data = (await res.json()) as { text?: string; error?: string }
  if (data.error) throw new LocalAiError('bad-response', data.error)
  // Segments come back on separate lines
  return (data.text ?? '').replace(/\s*\n\s*/g, ' ').trim()
}
