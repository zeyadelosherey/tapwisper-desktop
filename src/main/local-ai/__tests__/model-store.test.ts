import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import type { DownloadProgress } from '../../../shared/local-ai/types'

const MODEL = Buffer.from('fake model weights '.repeat(1000))
const PROJECTOR = Buffer.from('fake projector '.repeat(300))
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex')

let dir: string
let modelSha256: string
let requests: Array<{ url: string; range?: string }>

// Hugging Face stand-in: the model API, plus file downloads that honour Range
vi.mock('electron', () => ({
  app: { getPath: () => dir },
  net: {
    fetch: async (url: string, init: { headers?: Record<string, string> } = {}) => {
      const range = init.headers?.Range
      requests.push({ url, range })
      if (url.includes('/api/models/')) {
        if (url.includes('Qwen3.5')) return new Response('', { status: 404 })
        const file = (name: string, body: Buffer, hash = sha(body)) => ({
          rfilename: name,
          size: body.length,
          lfs: { sha256: hash, size: body.length }
        })
        return Response.json({
          sha: 'abc123',
          siblings: [
            { rfilename: 'README.md', size: 10 },
            file('ggml-tiny.bin', MODEL, modelSha256),
            file('model-Q8_0.gguf', MODEL),
            file('mmproj-model-f16.gguf', PROJECTOR)
          ]
        })
      }
      const body = url.includes('mmproj') ? PROJECTOR : MODEL
      const start = Number(range?.match(/bytes=(\d+)-/)?.[1] ?? 0)
      return new Response(body.subarray(start), { status: start ? 206 : 200 })
    }
  }
}))
vi.mock('../../store', () => ({ getConfigValue: () => undefined }))

const store = await import('../model-store')
const { getModel } = await import('../../../shared/local-ai/catalog')

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'models-test-'))
  modelSha256 = sha(MODEL)
  requests = []
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

const tinyPath = (): string => path.join(dir, 'models', 'stt', 'whisper-tiny.bin')

describe('downloadModel', () => {
  it('downloads from the pinned commit, verifies the hash and installs the file', async () => {
    const progress: DownloadProgress[] = []
    const result = await store.downloadModel('whisper-tiny', (p) => progress.push(p))
    expect(result).toEqual({ ok: true, data: undefined })
    expect(readFileSync(tinyPath())).toEqual(MODEL)
    expect(requests[1].url).toBe(
      'https://huggingface.co/ggerganov/whisper.cpp/resolve/abc123/ggml-tiny.bin'
    )
    expect(progress.at(-1)).toMatchObject({ state: 'done', received: MODEL.length })
    expect(await store.listInstalled()).toEqual(['whisper-tiny'])
  })

  it('resumes a partial download with a Range request', async () => {
    mkdirSync(path.dirname(tinyPath()), { recursive: true })
    writeFileSync(`${tinyPath()}.part`, MODEL.subarray(0, 5000))
    const result = await store.downloadModel('whisper-tiny', () => {})
    expect(result.ok).toBe(true)
    expect(requests[1].range).toBe('bytes=5000-')
    expect(readFileSync(tinyPath())).toEqual(MODEL)
  })

  it('rejects a file whose hash does not match and removes it', async () => {
    modelSha256 = 'a'.repeat(64)
    const result = await store.downloadModel('whisper-tiny', () => {})
    expect(result).toMatchObject({ ok: false, code: 'checksum-mismatch' })
    expect(existsSync(tinyPath())).toBe(false)
    expect(existsSync(`${tinyPath()}.part`)).toBe(false)
  })

  it('fetches the projector of audio models and needs both files to count as installed', async () => {
    const model = getModel('qwen3-asr-0.6b')!
    expect((await store.downloadModel(model.id, () => {})).ok).toBe(true)
    const files = store.modelFiles(model)
    expect(readFileSync(files.model!)).toEqual(MODEL)
    expect(readFileSync(files.mmproj!)).toEqual(PROJECTOR)
    expect(await store.isInstalled(model)).toBe(true)
    rmSync(files.mmproj!)
    expect(await store.isInstalled(model)).toBe(false)
  })

  it('reports a model that is no longer available upstream', async () => {
    const result = await store.downloadModel('qwen3.5-4b', () => {})
    expect(result).toMatchObject({ ok: false, code: 'model-unavailable' })
  })

  it('deletes installed models', async () => {
    await store.downloadModel('whisper-tiny', () => {})
    await store.deleteModel('whisper-tiny')
    expect(existsSync(tinyPath())).toBe(false)
  })
})
