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
import { ok, SidecarStartError, toFailure } from './errors'
import {
  checkRuntime,
  defaultThreads,
  getDeviceProfile,
  gpuAcceleration,
  runtimeBinary
} from './hardware'
import { llamaChat, llamaLaunch } from './llama'
import {
  cancelDownload,
  deleteModel,
  downloadModel,
  isInstalled,
  listInstalled,
  modelPath,
  modelsDir
} from './model-store'
import {
  selfHostedChat,
  selfHostedTranscribe,
  testServer,
  type SelfHostedTarget
} from './self-hosted'
import { PidFile, SidecarServer, type SidecarLaunch } from './sidecar'
import { whisperLaunch, whisperTranscribe } from './whisper'
import { DEFAULT_LOCAL_AI_SETTINGS, getModel } from '../../shared/local-ai/catalog'
import type {
  ChatInput,
  LocalAiResult,
  LocalAiSettings,
  LocalModelEntry,
  LocalModelKind,
  TranscribeInput
} from '../../shared/local-ai/types'

const KINDS: LocalModelKind[] = ['stt', 'llm']

let servers: Record<LocalModelKind, SidecarServer> | null = null
/** Runtimes whose GPU start failed this session; they run on the CPU from then on */
const gpuFailed = new Set<LocalModelKind>()

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
  launch: (useGpu: boolean) => SidecarLaunch
  useGpu: boolean
}

/** Everything needed to start the server for `kind`, or why it can't start */
async function prepare(kind: LocalModelKind): Promise<LocalAiResult<Prepared>> {
  const runtime = await checkRuntime(kind)
  if (!runtime.available) return { ok: false, code: 'runtime-unavailable', detail: runtime.issue }
  const model = getModel(activeModelId(kind))
  if (!model) return { ok: false, code: 'no-model-selected' }
  if (!(await isInstalled(model))) return { ok: false, code: 'model-not-downloaded' }

  const s = settings()
  // Integrated graphics are usually slower than the CPU, so only a capable GPU is used
  const gpuWanted = s.useGpu && (await gpuAcceleration()) !== 'cpu'
  const build = kind === 'stt' ? whisperLaunch : llamaLaunch
  const launch = (useGpu: boolean): SidecarLaunch => ({
    ...build({
      binary: runtimeBinary(kind),
      modelFile: modelPath(model),
      modelId: model.id,
      modelBytes: model.sizeBytes,
      useGpu,
      threads: s.threads || defaultThreads(),
      idleUnloadMs: s.keepWarm ? 0 : s.idleUnloadMinutes * 60_000
    }),
    cpuFallback: gpuWanted && !useGpu
  })
  return ok({ model, launch, useGpu: gpuWanted && !gpuFailed.has(kind) })
}

/** Run a request on the local server, falling back to the CPU once if the GPU can't load the model */
async function runLocal<T>(
  kind: LocalModelKind,
  task: (baseUrl: string, model: LocalModelEntry) => Promise<T>
): Promise<LocalAiResult<T>> {
  if (!servers) return { ok: false, code: 'runtime-unavailable' }
  const server = servers[kind]
  const prepared = await prepare(kind)
  if (!prepared.ok) return prepared
  const { model, launch, useGpu } = prepared.data
  try {
    return ok(await server.run(launch(useGpu), (baseUrl) => task(baseUrl, model)))
  } catch (err) {
    // A model that is merely slow to load (timeout) isn't a GPU problem
    const gpuFailure = err instanceof SidecarStartError && err.code !== 'timeout'
    if (!gpuFailure || !useGpu) return toFailure(err)
    gpuFailed.add(kind)
    try {
      return ok(await server.run(launch(false), (baseUrl) => task(baseUrl, model)))
    } catch (cpuErr) {
      return toFailure(cpuErr)
    }
  }
}

async function guarded<T>(work: () => Promise<T>): Promise<LocalAiResult<T>> {
  try {
    return ok(await work())
  } catch (err) {
    return toFailure(err)
  }
}

export function registerLocalAi(windowManager: WindowManager): void {
  const pidFile = new PidFile(path.join(app.getPath('userData'), 'local-ai-servers.json'), {
    stt: runtimeBinary('stt'),
    llm: runtimeBinary('llm')
  })
  void pidFile.killOrphans()
  const create = (kind: LocalModelKind): SidecarServer =>
    new SidecarServer(
      kind,
      (status) => windowManager.broadcast('localAi:status', status),
      (k, pid) => pidFile.set(k, pid)
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

  ipcMain.handle('localAi:warm-up', (_e: IpcMainInvokeEvent, kind: LocalModelKind) =>
    runLocal(kind, async () => undefined)
  )
  ipcMain.handle('localAi:retry', (_e: IpcMainInvokeEvent, kind: LocalModelKind) => {
    gpuFailed.delete(kind)
    servers?.[kind].reset()
  })
  ipcMain.handle('localAi:transcribe', (_e: IpcMainInvokeEvent, input: TranscribeInput) =>
    runLocal('stt', (baseUrl) => whisperTranscribe(baseUrl, input))
  )
  ipcMain.handle('localAi:chat', (_e: IpcMainInvokeEvent, input: ChatInput) =>
    runLocal('llm', (baseUrl, model) => llamaChat(baseUrl, input, model))
  )

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
      if (getConfigValue('speechEngine') === 'local') void runLocal('stt', async () => undefined)
      if (getConfigValue('llmEngine') === 'local') void runLocal('llm', async () => undefined)
    }, 10_000)
  }
}

/** Stop the inference servers; call on quit */
export function stopLocalAi(): void {
  for (const server of Object.values(servers ?? {})) void server.shutdown()
}
