/**
 * Lightweight API key validation: a cheap authenticated read (model listing)
 * against each provider, so users can tell a bad key apart from bad audio.
 */

export type KeyProvider = 'gemini' | 'together' | 'openai' | 'claude' | 'soniox'

export interface KeyTestResult {
  ok: boolean
  message: string
}

function requestFor(provider: KeyProvider, key: string): { url: string; init: RequestInit } {
  switch (provider) {
    case 'gemini':
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(key)}`,
        init: {}
      }
    case 'together':
      return {
        url: 'https://api.together.xyz/v1/models',
        init: { headers: { Authorization: `Bearer ${key}` } }
      }
    case 'openai':
      return {
        url: 'https://api.openai.com/v1/models',
        init: { headers: { Authorization: `Bearer ${key}` } }
      }
    case 'claude':
      return {
        url: 'https://api.anthropic.com/v1/models?limit=1',
        init: {
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          }
        }
      }
    case 'soniox':
      return {
        url: 'https://api.soniox.com/v1/files?limit=1',
        init: { headers: { Authorization: `Bearer ${key}` } }
      }
  }
}

export async function testApiKey(provider: KeyProvider, rawKey: string): Promise<KeyTestResult> {
  const key = rawKey.trim()
  if (!key) return { ok: false, message: 'Enter a key first' }

  const { url, init } = requestFor(provider, key)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (response.ok) return { ok: true, message: 'Key works' }
    if (response.status === 401 || response.status === 403 || response.status === 400) {
      return { ok: false, message: 'Key was rejected by the provider' }
    }
    if (response.status === 429) {
      return { ok: true, message: 'Key is valid, but you are rate limited right now' }
    }
    return { ok: false, message: `Provider returned an error (${response.status})` }
  } catch {
    return { ok: false, message: 'Could not reach the provider — check your connection' }
  } finally {
    clearTimeout(timer)
  }
}
