/**
 * Local and self-hosted AI engines: IPC surface and server lifecycle.
 * The renderer asks for transcription / chat; this module picks the model,
 * starts the matching inference server and reports progress and status.
 */
import { app, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { mkdir } from 'fs/promises'
import path from 'path'
import { getConfigValue } from '../store'
import type { WindowManager } from '../windows'
import { LocalAiError, ok, SidecarStartError, toFailure } from './errors'
import {
  checkRuntime,
  defaultThreads,
  getDeviceProfile,
  gpuAcceleration,
  runtimeBinary
} from './hardware'
import { llamaChat, llamaLaunch, llamaTranscribe } from './llama'
import {
  cancelDownload,
  deleteModel,
  downloadModel,
  isInstalled,
  listInstalled,
  modelFiles,
  modelsDir
} from './model-store'
import {
  selfHostedChat,
  selfHostedTranscribe,
  testServer,
  type SelfHostedTarget
} from './self-hosted'
import { parakeetBusy, parakeetTranscribe } from './parakeet'
import { PidFile, SidecarServer, type RuntimeOptions, type SidecarLaunch } from './sidecar'
import { whisperLaunch, whisperTranscribe } from './whisper'
import { DEFAULT_LOCAL_AI_SETTINGS, getModel } from '../../shared/local-ai/catalog'
import type {
  ChatInput,
  LocalAiResult,
  LocalAiSettings,
  LocalModelEntry,
  LocalModelKind,
  LocalRuntime,
  TranscribeInput
} from '../../shared/local-ai/types'

const KINDS: LocalModelKind[] = ['stt', 'llm']

/** Server-based runtimes and how to launch them (Parakeet runs once per request) */
const LAUNCHERS: Partial<Record<LocalRuntime, (options: RuntimeOptions) => SidecarLaunch>> = {
  whisper: whisperLaunch,
  llama: llamaLaunch
}

let servers: Record<LocalModelKind, SidecarServer> | null = null
/** Runtimes whose GPU start failed this session; they run on the CPU from then on */
const gpuFailed = new Set<LocalRuntime>()

function settings(): LocalAiSettings {
  return {
    ...DEFAULT_LOCAL_AI_SETTINGS,
    ...(getConfigValue('localAi') as Partial<LocalAiSettings> | undefined)
  }
}

function activeModelId(kind: LocalModelKind): string | null {
  const ids = getConfigValue('localModels') as Partial<Record<LocalModelKind, string | null>>
  return ids?.[kind] ?? null
}

interface Prepared {
  model: LocalModelEntry
  options: (useGpu: boolean) => RuntimeOptions
  /** The user wants the GPU and the device has a capable one */
  gpuWanted: boolean
}

/** Everything needed to run the active model for `kind`, or why it can't run */
async function prepare(kind: LocalModelKind): Promise<LocalAiResult<Prepared>> {
  const model = getModel(activeModelId(kind))
  if (!model) return { ok: false, code: 'no-model-selected' }
  const runtime = await checkRuntime(model.runtime)
  if (!runtime.available) return { ok: false, code: 'runtime-unavailable', detail: runtime.issue }
  if (!(await isInstalled(model))) return { ok: false, code: 'model-not-downloaded' }

  const s = settings()
  const files = modelFiles(model)
  const options = (useGpu: boolean): RuntimeOptions => ({
    binary: runtimeBinary(model.runtime),
    modelFile: files.model!,
    mmprojFile: files.mmproj,
    modelId: model.id,
    modelBytes: model.sizeBytes,
    useGpu,
    threads: s.threads || defaultThreads(),
    idleUnloadMs: s.keepWarm ? 0 : s.idleUnloadMinutes * 60_000
  })
  // Integrated graphics are usually slower than the CPU, so only a capable GPU is used
  const gpuWanted = s.useGpu && (await gpuAcceleration(model.runtime)) !== 'cpu'
  return ok({ model, options, gpuWanted })
}

/** Run with the GPU if wanted; if the GPU can't load the model, retry once on the CPU */
async function withGpuFallback<T>(
  prepared: Prepared,
  attempt: (useGpu: boolean) => Promise<T>
): Promise<LocalAiResult<T>> {
  const { model, gpuWanted } = prepared
  const useGpu = gpuWanted && !gpuFailed.has(model.runtime)
  try {
    return ok(await attempt(useGpu))
  } catch (err) {
    // A model that is merely slow to load (timeout) isn't a GPU problem
    const startFailed =
      err instanceof SidecarStartError ||
      (model.runtime === 'parakeet' && err instanceof LocalAiError && err.code === 'server-failed')
    if (!useGpu || !startFailed || (err as LocalAiError).code === 'timeout') return toFailure(err)
    try {
      const result = await attempt(false)
      // Only a failure the CPU doesn't share is the GPU's, so stop using it this session
      gpuFailed.add(model.runtime)
      return ok(result)
    } catch (cpuErr) {
      return toFailure(cpuErr)
    }
  }
}

/** Use the server of a prepared model: run a request on it, or just load it */
async function onServer<T>(
  prepared: Prepared,
  use: (server: SidecarServer, launch: SidecarLaunch) => Promise<T>
): Promise<LocalAiResult<T>> {
  const { model, options, gpuWanted } = prepared
  const launcher = LAUNCHERS[model.runtime]
  if (!servers || !launcher) return { ok: false, code: 'runtime-unavailable' }
  const server = servers[model.kind]
  const result = await withGpuFallback(prepared, (useGpu) =>
    use(server, { ...launcher(options(useGpu)), cpuFallback: gpuWanted && !useGpu })
  )
  // The connection to our own server dropped: it crashed, there's no address to check
  return !result.ok && result.code === 'unreachable' ? { ...result, code: 'server-failed' } : result
}

async function transcribe(input: TranscribeInput): Promise<LocalAiResult<string>> {
  const prepared = await prepare('stt')
  if (!prepared.ok) return prepared
  const { model, options } = prepared.data
  switch (model.runtime) {
    case 'parakeet':
      // A server-based speech model that is still loaded only holds memory now
      void servers?.stt.stop()
      return withGpuFallback(prepared.data, (useGpu) => parakeetTranscribe(options(useGpu), input))
    case 'whisper':
      return onServer(prepared.data, (server, launch) =>
        server.run(launch, (baseUrl) => whisperTranscribe(baseUrl, input))
      )
    case 'llama':
      return onServer(prepared.data, (server, launch) =>
        server.run(launch, (baseUrl) => llamaTranscribe(baseUrl, input))
      )
  }
}

async function chat(input: ChatInput): Promise<LocalAiResult<string>> {
  const prepared = await prepare('llm')
  if (!prepared.ok) return prepared
  const { model } = prepared.data
  return onServer(prepared.data, (server, launch) =>
    server.run(launch, (baseUrl) => llamaChat(baseUrl, input, model))
  )
}

/** Load the active model ahead of the first request */
async function warmUp(kind: LocalModelKind): Promise<LocalAiResult<void>> {
  const prepared = await prepare(kind)
  if (!prepared.ok) return prepared
  // Parakeet has no server to load; each request starts it
  if (prepared.data.model.runtime === 'parakeet') return ok(undefined)
  return onServer(prepared.data, (server, launch) => server.load(launch))
}

async function guarded<T>(work: () => Promise<T>): Promise<LocalAiResult<T>> {
  try {
    return ok(await work())
  } catch (err) {
    return toFailure(err)
  }
}

export function registerLocalAi(windowManager: WindowManager): void {
  const pidFile = new PidFile(path.join(app.getPath('userData'), 'local-ai-servers.json'))
  void pidFile.killOrphans()
  const create = (kind: LocalModelKind): SidecarServer =>
    new SidecarServer(
      kind,
      (status) => windowManager.broadcast('localAi:status', status),
      (k, pid, binary) => pidFile.set(k, pid, binary)
    )
  servers = { stt: create('stt'), llm: create('llm') }

  ipcMain.handle('localAi:profile', () => getDeviceProfile())
  ipcMain.handle('localAi:installed', () => listInstalled())
  ipcMain.handle('localAi:status', () => KINDS.map((k) => servers?.[k].getStatus()))

  ipcMain.handle('localAi:download', (_e: IpcMainInvokeEvent, id: string) =>
    downloadModel(id, (progress) => windowManager.broadcast('localAi:download-progress', progress))
  )
  ipcMain.handle('localAi:cancel-download', (_e: IpcMainInvokeEvent, id: string) =>
    cancelDownload(id)
  )
  ipcMain.handle('localAi:delete', async (_e: IpcMainInvokeEvent, id: string) => {
    if (getModel(id)?.runtime === 'parakeet' && parakeetBusy()) {
      return { ok: false, code: 'model-in-use' } satisfies LocalAiResult<void>
    }
    for (const server of Object.values(servers ?? {})) {
      const status = server.getStatus()
      if (status.modelId !== id) continue
      if (status.state === 'busy' || status.state === 'starting') {
        return { ok: false, code: 'model-in-use' } satisfies LocalAiResult<void>
      }
      await server.stop()
    }
    return deleteModel(id)
  })

  ipcMain.handle('localAi:warm-up', (_e: IpcMainInvokeEvent, kind: LocalModelKind) => warmUp(kind))
  ipcMain.handle('localAi:retry', (_e: IpcMainInvokeEvent, kind: LocalModelKind) => {
    gpuFailed.clear()
    servers?.[kind].reset()
  })
  ipcMain.handle('localAi:transcribe', (_e: IpcMainInvokeEvent, input: TranscribeInput) =>
    transcribe(input)
  )
  ipcMain.handle('localAi:chat', (_e: IpcMainInvokeEvent, input: ChatInput) => chat(input))

  ipcMain.handle('localAi:choose-models-dir', async () => {
    const result = await dialog.showOpenDialog({
      defaultPath: modelsDir(),
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle('localAi:open-models-dir', async () => {
    const dir = modelsDir()
    await mkdir(dir, { recursive: true })
    await shell.openPath(dir)
  })

  ipcMain.handle(
    'selfHosted:test',
    (_e: IpcMainInvokeEvent, kind: LocalModelKind, target: SelfHostedTarget) =>
      guarded(() => testServer(kind, target))
  )
  ipcMain.handle('selfHosted:transcribe', (_e: IpcMainInvokeEvent, input: TranscribeInput) =>
    guarded(() => selfHostedTranscribe(input))
  )
  ipcMain.handle('selfHosted:chat', (_e: IpcMainInvokeEvent, input: ChatInput) =>
    guarded(() => selfHostedChat(input))
  )

  // "Keep model loaded": load the active local models once the app has settled
  if (settings().keepWarm) {
    setTimeout(() => {
      if (getConfigValue('speechEngine') === 'local') void warmUp('stt')
      if (getConfigValue('llmEngine') === 'local') void warmUp('llm')
    }, 10_000)
  }
}

/** Stop the inference servers; call on quit */
export function stopLocalAi(): void {
  for (const server of Object.values(servers ?? {})) void server.shutdown()
}
