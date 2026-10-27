/**
 * End-to-end check of the bundled runtimes with the app's own download, launch
 * and request code. Needs built runtimes (npm run build:runtimes) and either:
 *
 *   LOCAL_AI_SMOKE_DOWNLOAD=1   download small real models from Hugging Face (CI), or
 *   model files of your own — each check runs only when its model is given:
 *     LOCAL_AI_SMOKE_WHISPER_MODEL=…/ggml-tiny.bin
 *     LOCAL_AI_SMOKE_PARAKEET_MODEL=…/ggml-parakeet-tdt-0.6b-v3-f16.bin
 *     LOCAL_AI_SMOKE_ASR_MODEL=…/Qwen3-ASR-0.6B-Q8_0.gguf + LOCAL_AI_SMOKE_ASR_MMPROJ=…/mmproj….gguf
 *     LOCAL_AI_SMOKE_LLM_MODEL=…/Qwen3.5-0.8B-Q4_K_M.gguf
 *
 *   LOCAL_AI_SMOKE_EXPECT_TEXT=1   real weights: check the transcript wording
 *   LOCAL_AI_SMOKE_GPU=1           use Metal/Vulkan (CI runners usually have no GPU)
 *
 * Everything lives in a folder with a non-ASCII name, which is where Windows
 * builds have broken before.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

const dir = mkdtempSync(path.join(tmpdir(), 'نماذج-models-'))

vi.mock('electron', () => ({
  app: { getPath: () => dir },
  net: { fetch: (...args: Parameters<typeof fetch>) => fetch(...args) }
}))
vi.mock('../../store', () => ({ getConfigValue: () => undefined }))

const { SidecarServer } = await import('../sidecar')
const { whisperLaunch, whisperTranscribe } = await import('../whisper')
const { llamaChat, llamaLaunch, llamaTranscribe } = await import('../llama')
const { parakeetTranscribe } = await import('../parakeet')
const { downloadModel, modelFiles } = await import('../model-store')
const { getModel } = await import('../../../shared/local-ai/catalog')
type RuntimeOptions = import('../sidecar').RuntimeOptions
type SidecarServerType = InstanceType<typeof SidecarServer>

const env = process.env
const expectText = env.LOCAL_AI_SMOKE_EXPECT_TEXT === '1'
const useGpu = env.LOCAL_AI_SMOKE_GPU === '1'
const download = env.LOCAL_AI_SMOKE_DOWNLOAD === '1'

const ROOT = path.resolve(__dirname, '../../../..')
const SAMPLE = path.join(ROOT, '.cache/runtimes/whisper-src/samples/jfk.wav')

/** Catalog models the download mode fetches, and the files they give each check */
const DOWNLOADS = {
  whisper: 'whisper-tiny',
  parakeet: 'parakeet-tdt-0.6b-v3',
  asr: 'qwen3-asr-0.6b',
  llm: 'qwen3.5-0.8b'
} as const

const models: Partial<Record<keyof typeof DOWNLOADS, { model: string; mmproj?: string }>> = {}
if (!download) {
  if (env.LOCAL_AI_SMOKE_WHISPER_MODEL) models.whisper = { model: env.LOCAL_AI_SMOKE_WHISPER_MODEL }
  if (env.LOCAL_AI_SMOKE_PARAKEET_MODEL) {
    models.parakeet = { model: env.LOCAL_AI_SMOKE_PARAKEET_MODEL }
  }
  if (env.LOCAL_AI_SMOKE_ASR_MODEL && env.LOCAL_AI_SMOKE_ASR_MMPROJ) {
    models.asr = { model: env.LOCAL_AI_SMOKE_ASR_MODEL, mmproj: env.LOCAL_AI_SMOKE_ASR_MMPROJ }
  }
  if (env.LOCAL_AI_SMOKE_LLM_MODEL) models.llm = { model: env.LOCAL_AI_SMOKE_LLM_MODEL }
}

const servers: SidecarServerType[] = []

function binary(folder: string, name: string): string {
  const exe = process.platform === 'win32' ? `${name}.exe` : name
  return path.join(ROOT, 'resources/bin', folder, exe)
}

/** Copy a user-given model into the non-ASCII folder (downloads are there already) */
function stage(file: string): string {
  if (file.startsWith(dir)) return file
  const target = path.join(dir, path.basename(file))
  copyFileSync(file, target)
  return target
}

function options(bin: string, files: { model: string; mmproj?: string }): RuntimeOptions {
  const modelFile = stage(files.model)
  return {
    binary: bin,
    modelFile,
    mmprojFile: files.mmproj ? stage(files.mmproj) : null,
    modelId: path.basename(modelFile),
    modelBytes: readFileSync(modelFile).length,
    useGpu,
    threads: 4,
    idleUnloadMs: 0
  }
}

function speech(): { wav: Uint8Array; seconds: number } {
  return { wav: new Uint8Array(readFileSync(SAMPLE)), seconds: 11 }
}

function server(kind: 'stt' | 'llm'): SidecarServerType {
  const s = new SidecarServer(kind, () => {})
  servers.push(s)
  return s
}

function checkTranscript(text: string): void {
  expect(typeof text).toBe('string')
  if (expectText) expect(text.toLowerCase()).toContain('country')
}

describe('bundled runtimes', () => {
  beforeAll(async () => {
    if (!download) return
    for (const [check, id] of Object.entries(DOWNLOADS)) {
      const result = await downloadModel(id, () => {})
      if (!result.ok) throw new Error(`${id}: ${result.code} ${result.detail ?? ''}`)
      const files = modelFiles(getModel(id)!)
      models[check as keyof typeof DOWNLOADS] = {
        model: files.model!,
        mmproj: files.mmproj ?? undefined
      }
    }
  }, 1_800_000)

  afterAll(async () => {
    await Promise.all(servers.map((s) => s.stop()))
    rmSync(dir, { recursive: true, force: true })
  })

  it.skipIf(!download && !models.whisper)(
    'transcribes speech with whisper-server',
    async () => {
      const o = options(binary('whisper', 'whisper-server'), models.whisper!)
      const text = await server('stt').run(whisperLaunch(o), (url) =>
        whisperTranscribe(url, speech())
      )
      checkTranscript(text)
    },
    300_000
  )

  it.skipIf(!download && !models.parakeet)(
    'transcribes speech with parakeet-cli',
    async () => {
      const o = options(binary('whisper', 'parakeet-cli'), models.parakeet!)
      checkTranscript(await parakeetTranscribe(o, speech()))
    },
    300_000
  )

  it.skipIf(!download && !models.asr)(
    'transcribes speech with an audio model on llama-server',
    async () => {
      const o = options(binary('llama', 'llama-server'), models.asr!)
      const text = await server('stt').run(llamaLaunch(o), (url) => llamaTranscribe(url, speech()))
      checkTranscript(text)
    },
    300_000
  )

  it.skipIf(!download && !models.llm)(
    'answers a chat request with llama-server',
    async () => {
      const o = options(binary('llama', 'llama-server'), models.llm!)
      const reply = await server('llm').run(llamaLaunch(o), (url) =>
        llamaChat(
          url,
          { prompt: 'Fix the spelling. Only return the text.', text: 'helo wrld', maxTokens: 32 },
          getModel(DOWNLOADS.llm)!
        )
      )
      expect(reply.length).toBeGreaterThan(0)
      expect(reply).not.toContain('<think>')
    },
    300_000
  )

  it('stops the servers', async () => {
    for (const s of servers) await s.stop()
    expect(servers.every((s) => s.getStatus().state === 'stopped')).toBe(true)
  })
})
