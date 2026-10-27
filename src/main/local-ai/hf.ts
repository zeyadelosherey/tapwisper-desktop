/**
 * Hugging Face Hub lookups. One API call gives a repository's current commit
 * and, for every file, its size and SHA-256 — so downloads can be pinned to
 * that commit (a file changed upstream can't be mixed into a resumed download)
 * and verified without trusting the transfer.
 */
import { net } from 'electron'
import { LocalAiError } from './errors'
import type { ModelSource } from '../../shared/local-ai/types'

const HUB = 'https://huggingface.co'
const LOOKUP_TIMEOUT_MS = 15_000

export type FileRole = 'model' | 'mmproj'

export interface RemoteFile {
  role: FileRole
  url: string
  size?: number
  sha256?: string
}

/** The parts of GET /api/models/{repo}?blobs=true we use */
export interface RepoInfo {
  sha?: string
  siblings?: Array<{
    rfilename: string
    size?: number
    lfs?: { sha256?: string; oid?: string; size?: number }
  }>
}

type Sibling = NonNullable<RepoInfo['siblings']>[number]

const SPLIT_GGUF = /-\d{5}-of-\d{5}\.gguf$/i
const MMPROJ = /(^|\/)mmproj[^/]*\.gguf$/i
/** Projector precisions, best first */
const MMPROJ_PREFERENCE = ['f16', 'bf16', 'q8_0']

/** "model-Q4_K_M.gguf" is precision Q4_K_M; "mmproj-bf16.gguf" is bf16, not f16 */
function hasPrecision(file: Sibling, precision: string): boolean {
  const name = file.rfilename.toLowerCase()
  const suffix = `${precision.toLowerCase()}.gguf`
  return name.endsWith(suffix) && '-._'.includes(name.charAt(name.length - suffix.length - 1))
}

/** Shallowest path first, so a repo-root file beats one in a subfolder */
function byDepth(a: Sibling, b: Sibling): number {
  return a.rfilename.split('/').length - b.rfilename.split('/').length
}

function findModelFile(source: ModelSource, files: Sibling[]): Sibling | undefined {
  if (source.file) return files.find((f) => f.rfilename === source.file)
  const candidates = files
    .filter((f) => f.rfilename.endsWith('.gguf') && !MMPROJ.test(f.rfilename))
    .filter((f) => !SPLIT_GGUF.test(f.rfilename))
    .sort(byDepth)
  for (const quant of source.quant ?? []) {
    const match = candidates.find((f) => hasPrecision(f, quant))
    if (match) return match
  }
  return undefined
}

function findProjector(files: Sibling[]): Sibling | undefined {
  const projectors = files.filter((f) => MMPROJ.test(f.rfilename)).sort(byDepth)
  for (const precision of MMPROJ_PREFERENCE) {
    const match = projectors.find((f) => hasPrecision(f, precision))
    if (match) return match
  }
  return projectors[0]
}

function toRemote(repo: string, revision: string, role: FileRole, file: Sibling): RemoteFile {
  const sha = file.lfs?.sha256 ?? file.lfs?.oid
  return {
    role,
    url: `${HUB}/${repo}/resolve/${revision}/${file.rfilename.split('/').map(encodeURIComponent).join('/')}`,
    size: file.lfs?.size ?? file.size,
    sha256: sha && /^[a-f0-9]{64}$/i.test(sha) ? sha.toLowerCase() : undefined
  }
}

/** The files a catalog source refers to, from a repository listing */
export function pickFiles(source: ModelSource, info: RepoInfo): RemoteFile[] {
  const files = info.siblings ?? []
  const revision = info.sha ?? 'main'
  const model = findModelFile(source, files)
  if (!model) {
    const wanted = source.file ?? source.quant?.join(' or ')
    throw new LocalAiError('model-unavailable', `${source.repo} has no ${wanted} file`)
  }
  const result = [toRemote(source.repo, revision, 'model', model)]
  if (source.mmproj) {
    const projector = findProjector(files)
    if (!projector) throw new LocalAiError('model-unavailable', `${source.repo} has no mmproj file`)
    result.push(toRemote(source.repo, revision, 'mmproj', projector))
  }
  return result
}

/** Look up a source's files on Hugging Face */
export async function resolveSource(source: ModelSource): Promise<RemoteFile[]> {
  const res = await net.fetch(`${HUB}/api/models/${source.repo}?blobs=true`, {
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS)
  })
  if (res.status === 401 || res.status === 404) {
    throw new LocalAiError('model-unavailable', `${source.repo} is not available`)
  }
  if (!res.ok) throw new LocalAiError('download-failed', `Hugging Face answered ${res.status}`)
  return pickFiles(source, (await res.json()) as RepoInfo)
}
