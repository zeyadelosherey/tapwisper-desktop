import { useCallback, useEffect, useState } from 'react'
import type {
  DeviceProfile,
  DownloadProgress,
  LocalAiResult,
  LocalModelKind,
  SidecarStatus
} from '../../shared/local-ai/types'

export interface LocalAiState {
  /** null while loading */
  profile: DeviceProfile | null
  installed: string[]
  /** Running and finished-with-error downloads by model id */
  downloads: Record<string, DownloadProgress>
  status: Partial<Record<LocalModelKind, SidecarStatus>>
  download: (id: string) => Promise<LocalAiResult<void>>
  remove: (id: string) => Promise<LocalAiResult<void>>
  refresh: () => Promise<void>
}

/** Device profile, downloaded models, download progress and server status, kept live */
export function useLocalAi(): LocalAiState {
  const [profile, setProfile] = useState<DeviceProfile | null>(null)
  const [installed, setInstalled] = useState<string[]>([])
  const [downloads, setDownloads] = useState<Record<string, DownloadProgress>>({})
  const [status, setStatus] = useState<Partial<Record<LocalModelKind, SidecarStatus>>>({})

  const refresh = useCallback(async () => {
    const [nextProfile, nextInstalled, statuses] = await Promise.all([
      window.tapwisper.localAi.profile(),
      window.tapwisper.localAi.installed(),
      window.tapwisper.localAi.status()
    ])
    setProfile(nextProfile)
    setInstalled(nextInstalled)
    setStatus(Object.fromEntries(statuses.map((s) => [s.kind, s])))
  }, [])

  useEffect(() => {
    void refresh().catch(() => {})
    const offProgress = window.tapwisper.on('localAi:download-progress', (value: unknown) => {
      const progress = value as DownloadProgress
      setDownloads((prev) => {
        const next = { ...prev, [progress.id]: progress }
        if (progress.state === 'done' || progress.state === 'cancelled') delete next[progress.id]
        return next
      })
    })
    const offStatus = window.tapwisper.on('localAi:status', (value: unknown) => {
      const next = value as SidecarStatus
      setStatus((prev) => ({ ...prev, [next.kind]: next }))
    })
    return () => {
      offProgress()
      offStatus()
    }
  }, [refresh])

  const download = useCallback(
    async (id: string) => {
      const result = await window.tapwisper.localAi.download(id)
      // Disk space and the installed list changed
      await refresh()
      return result
    },
    [refresh]
  )

  const remove = useCallback(
    async (id: string) => {
      const result = await window.tapwisper.localAi.delete(id)
      await refresh()
      return result
    },
    [refresh]
  )

  return { profile, installed, downloads, status, download, remove, refresh }
}
