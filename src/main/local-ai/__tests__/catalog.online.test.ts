/**
 * Resolve every catalog model on Hugging Face with the app's own lookup code:
 * the repository and file must exist, every file must publish a SHA-256, and
 * the catalog size (used for disk checks and ratings) must be roughly right.
 *
 * Needs network access, so it only runs with LOCAL_AI_CHECK_CATALOG=1
 * (.github/workflows/local-runtimes.yml).
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  net: { fetch: (...args: Parameters<typeof fetch>) => fetch(...args) }
}))

const { resolveSource } = await import('../hf')
const { MODEL_CATALOG } = await import('../../../shared/local-ai/catalog')

/** Catalog sizes are estimates; this catches a wrong file, not a few percent */
const SIZE_TOLERANCE = 0.35

describe.skipIf(process.env.LOCAL_AI_CHECK_CATALOG !== '1')('model catalog on Hugging Face', () => {
  it.each(MODEL_CATALOG.map((m) => [m.id, m] as const))(
    '%s resolves to verifiable files',
    async (_id, model) => {
      const files = await resolveSource(model.source)
      for (const file of files) expect(file.sha256, file.url).toMatch(/^[a-f0-9]{64}$/)
      const size = files.reduce((sum, f) => sum + (f.size ?? 0), 0)
      const off = Math.abs(size - model.sizeBytes) / model.sizeBytes
      expect(off, `${model.id}: catalog ${model.sizeBytes}, Hugging Face ${size}`).toBeLessThan(
        SIZE_TOLERANCE
      )
    },
    30_000
  )
})
