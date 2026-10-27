import { describe, it, expect } from 'vitest'
import { assertOk, readChatReply, readTranscript, transcriptionForm } from '../http'
import { LocalAiError, toFailure } from '../errors'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('assertOk', () => {
  it('maps HTTP statuses to error codes', async () => {
    await expect(assertOk(new Response('', { status: 200 }))).resolves.toBeUndefined()
    for (const [status, code] of [
      [401, 'unauthorized'],
      [403, 'unauthorized'],
      [404, 'not-found'],
      [500, 'bad-response']
    ] as const) {
      await expect(assertOk(new Response('nope', { status }))).rejects.toMatchObject({ code })
    }
  })

  it('recognises a request longer than the context', async () => {
    const body = JSON.stringify({ error: { type: 'exceed_context_size_error', code: 400 } })
    await expect(assertOk(new Response(body, { status: 400 }))).rejects.toMatchObject({
      code: 'input-too-long'
    })
  })
})

describe('readChatReply', () => {
  it('returns the assistant text without reasoning blocks', async () => {
    const res = json({ choices: [{ message: { content: '<think>x</think>\nHello.' } }] })
    await expect(readChatReply(res)).resolves.toBe('Hello.')
  })

  it('rejects replies without content', async () => {
    await expect(readChatReply(json({ choices: [] }))).rejects.toMatchObject({
      code: 'bad-response'
    })
  })

  it('rejects a reply cut off while the model was still reasoning', async () => {
    const res = json({ choices: [{ message: { content: '<think>Okay, the user wants' } }] })
    await expect(readChatReply(res)).rejects.toMatchObject({ code: 'bad-response' })
  })
})

describe('readTranscript', () => {
  it('returns the transcript text', async () => {
    await expect(readTranscript(json({ text: ' Hello. ' }))).resolves.toBe('Hello.')
  })

  it('rejects answers that are not a transcript', async () => {
    for (const res of [
      json({ error: 'failed to read audio' }),
      json({ detail: 'x' }),
      new Response('<html>Sign in</html>', { status: 200 })
    ]) {
      await expect(readTranscript(res)).rejects.toMatchObject({ code: 'bad-response' })
    }
  })
})

describe('transcriptionForm', () => {
  it('sends the audio, hints and per-server fields', () => {
    const form = transcriptionForm(
      { wav: new Uint8Array([1, 2, 3]), seconds: 1, language: 'ar', prompt: 'TapWisper' },
      { model: 'whisper-1', language: 'auto' }
    )
    expect(form.get('model')).toBe('whisper-1')
    expect(form.get('language')).toBe('auto')
    expect(form.get('prompt')).toBe('TapWisper')
    expect(form.get('temperature')).toBe('0')
    expect((form.get('file') as File).size).toBe(3)
  })

  it('leaves the language out when auto-detecting', () => {
    const form = transcriptionForm({ wav: new Uint8Array(1), seconds: 1 }, {})
    expect(form.has('language')).toBe(false)
  })
})

describe('toFailure', () => {
  it('keeps coded errors and classifies network failures', () => {
    expect(toFailure(new LocalAiError('not-configured'))).toMatchObject({
      ok: false,
      code: 'not-configured'
    })
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    expect(toFailure(timeout)).toMatchObject({ code: 'timeout' })
    const tls = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }
    })
    expect(toFailure(tls)).toMatchObject({ code: 'tls' })
    expect(toFailure(new TypeError('fetch failed'))).toMatchObject({ code: 'unreachable' })
  })
})
