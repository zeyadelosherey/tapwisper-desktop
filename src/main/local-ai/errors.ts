import type { LocalAiErrorCode, LocalAiResult } from '../../shared/local-ai/types'

/** A failure with a code the renderer can translate (errors.local.*) */
export class LocalAiError extends Error {
  constructor(
    readonly code: LocalAiErrorCode,
    detail?: string
  ) {
    super(detail || code)
  }
}

/** The inference server could not be started (as opposed to a failed request) */
export class SidecarStartError extends LocalAiError {}

export function ok<T>(data: T): LocalAiResult<T> {
  return { ok: true, data }
}

/** Map anything thrown while talking to a server to a result for IPC */
export function toFailure(err: unknown): LocalAiResult<never> {
  if (err instanceof LocalAiError) return { ok: false, code: err.code, detail: err.message }
  const e = err as Error & { cause?: { code?: string } }
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
    return { ok: false, code: 'timeout', detail: e.message }
  }
  const cause = e?.cause?.code ?? ''
  if (/CERT|SSL|TLS/i.test(cause) || /certificate|ssl/i.test(e?.message ?? '')) {
    return { ok: false, code: 'tls', detail: e.message }
  }
  return { ok: false, code: 'unreachable', detail: e?.message }
}
