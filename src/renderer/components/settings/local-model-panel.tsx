import { type JSX, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Download, ExternalLink, FolderOpen, RotateCcw, Trash2, X } from 'lucide-react'
import {
  Callout,
  Disclosure,
  Row,
  RowGroup,
  Section,
  Segmented,
  Spinner,
  Switch
} from '../ui/primitives'
import { useConfirmDialog } from '../confirm-dialog'
import type { LocalAiState } from '../../hooks/use-local-ai'
import { localAiErrorMessage } from '../../services/local-ai'
import { formatBytes } from '../../utils/formatting'
import {
  DEFAULT_LOCAL_AI_SETTINGS,
  MODEL_CATALOG,
  rateModel,
  recommendedModelId
} from '../../../shared/local-ai/catalog'
import type {
  DeviceProfile,
  DownloadProgress,
  LocalAiSettings,
  LocalModelEntry,
  LocalModelKind,
  ModelRating,
  SidecarStatus
} from '../../../shared/local-ai/types'

const FAMILY_LABELS: Record<string, string> = {
  whisper: 'Whisper',
  qwen: 'Qwen',
  llama: 'Llama',
  gemma: 'Gemma',
  phi: 'Phi',
  mistral: 'Mistral'
}

/** On-device model picker for one feature, with downloads and runtime options */
export function LocalModelPanel({
  kind,
  local,
  activeId,
  onActivate,
  languages
}: {
  kind: LocalModelKind
  local: LocalAiState
  activeId: string | null
  onActivate: (id: string | null) => void
  /** Spoken languages, to flag English-only speech models ([] = auto-detect) */
  languages: string[]
}): JSX.Element {
  const { t } = useTranslation()
  const { confirm, dialog } = useConfirmDialog()
  const { profile, installed, downloads } = local

  const models = useMemo(() => MODEL_CATALOG.filter((m) => m.kind === kind), [kind])
  const families = [...new Set(models.map((m) => m.family))]
  const recommended = profile ? recommendedModelId(kind, profile) : null
  const initialFamily =
    models.find((m) => m.id === activeId)?.family ??
    models.find((m) => m.id === recommended)?.family ??
    families[0]
  const [family, setFamily] = useState(initialFamily)
  useEffect(() => setFamily(initialFamily), [initialFamily])

  if (!profile) {
    return (
      <div className="flex items-center gap-2 py-6 text-[13px] text-ink-muted">
        <Spinner />
        {t('settings.localModels.checking', 'Checking this computer…')}
      </div>
    )
  }

  const download = async (model: LocalModelEntry, rating: ModelRating): Promise<void> => {
    if (rating === 'insufficient-ram' || rating === 'unsupported-language') {
      const ok = await confirm({
        title: t('settings.localModels.confirmTitle', 'Download anyway?'),
        message:
          rating === 'insufficient-ram'
            ? t(
                'settings.localModels.confirmRam',
                'This model needs about {{gb}} GB of memory. It may be very slow or make your computer unresponsive.',
                { gb: model.minRamGB }
              )
            : t(
                'settings.localModels.confirmLanguage',
                'This model only understands English, but you dictate in other languages.'
              ),
        confirmLabel: t('settings.localModels.download', 'Download')
      })
      if (!ok) return
    }
    const result = await local.download(model.id)
    if (result.ok && !activeId) onActivate(model.id)
  }

  const remove = async (model: LocalModelEntry): Promise<void> => {
    const ok = await confirm({
      title: t('settings.localModels.deleteTitle', 'Delete {{model}}?', { model: model.label }),
      message: t(
        'settings.localModels.deleteMessage',
        'This frees {{size}}. You can download it again later.',
        { size: formatBytes(model.sizeBytes) }
      ),
      confirmLabel: t('settings.localModels.delete', 'Delete'),
      destructive: true
    })
    if (!ok) return
    const result = await local.remove(model.id)
    if (result.ok && model.id === activeId) onActivate(null)
  }

  // Models that don't fit the user's languages go last (stable sort keeps catalog order)
  const rows = models
    .filter((m) => m.family === family)
    .map((model) => {
      const isInstalled = installed.includes(model.id)
      return { model, isInstalled, rating: rateModel(model, profile, languages, isInstalled) }
    })
    .sort(
      (a, b) =>
        Number(a.rating === 'unsupported-language') - Number(b.rating === 'unsupported-language')
    )

  return (
    <>
      <Section>
        <HardwareSummary profile={profile} />
        {activeId && <ServerStatus kind={kind} status={local.status[kind]} />}
      </Section>

      <Section title={t('settings.localModels.available', 'Available models')}>
        {families.length > 1 && (
          <div className="mb-2.5">
            <Segmented
              label={t('settings.localModels.family', 'Model family')}
              value={family}
              onChange={setFamily}
              options={families.map((f) => ({ value: f, label: FAMILY_LABELS[f] ?? f }))}
            />
          </div>
        )}
        <div className="divide-y divide-hairline/70 border-y border-hairline/70">
          {rows.map(({ model, isInstalled, rating }) => (
            <ModelRow
              key={model.id}
              model={model}
              rating={rating}
              installed={isInstalled}
              active={model.id === activeId}
              progress={downloads[model.id]}
              onDownload={() => void download(model, rating)}
              onCancel={() => void window.tapwisper.localAi.cancelDownload(model.id)}
              onUse={() => onActivate(model.id)}
              onDelete={() => void remove(model)}
            />
          ))}
        </div>
      </Section>

      <AdvancedLocalSettings profile={profile} onModelsDirChange={() => void local.refresh()} />
      {dialog}
    </>
  )
}

function HardwareSummary({ profile }: { profile: DeviceProfile }): JSX.Element {
  const { t } = useTranslation()
  const accel =
    profile.accel === 'cpu'
      ? t('settings.localModels.cpuOnly', 'CPU only')
      : profile.accel === 'metal'
        ? 'Metal GPU'
        : `${profile.gpuName ?? 'GPU'} (Vulkan)`
  const parts = [
    profile.cpuModel,
    t('settings.localModels.ram', '{{gb}} GB RAM', { gb: profile.totalRamGB }),
    accel,
    profile.freeDiskGB !== null
      ? t('settings.localModels.freeDisk', '{{gb}} GB free', {
          gb: Math.floor(profile.freeDiskGB)
        })
      : null
  ].filter(Boolean)

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-ink-soft">{parts.join(' · ')}</p>
      {profile.emulated && (
        <Callout tone="warning">
          {profile.platform === 'darwin'
            ? t(
                'settings.localModels.rosetta',
                'You are running the Intel build on Apple Silicon. Install the Apple Silicon build for much faster local models.'
              )
            : t(
                'settings.localModels.emulated',
                'TapWisper is running under emulation, so local models will be slow.'
              )}
        </Callout>
      )}
      {profile.modelsDirWarning && (
        <Callout tone="warning">
          {profile.modelsDirWarning === 'not-writable'
            ? t(
                'settings.localModels.dirNotWritable',
                'The models folder can’t be written to. Choose another folder below.'
              )
            : t(
                'settings.localModels.dirNonAscii',
                'The models folder path has non-English characters, which some models can’t open. If loading fails, choose another folder below.'
              )}
        </Callout>
      )}
    </div>
  )
}

function ServerStatus({
  kind,
  status
}: {
  kind: LocalModelKind
  status?: SidecarStatus
}): JSX.Element | null {
  const { t } = useTranslation()
  if (!status) return null
  const cpu = status.cpuFallback
    ? ` · ${t('settings.localModels.onCpu', 'running on the CPU (GPU unavailable)')}`
    : ''

  if (status.state === 'failed') {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[12px] text-danger">
        {status.error
          ? localAiErrorMessage(status.error, kind)
          : t('settings.localModels.failed', 'The model failed to start.')}
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => void window.tapwisper.localAi.retry(kind)}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('settings.localModels.retry', 'Retry')}
        </button>
      </div>
    )
  }
  const text: Record<Exclude<SidecarStatus['state'], 'failed'>, string> = {
    starting: t('settings.localModels.loading', 'Loading model…'),
    ready: t('settings.localModels.ready', 'Model loaded and ready'),
    busy: t('settings.localModels.ready', 'Model loaded and ready'),
    stopped: t('settings.localModels.stopped', 'The model loads when you start recording.')
  }
  return (
    <p className="mt-2 flex items-center gap-2 text-[12px] text-ink-muted" role="status">
      {status.state === 'starting' && <Spinner className="h-3.5 w-3.5" />}
      {text[status.state]}
      {status.state !== 'stopped' && cpu}
    </p>
  )
}

function ratingBadge(
  t: TFunction,
  rating: ModelRating,
  model: LocalModelEntry
): { text: string; className: string } | null {
  switch (rating) {
    case 'recommended':
      return {
        text: t('settings.localModels.recommended', 'Recommended'),
        className: 'bg-signal-tint text-signal'
      }
    case 'slow':
      return {
        text: t('settings.localModels.slow', 'May be slow'),
        className: 'bg-warning-tint text-warning'
      }
    case 'insufficient-ram':
      return {
        text: t('settings.localModels.needsRam', 'Needs {{gb}} GB RAM', { gb: model.minRamGB }),
        className: 'bg-danger-tint text-danger'
      }
    case 'insufficient-disk':
      return {
        text: t('settings.localModels.noDisk', 'Not enough disk space'),
        className: 'bg-danger-tint text-danger'
      }
    case 'unsupported-language':
      return {
        text: t('settings.localModels.englishOnly', 'English only'),
        className: 'bg-panel text-ink-muted'
      }
    default:
      return null
  }
}

function ModelRow({
  model,
  rating,
  installed,
  active,
  progress,
  onDownload,
  onCancel,
  onUse,
  onDelete
}: {
  model: LocalModelEntry
  rating: ModelRating
  installed: boolean
  active: boolean
  progress?: DownloadProgress
  onDownload: () => void
  onCancel: () => void
  onUse: () => void
  onDelete: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const badge = ratingBadge(t, rating, model)
  const downloading = progress?.state === 'downloading' || progress?.state === 'verifying'
  const percent = progress?.total ? Math.floor((progress.received / progress.total) * 100) : 0

  let action: JSX.Element
  if (downloading) {
    action = (
      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('settings.localModels.downloading', 'Downloading')}
          className="h-1.5 w-24 overflow-hidden rounded-full bg-sunken"
        >
          <div className="h-full bg-signal transition-[width]" style={{ width: `${percent}%` }} />
        </div>
        <span className="w-16 text-end text-[12px] tabular-nums text-ink-muted">
          {progress?.state === 'verifying'
            ? t('settings.localModels.verifying', 'Checking…')
            : `${percent}%`}
        </span>
        <button
          type="button"
          onClick={onCancel}
          aria-label={t('settings.localModels.cancel', 'Cancel download')}
          className="icon-btn h-7 w-7"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  } else if (installed) {
    action = (
      <div className="flex items-center gap-1.5">
        {active ? (
          <span className="rounded-md bg-signal-tint px-2 py-0.5 text-[12px] text-signal">
            {t('settings.localModels.inUse', 'In use')}
          </span>
        ) : (
          <button type="button" onClick={onUse} className="btn-secondary btn-sm">
            {t('settings.localModels.use', 'Use')}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('settings.localModels.deleteModel', 'Delete {{model}}', {
            model: model.label
          })}
          className="icon-btn h-7 w-7"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  } else {
    action = (
      <button
        type="button"
        onClick={onDownload}
        disabled={rating === 'insufficient-disk'}
        className={`${rating === 'recommended' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
      >
        <Download className="h-3.5 w-3.5" />
        {t('settings.localModels.download', 'Download')}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-3 px-1 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`text-[13px] ${active ? 'text-signal' : 'text-ink'}`}>
            {model.label}
          </span>
          <span className="text-[12px] tabular-nums text-ink-faint">
            {formatBytes(model.sizeBytes)}
          </span>
          {badge && (
            <span className={`rounded-md px-1.5 py-px text-[11px] ${badge.className}`}>
              {badge.text}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-ink-soft">
          <a href={model.licenseUrl} target="_blank" rel="noreferrer" className="hover:text-ink">
            {model.license}
          </a>
          <a
            href={model.learnMoreUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-ink"
          >
            {t('settings.localModels.learnMore', 'Learn more')}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {progress?.state === 'error' && progress.error && (
          <p className="mt-1 text-[12px] text-danger" role="alert">
            {localAiErrorMessage(progress.error, model.kind)}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}

const IDLE_OPTIONS = [5, 10, 30, 60, 0]

/** Runtime options shared by the speech and language models */
function AdvancedLocalSettings({
  profile,
  onModelsDirChange
}: {
  profile: DeviceProfile
  onModelsDirChange: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<LocalAiSettings>(DEFAULT_LOCAL_AI_SETTINGS)

  useEffect(() => {
    window.tapwisper.store
      .get('localAi')
      .then((value) => setSettings({ ...DEFAULT_LOCAL_AI_SETTINGS, ...(value as object) }))
      .catch(() => {})
  }, [])

  const update = (patch: Partial<LocalAiSettings>): void => {
    const next = { ...settings, ...patch }
    setSettings(next)
    void window.tapwisper.store.set('localAi', next)
  }

  const chooseFolder = async (): Promise<void> => {
    const dir = await window.tapwisper.localAi.chooseModelsDir()
    if (!dir) return
    update({ modelsDir: dir })
    onModelsDirChange()
  }

  return (
    <Disclosure label={t('settings.advanced', 'Advanced')}>
      <RowGroup>
        {profile.accel !== 'cpu' && (
          <Row
            title={t('settings.localModels.useGpu', 'Use the GPU')}
            description={t(
              'settings.localModels.useGpuDesc',
              'Much faster. Turn off if models fail to load.'
            )}
            control={
              <Switch
                checked={settings.useGpu}
                onChange={(useGpu) => update({ useGpu })}
                label={t('settings.localModels.useGpu', 'Use the GPU')}
              />
            }
          />
        )}
        <Row
          title={t('settings.localModels.keepWarm', 'Keep models loaded')}
          description={t(
            'settings.localModels.keepWarmDesc',
            'Fastest response, but the memory stays in use.'
          )}
          control={
            <Switch
              checked={settings.keepWarm}
              onChange={(keepWarm) => update({ keepWarm })}
              label={t('settings.localModels.keepWarm', 'Keep models loaded')}
            />
          }
        />
        {!settings.keepWarm && (
          <Row
            title={t('settings.localModels.unloadAfter', 'Free memory when idle')}
            htmlFor="local-idle"
            control={
              <select
                id="local-idle"
                value={settings.idleUnloadMinutes}
                onChange={(e) => update({ idleUnloadMinutes: Number(e.target.value) })}
                className="field w-40"
              >
                {IDLE_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes
                      ? t('settings.localModels.afterMinutes', 'After {{count}} min', {
                          count: minutes
                        })
                      : t('settings.localModels.never', 'Never')}
                  </option>
                ))}
              </select>
            }
          />
        )}
        <Row
          title={t('settings.localModels.threads', 'CPU threads')}
          htmlFor="local-threads"
          control={
            <select
              id="local-threads"
              value={settings.threads}
              onChange={(e) => update({ threads: Number(e.target.value) })}
              className="field w-40"
            >
              <option value={0}>{t('settings.localModels.automatic', 'Automatic')}</option>
              {Array.from({ length: profile.cpuCores }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          }
        />
        <Row
          title={t('settings.localModels.folder', 'Models folder')}
          description={<span dir="ltr">{profile.modelsDir}</span>}
          control={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void chooseFolder()}
                className="btn-secondary btn-sm"
              >
                {t('settings.localModels.change', 'Change')}
              </button>
              <button
                type="button"
                onClick={() => void window.tapwisper.localAi.openModelsDir()}
                aria-label={t('settings.localModels.openFolder', 'Open folder')}
                className="icon-btn h-7 w-7"
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
            </div>
          }
        />
      </RowGroup>
    </Disclosure>
  )
}
