import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { SidecarServer, type SidecarLaunch } from '../sidecar'
import { SidecarStartError } from '../errors'
import type { SidecarStatus } from '../../../shared/local-ai/types'

// A stand-in for whisper-server / llama-server: node serving /health on the given port.
// MODE=crash exits before listening; MODE=slow answers 503 ("loading") for a while.
const FAKE_SERVER = `
const http = require('http')
const [port, mode] = process.argv.slice(2)
if (mode === 'crash') process.exit(3)
const readyAt = Date.now() + (mode === 'slow' ? 600 : 0)
http.createServer((req, res) => {
  if (req.url === '/health') {
    res.statusCode = Date.now() < readyAt ? 503 : 200
    return res.end('{}')
  }
  res.end(JSON.stringify({ pid: process.pid }))
}).listen(Number(port), '127.0.0.1')
`

let dir: string
let script: string
const servers: SidecarServer[] = []

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'sidecar-test-'))
  script = path.join(dir, 'fake-server.js')
  writeFileSync(script, FAKE_SERVER)
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.stop()))
})

function launch(mode = 'ok', overrides: Partial<SidecarLaunch> = {}): SidecarLaunch {
  return {
    binary: process.execPath,
    args: (port) => [script, String(port), mode],
    modelId: `model-${mode}`,
    loadTimeoutMs: 5000,
    idleUnloadMs: 0,
    ...overrides
  }
}

function server(statuses: SidecarStatus[] = []): SidecarServer {
  const s = new SidecarServer('llm', (status) => statuses.push(status))
  servers.push(s)
  return s
}

async function pidOf(baseUrl: string): Promise<number> {
  const res = await fetch(baseUrl)
  return ((await res.json()) as { pid: number }).pid
}

describe('SidecarServer', () => {
  it('starts on first use, reuses the process and stops it', async () => {
    const statuses: SidecarStatus[] = []
    const s = server(statuses)
    const first = await s.run(launch(), pidOf)
    const second = await s.run(launch(), pidOf)
    expect(second).toBe(first)
    expect(statuses.map((x) => x.state)).toEqual([
      'starting',
      'ready',
      'busy',
      'ready',
      'busy',
      'ready'
    ])
    expect(s.getStatus()).toMatchObject({ state: 'ready', modelId: 'model-ok' })

    await s.stop()
    expect(s.getStatus().state).toBe('stopped')
    expect(() => process.kill(first, 0)).toThrow()
  })

  it('waits while the model is loading', async () => {
    const s = server()
    await expect(s.run(launch('slow'), async () => 'answered')).resolves.toBe('answered')
  })

  it('restarts when the launch settings change', async () => {
    const s = server()
    const first = await s.run(launch(), pidOf)
    const second = await s.run(launch('ok', { modelId: 'other-model' }), pidOf)
    expect(second).not.toBe(first)
    expect(s.getStatus().modelId).toBe('other-model')
  })

  it('serves requests one at a time', async () => {
    const s = server()
    const order: string[] = []
    const slow = s.run(launch(), async () => {
      await new Promise((r) => setTimeout(r, 100))
      order.push('first')
    })
    const fast = s.run(launch(), async () => {
      order.push('second')
    })
    await Promise.all([slow, fast])
    expect(order).toEqual(['first', 'second'])
  })

  it('recovers after the process dies unexpectedly', async () => {
    const s = server()
    const pid = await s.run(launch(), pidOf)
    process.kill(pid, 'SIGKILL')
    await new Promise((r) => setTimeout(r, 200))
    expect(s.getStatus()).toMatchObject({ state: 'stopped', error: 'server-failed' })
    const next = await s.run(launch(), pidOf)
    expect(next).not.toBe(pid)
  })

  it('reports a failed start and stops retrying after repeated crashes', async () => {
    const s = server()
    for (let i = 0; i < 3; i++) {
      await expect(s.run(launch('crash'), async () => 1)).rejects.toBeInstanceOf(SidecarStartError)
    }
    expect(s.getStatus().state).toBe('failed')
    await expect(s.run(launch('crash'), async () => 1)).rejects.toThrow()

    s.reset()
    expect(s.getStatus().state).toBe('stopped')
    await expect(s.run(launch(), async () => 'back')).resolves.toBe('back')
  })

  it('unloads the model after the idle timeout', async () => {
    const s = server()
    await s.run(launch('ok', { idleUnloadMs: 100 }), async () => undefined)
    await new Promise((r) => setTimeout(r, 400))
    expect(s.getStatus().state).toBe('stopped')
  })
})
