#!/usr/bin/env node
/**
 * Check that every model in the local catalog can still be downloaded and that
 * its size roughly matches the catalog (sizes drive the disk-space checks).
 * Hugging Face answers a HEAD on /resolve/ with a redirect carrying the file
 * size in X-Linked-Size.
 *
 * Usage: node scripts/check-model-urls.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const catalog = JSON.parse(readFileSync(join(ROOT, 'src/shared/local-ai/models.json'), 'utf8'))
/** Catalog sizes are for display and disk checks; a few percent off is fine */
const SIZE_TOLERANCE = 0.1

let failed = 0
for (const model of [...catalog.stt, ...catalog.llm]) {
  const res = await fetch(model.url, { method: 'HEAD', redirect: 'manual' })
  const size = Number(res.headers.get('x-linked-size') || res.headers.get('content-length'))
  const reachable = res.status === 200 || (res.status >= 300 && res.status < 400)
  const sizeOk = !size || Math.abs(size - model.sizeBytes) / model.sizeBytes <= SIZE_TOLERANCE
  const verdict = reachable && sizeOk ? 'ok  ' : 'FAIL'
  if (verdict === 'FAIL') failed++
  console.log(
    `${verdict} ${model.id.padEnd(28)} HTTP ${res.status}  catalog ${model.sizeBytes}  server ${size || '?'}`
  )
}

if (failed) {
  console.error(
    `\n${failed} model(s) unreachable or with a wrong size in src/shared/local-ai/models.json`
  )
  process.exit(1)
}
