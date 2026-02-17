import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, Accessibility, Monitor, CheckCircle2, AlertCircle, ArrowRight, Shield } from 'lucide-react'
import appLogo from '../assets/logo.png'

// ── Types ────────────────────────────────────────────────────────

type PermissionStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'

interface PermissionResult {
  microphone: PermissionStatus
  accessibility: PermissionStatus
  screenRecording: PermissionStatus
}

interface PlatformInfo {
  isMac: boolean
  isWindows: boolean
  isLinux: boolean
}

interface PermissionCardData {
  id: 'microphone' | 'accessibility' | 'screenRecording'
  labelKey: string
  descKey: string
  icon: React.ReactNode
  color: string
  bgColor: string
}

interface OnboardingProps {
  onComplete: () => void
}

// ── Permission card definitions ──────────────────────────────────

const ALL_PERMISSIONS: PermissionCardData[] = [
  {
    id: 'microphone',
    labelKey: 'onboarding.microphone',
    descKey: 'onboarding.microphoneDesc',
    icon: <Mic className="w-5 h-5" />,
    color: '#F04545',
    bgColor: 'rgba(240, 69, 69, 0.1)'
  },
  {
    id: 'accessibility',
    labelKey: 'onboarding.accessibility',
    descKey: 'onboarding.accessibilityDesc',
    icon: <Accessibility className="w-5 h-5" />,
    color: '#7EB6E0',
    bgColor: 'rgba(126, 182, 224, 0.1)'
  },
  {
    id: 'screenRecording',
    labelKey: 'onboarding.screenRecording',
    descKey: 'onboarding.screenRecordingDesc',
    icon: <Monitor className="w-5 h-5" />,
    color: '#B07CD8',
    bgColor: 'rgba(176, 124, 216, 0.1)'
  }
]

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Filter permissions relevant to the current platform.
 * macOS needs all three; Windows and Linux only need microphone.
 */
function getRelevantPermissions(platform: PlatformInfo): PermissionCardData[] {
  if (platform.isMac) return ALL_PERMISSIONS
  return ALL_PERMISSIONS.filter((p) => p.id === 'microphone')
}

function isGranted(status: PermissionStatus): boolean {
  return status === 'granted'
}

// ── Component ────────────────────────────────────────────────────

export function Onboarding({ onComplete }: OnboardingProps): JSX.Element {
  const { t } = useTranslation()
  const [permissions, setPermissions] = useState<PermissionResult | null>(null)
  const [platform, setPlatform] = useState<PlatformInfo | null>(null)
  const [requesting, setRequesting] = useState<string | null>(null)

  // Fetch platform info once on mount
  useEffect(() => {
    window.tapwisper.platform.info().then((info: PlatformInfo) => {
      setPlatform(info)
    })
  }, [])

  // Check permission statuses and poll every 2 seconds so the UI
  // updates when the user toggles permissions in System Settings.
  const checkStatuses = useCallback(async () => {
    try {
      const result = (await window.tapwisper.permissions.check()) as PermissionResult
      setPermissions(result)
      return result
    } catch {
      // Permissions API unavailable — fallback to unknown
      return null
    }
  }, [])

  // On first check, if all relevant permissions are already granted, skip onboarding entirely
  useEffect(() => {
    let cancelled = false

    const initialCheck = async () => {
      const result = await checkStatuses()
      if (cancelled || !result || !platform) return

      const relevant = getRelevantPermissions(platform)
      const allAlreadyGranted = relevant.every((p) => isGranted(result[p.id]))
      if (allAlreadyGranted) {
        onComplete()
      }
    }

    if (platform) {
      initialCheck()
    }

    return () => {
      cancelled = true
    }
  }, [checkStatuses, platform, onComplete])

  // Poll every 2 seconds so the UI updates when the user toggles permissions in System Settings
  useEffect(() => {
    const interval = setInterval(checkStatuses, 2000)
    return () => clearInterval(interval)
  }, [checkStatuses])

  // Handle requesting a single permission
  const handleRequest = async (type: 'microphone' | 'accessibility' | 'screenRecording') => {
    setRequesting(type)
    try {
      const result = (await window.tapwisper.permissions.request(type)) as {
        status: PermissionStatus
        action: string
      }

      // On Windows/Linux, microphone may need getUserMedia from the renderer
      if (result.action === 'use-renderer' && type === 'microphone') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          stream.getTracks().forEach((track) => track.stop())
        } catch {
          // User denied in the browser-level prompt
        }
      }

      // Re-check all statuses after the request
      await checkStatuses()
    } finally {
      setRequesting(null)
    }
  }

  // Determine which permissions to show
  const relevantPermissions = platform ? getRelevantPermissions(platform) : []

  // Count how many are not yet granted
  const pendingCount = permissions
    ? relevantPermissions.filter((p) => !isGranted(permissions[p.id])).length
    : relevantPermissions.length

  const allGranted = pendingCount === 0 && permissions !== null

  // Loading state while we fetch platform and permission info
  if (!platform || !permissions) {
    return (
      <div className="flex items-center justify-center h-screen bg-theme-bg">
        <div className="w-6 h-6 border-2 border-theme-border border-t-sky-accent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-theme-bg p-8">
      <div className="w-full max-w-lg">
        {/* ── Header ─────────────────────────────────────── */}
        <div
          className="flex flex-col items-center text-center mb-8"
          style={{ animation: 'slide-up 0.4s ease-out backwards' }}
        >
          <div className="w-16 h-16 rounded-2xl overflow-hidden mb-4 shadow-lg shadow-sky-accent/10">
            <img src={appLogo} alt="" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-theme-text tracking-tight mb-2">
            {t('onboarding.title')}
          </h1>
          <p className="text-sm text-theme-text-secondary max-w-sm leading-relaxed">
            {t('onboarding.subtitle')}
          </p>
        </div>

        {/* ── Permission Cards ───────────────────────────── */}
        <div className="space-y-3 mb-8">
          {relevantPermissions.map((perm, idx) => {
            const status = permissions[perm.id]
            const granted = isGranted(status)
            const isRequesting = requesting === perm.id

            return (
              <div
                key={perm.id}
                className={`
                  relative rounded-2xl border p-4 transition-all duration-300
                  ${granted
                    ? 'bg-theme-card border-green-500/20'
                    : 'bg-theme-card border-theme-border/30 hover:border-theme-border/50'
                  }
                `}
                style={{
                  animation: `slide-up 0.4s ease-out ${(idx + 1) * 80}ms backwards`
                }}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: perm.bgColor, color: perm.color }}
                  >
                    {perm.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-theme-text">
                        {t(perm.labelKey)}
                      </h3>
                      {granted ? (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" />
                          {t('onboarding.granted')}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                          <AlertCircle className="w-3 h-3" />
                          {t('onboarding.notGranted')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-theme-text-secondary leading-relaxed">
                      {t(perm.descKey)}
                    </p>
                  </div>

                  {/* Action Button */}
                  {!granted && (
                    <button
                      onClick={() => handleRequest(perm.id)}
                      disabled={isRequesting}
                      className={`
                        shrink-0 px-3.5 py-2 rounded-xl text-xs font-medium transition-all
                        ${isRequesting
                          ? 'bg-theme-surface text-theme-text-muted cursor-wait'
                          : 'bg-sky-accent/10 text-sky-accent hover:bg-sky-accent/20 active:scale-95'
                        }
                      `}
                    >
                      {isRequesting
                        ? '...'
                        : perm.id === 'microphone'
                          ? t('onboarding.grant')
                          : t('onboarding.openSettings')
                      }
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Status & Continue ───────────────────────────── */}
        <div
          className="flex flex-col items-center gap-4"
          style={{
            animation: `slide-up 0.4s ease-out ${(relevantPermissions.length + 1) * 80}ms backwards`
          }}
        >
          {/* Status indicator */}
          <div className="flex items-center gap-2 text-xs">
            {allGranted ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-green-500 font-medium">
                  {t('onboarding.allGranted')}
                </span>
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 text-theme-text-muted" />
                <span className="text-theme-text-muted">
                  {pendingCount} {t('onboarding.permissionsRemaining')}
                </span>
              </>
            )}
          </div>

          {/* Continue button */}
          <button
            onClick={onComplete}
            disabled={!allGranted}
            className={`
              w-full max-w-xs flex items-center justify-center gap-2 px-6 py-3 rounded-2xl
              text-sm font-semibold transition-all duration-300
              ${allGranted
                ? 'bg-sky-accent text-white hover:bg-sky-accent/90 active:scale-[0.98] shadow-lg shadow-sky-accent/20'
                : 'bg-theme-surface text-theme-text-muted cursor-not-allowed'
              }
            `}
          >
            {t('onboarding.continue')}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
