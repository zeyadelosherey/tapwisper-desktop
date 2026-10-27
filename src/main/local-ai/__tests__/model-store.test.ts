import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import type { DownloadProgress } from '../../../shared/local-ai/types'

const FILE = Buffer.from('fake model weights '.repeat(1000))
const SHA = createHash('sha256').update(FILE).digest('hex')

let dir: string
let linkedEtag: string | undefined
let linkedSize: number
let requests: Array<Record<string, string>>

// Hugging Face stand-in: honours Range requests and sends the LFS hash on HEAD
vi.mock('electron', () => ({
  app: { getPath: () => dir },
  net: {
    fetch: async (_url: string, init: { headers?: Record<string, string> }) => {
      const headers = init.headers ?? {}
      requests.push(headers)
      const start = Number(headers.Range?.match(/bytes=(\d+)-/)?.[1] ?? 0)
      const body = FILE.subarray(start)
      return new Response(body, {
        status: start ? 206 : 200,
        headers: { 'content-length': String(body.length) }
      })
    },
    request: () => {
      const handlers: Record<string, (...args: unknown[]) => void> = {}
      return {
        on: (event: string, fn: (...args: unknown[]) => void) => (handlers[event] = fn),
        end: () =>
          setTimeout(() =>
            handlers.redirect?.(302, 'HEAD', 'https://cdn', {
              'x-linked-etag': [`"${linkedEtag}"`],
              'x-linked-size': [String(linkedSize)]
            })
          ),
        abort: () => {}
      }
    }
  }
}))
vi.mock('../../store', () => ({ getConfigValue: () => undefined }))

const store = await import('../model-store')

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'models-test-'))
  linkedEtag = SHA
  linkedSize = FILE.length
  requests = []
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

const target = (): string => path.join(dir, 'models', 'stt', 'ggml-tiny.bin')

describe('downloadModel', () => {
  it('downloads, verifies the Hugging Face hash and installs the file', async () => {
    const progress: DownloadProgress[] = []
    const result = await store.downloadModel('whisper-tiny', (p) => progress.push(p))
    expect(result).toEqual({ ok: true, data: undefined })
    expect(readFileSync(target())).toEqual(FILE)
    expect(progress.map((p) => p.state).slice(-2)).toEqual(['verifying', 'done'])
    expect(progress.at(-1)).toMatchObject({ received: FILE.length, total: FILE.length })
    expect(await store.listInstalled()).toEqual(['whisper-tiny'])
  })

  it('resumes a partial download with a Range request', async () => {
    mkdirSync(path.dirname(target()), { recursive: true })
    writeFileSync(`${target()}.part`, FILE.subarray(0, 5000))
    const result = await store.downloadModel('whisper-tiny', () => {})
    expect(result.ok).toBe(true)
    expect(requests[0].Range).toBe('bytes=5000-')
    expect(readFileSync(target())).toEqual(FILE)
  })

  it('rejects a file whose hash does not match and removes it', async () => {
    linkedEtag = 'a'.repeat(64)
    const result = await store.downloadModel('whisper-tiny', () => {})
    expect(result).toMatchObject({ ok: false, code: 'checksum-mismatch' })
    expect(existsSync(target())).toBe(false)
    expect(existsSync(`${target()}.part`)).toBe(false)
  })

  it('checks the size when the server gives no hash', async () => {
    linkedEtag = undefined
    linkedSize = FILE.length + 1
    const result = await store.downloadModel('whisper-tiny', () => {})
    expect(result).toMatchObject({ ok: false, code: 'checksum-mismatch' })
    linkedSize = FILE.length
    expect((await store.downloadModel('whisper-tiny', () => {})).ok).toBe(true)
  })

  it('deletes installed models', async () => {
    await store.downloadModel('whisper-tiny', () => {})
    await store.deleteModel('whisper-tiny')
    expect(existsSync(target())).toBe(false)
  })
})

describe('parseLinkedEtag', () => {
  it('accepts quoted SHA-256 values only', () => {
    expect(store.parseLinkedEtag(`"${SHA}"`)).toBe(SHA)
    expect(store.parseLinkedEtag([`W/"${SHA.toUpperCase()}"`])).toBe(SHA)
    expect(store.parseLinkedEtag('"abc123"')).toBeUndefined()
    expect(store.parseLinkedEtag(undefined)).toBeUndefined()
  })
})
