/**
 * End-to-end check of the bundled runtimes with the app's own launch and
 * request code. Needs built runtimes (npm run build:runtimes) and models:
 *
 *   LOCAL_AI_SMOKE_WHISPER_MODEL=…/ggml-tiny.bin
 *   LOCAL_AI_SMOKE_LLM_MODEL=…/Qwen3-0.6B-Q4_K_M.gguf
 *   LOCAL_AI_SMOKE_EXPECT_TEXT=1   (real weights: check the transcript wording)
 *   LOCAL_AI_SMOKE_GPU=1           (use Metal/Vulkan; CI runners usually have no GPU)
 *
 * Skipped otherwise. Models are copied to a non-ASCII folder first, which is
 * where Windows builds have broken before.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { SidecarServer, type RuntimeOptions } from '../sidecar'
import { whisperLaunch, whisperTranscribe } from '../whisper'
import { llamaChat, llamaLaunch } from '../llama'
import { getModel } from '../../../shared/local-ai/catalog'

const whisperModel = process.env.LOCAL_AI_SMOKE_WHISPER_MODEL
const llmModel = process.env.LOCAL_AI_SMOKE_LLM_MODEL
const expectText = process.env.LOCAL_AI_SMOKE_EXPECT_TEXT === '1'
const useGpu = process.env.LOCAL_AI_SMOKE_GPU === '1'

const ROOT = path.resolve(__dirname, '../../../..')
const exe = process.platform === 'win32' ? '.exe' : ''
const SAMPLE = path.join(ROOT, '.cache/runtimes/whisper-src/samples/jfk.wav')

let dir: string
const servers: SidecarServer[] = []

function options(kind: 'whisper' | 'llama', model: string, modelId: string): RuntimeOptions {
  const file = path.join(dir, path.basename(model))
  copyFileSync(model, file)
  return {
    binary: path.join(ROOT, 'resources/bin', kind, `${kind}-server${exe}`),
    modelFile: file,
    modelId,
    modelBytes: readFileSync(file).length,
    useGpu,
    threads: 4,
    idleUnloadMs: 0
  }
}

describe.skipIf(!whisperModel || !llmModel)('bundled runtimes', () => {
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'نماذج-models-'))
  })

  afterAll(async () => {
    await Promise.all(servers.map((s) => s.stop()))
    rmSync(dir, { recursive: true, force: true })
  })

  it('transcribes speech with whisper-server', async () => {
    const server = new SidecarServer('stt', () => {})
    servers.push(server)
    const launch = whisperLaunch(options('whisper', whisperModel!, 'whisper-tiny'))
    const wav = new Uint8Array(readFileSync(SAMPLE))
    const text = await server.run(launch, (url) => whisperTranscribe(url, { wav, seconds: 11 }))
    expect(typeof text).toBe('string')
    if (expectText) expect(text.toLowerCase()).toContain('country')
  }, 180_000)

  it('answers a chat request with llama-server', async () => {
    const server = new SidecarServer('llm', () => {})
    servers.push(server)
    const launch = llamaLaunch(options('llama', llmModel!, 'qwen3-0.6b'))
    const reply = await server.run(launch, (url) =>
      llamaChat(
        url,
        { prompt: 'Fix the spelling. Only return the text.', text: 'helo wrld', maxTokens: 32 },
        getModel('qwen3-0.6b')!
      )
    )
    expect(reply.length).toBeGreaterThan(0)
    expect(reply).not.toContain('<think>')
  }, 180_000)

  it('stops the servers', async () => {
    for (const server of servers) await server.stop()
    expect(servers.every((s) => s.getStatus().state === 'stopped')).toBe(true)
  })
})
