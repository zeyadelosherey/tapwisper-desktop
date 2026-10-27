import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { Mic, Accessibility, Monitor, Check, ArrowLeft, ArrowRight, Globe } from 'lucide-react'
import appLogo from '../assets/logo.png'
import { updateDirection } from '../i18n'
import {
  UI_LANGUAGES,
  SPEECH_LANGUAGES,
  languageName,
  normalizeSpeechLanguages
} from '../constants/speech-languages'
import { useRecordShortcut, useShortcutPressed } from '../hooks/use-record-shortcut'
import { useMicrophones } from '../hooks/use-microphone'
import { ShortcutKeys } from '../components/ui/keycap'
import { Spinner } from '../components/ui/primitives'
import { MicrophonePicker } from '../components/microphone-picker'
import { ShortcutPicker } from '../components/shortcut-picker'
import { SpeechLanguagePicker } from '../components/speech-language-picker'
import { IS_MAC, OS } from '../utils/shortcuts'

// ── Types ────────────────────────────────────────────────────────

type PermissionStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'
type PermissionId = 'microphone' | 'accessibility' | 'screenRecording'
type PermissionResult = Record<PermissionId, PermissionStatus>

interface PlatformInfo {
  isMac: boolean
  isWindows: boolean
  isLinux: boolean
}

interface OnboardingProps {
  onComplete: () => void
}

const STEPS = ['welcome', 'permissions', 'microphone', 'shortcut', 'languages', 'done'] as const
type Step = (typeof STEPS)[number]

const STEP_LABEL_KEYS: Record<Step, string> = {
  welcome: 'onboarding.stepWelcome',
  permissions: 'onboarding.stepPermissions',
  microphone: 'onboarding.stepMicrophone',
  shortcut: 'onboarding.stepShortcut',
  languages: 'onboarding.stepLanguages',
  done: 'onboarding.stepDone'
}

const PERMISSIONS: { id: PermissionId; labelKey: string; descKey: string; icon: ReactNode }[] = [
  {
    id: 'microphone',
    labelKey: 'onboarding.microphone',
    descKey: 'onboarding.microphoneDesc',
    icon: <Mic className="h-4 w-4" />
  },
  {
    id: 'accessibility',
    labelKey: 'onboarding.accessibility',
    descKey: 'onboarding.accessibilityDesc',
    icon: <Accessibility className="h-4 w-4" />
  },
  {
    id: 'screenRecording',
    labelKey: 'onboarding.screenRecording',
    descKey: 'onboarding.screenRecordingDesc',
    icon: <Monitor className="h-4 w-4" />
  }
]

/** macOS needs all three; Windows and Linux only need the microphone */
function relevantPermissions(platform: PlatformInfo | null): typeof PERMISSIONS {
  if (!platform) return []
  return platform.isMac ? PERMISSIONS : PERMISSIONS.filter((p) => p.id === 'microphone')
}

// ── Component ────────────────────────────────────────────────────

export function Onboarding({ onComplete }: OnboardingProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const [step, setStep] = useState<Step>('welcome')
  const [platform, setPlatform] = useState<PlatformInfo | null>(null)
  const [permissions, setPermissions] = useState<PermissionResult | null>(null)
  const [requesting, setRequesting] = useState<PermissionId | null>(null)
  const [deviceId, setDeviceId] = useState('')
  const [speechLanguages, setSpeechLanguages] = useState<string[]>([])
  const [finishing, setFinishing] = useState(false)
  const { shortcut, save: saveShortcut } = useRecordShortcut()
  const contentRef = useRef<HTMLDivElement>(null)

  const stepIndex = STEPS.indexOf(step)

  useEffect(() => {
    window.tapwisper.platform
      .info()
      .then((info: PlatformInfo) => setPlatform(info))
      .catch(() =>
        setPlatform({ isMac: IS_MAC, isWindows: OS === 'win32', isLinux: OS === 'linux' })
      )
    Promise.all([
      window.tapwisper.store.get('microphoneDeviceId'),
      window.tapwisper.store.get('speechLanguages')
    ])
      .then(([mic, langs]) => {
        if (typeof mic === 'string') setDeviceId(mic)
        setSpeechLanguages(normalizeSpeechLanguages(langs))
      })
      .catch(() => {})
  }, [])

  // ── Permissions ────────────────────────────────────────────────

  const checkStatuses = useCallback(async () => {
    try {
      setPermissions((await window.tapwisper.permissions.check()) as PermissionResult)
    } catch {
      // Permissions API unavailable
    }
  }, [])

  // Poll while the permissions step is open so the UI follows System Settings
  useEffect(() => {
    checkStatuses()
    if (step !== 'permissions') return
    const interval = setInterval(checkStatuses, 2000)
    return () => clearInterval(interval)
  }, [checkStatuses, step])

  const handleRequest = async (type: PermissionId): Promise<void> => {
    setRequesting(type)
    try {
      const result = (await window.tapwisper.permissions.request(type)) as {
        status: PermissionStatus
        action: string
      }
      // On Windows/Linux, microphone may need getUserMedia from the renderer
      if (result?.action === 'use-renderer' && type === 'microphone') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          stream.getTracks().forEach((track) => track.stop())
        } catch {
          // User denied in the browser-level prompt
        }
      }
      await checkStatuses()
    } finally {
      setRequesting(null)
    }
  }

  const relevant = relevantPermissions(platform)
  const pendingCount = permissions
    ? relevant.filter((p) => permissions[p.id] !== 'granted').length
    : relevant.length
  const allGranted = permissions !== null && pendingCount === 0

  // ── Navigation ─────────────────────────────────────────────────

  const goTo = (next: Step): void => {
    // Leaving the permissions step: start the global shortcut hook now so
    // the shortcut test can light up (main re-checks accessibility itself).
    if (step === 'permissions') void window.tapwisper.permissions.allGranted()
    setStep(next)
    contentRef.current?.scrollTo({ top: 0 })
  }
  const back = (): void => {
    if (stepIndex > 0) goTo(STEPS[stepIndex - 1])
  }
  const next = (): void => {
    if (stepIndex < STEPS.length - 1) goTo(STEPS[stepIndex + 1])
  }

  const finish = async (): Promise<void> => {
    setFinishing(true)
    try {
      await onComplete()
    } finally {
      setFinishing(false)
    }
  }

  // ── Settings ───────────────────────────────────────────────────

  const handleDeviceChange = (id: string): void => {
    setDeviceId(id)
    void window.tapwisper.store.set('microphoneDeviceId', id)
  }

  const handleLanguagesChange = (codes: string[]): void => {
    setSpeechLanguages(codes)
    void window.tapwisper.store.set('speechLanguages', codes)
  }

  const handleUiLanguage = (code: string): void => {
    void window.tapwisper.store.set('language', code)
    i18n.changeLanguage(code)
    updateDirection(code)
  }

  // ── Render ─────────────────────────────────────────────────────

  const brandBesideTrafficLights = IS_MAC && i18n.dir() === 'ltr'
  const uiLanguage = UI_LANGUAGES.some((l) => l.code === i18n.language) ? i18n.language : 'en'

  const continueDisabled = step === 'permissions' && !allGranted

  return (
    <div className="flex h-screen flex-col bg-canvas">
      {/* Top bar: brand, language. Draggable on frameless windows. */}
      <header
        className={`drag-region flex h-11 shrink-0 items-center justify-between gap-3 ${
          brandBesideTrafficLights ? 'ps-[84px]' : 'ps-5'
        } ${OS === 'win32' ? 'pr-[150px] rtl:pl-5' : 'pe-4'}`}
      >
        <span className="font-display text-[15px] leading-none text-ink-muted">
          {t('app.name')}
        </span>
        <label className="no-drag relative flex items-center">
          <span className="sr-only">{t('settings.language', 'Language')}</span>
          <Globe className="pointer-events-none absolute start-3 h-3.5 w-3.5 text-ink-soft" />
          <select
            value={uiLanguage}
            onChange={(e) => handleUiLanguage(e.target.value)}
            className="field h-8 w-auto rounded-lg ps-8 text-[12.5px]"
          >
            {UI_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeLabel}
              </option>
            ))}
          </select>
        </label>
      </header>

      <main className="sheet mx-3 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-sheet">
        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
          <div key={step} className="animate-rise">
            {/* Hero band: logo + the step's title and one short line */}
            <div className="grain-hero">
              <div className="mx-auto w-full max-w-[600px] px-6 pb-6 pt-7">
                <img src={appLogo} alt="" className="h-7 w-7 rounded-lg object-contain" />
                <StepHeading step={step} />
              </div>
            </div>

            <div className="mx-auto w-full max-w-[600px] px-6 pb-6">
              {step === 'welcome' && <WelcomeStep shortcut={shortcut} />}

              {step === 'permissions' &&
                (!platform || !permissions ? (
                  <div className="flex justify-center py-6 text-ink-faint">
                    <Spinner className="h-5 w-5" />
                  </div>
                ) : (
                  <div>
                    <ul className="divide-y divide-hairline/70">
                      {relevant.map((perm) => (
                        <PermissionRow
                          key={perm.id}
                          icon={perm.icon}
                          title={t(perm.labelKey)}
                          description={t(perm.descKey)}
                          granted={permissions[perm.id] === 'granted'}
                          busy={requesting === perm.id}
                          actionLabel={
                            perm.id === 'microphone'
                              ? t('onboarding.allow', 'Allow')
                              : t('onboarding.openSettings', 'Open Settings')
                          }
                          onRequest={() => handleRequest(perm.id)}
                        />
                      ))}
                    </ul>
                    <p className="pt-3 text-[12px] text-ink-soft" aria-live="polite">
                      {allGranted
                        ? t('onboarding.allGranted', 'All permissions granted')
                        : t(
                            'onboarding.permissionsRemainingCount',
                            '{{count}} permissions remaining',
                            { count: pendingCount }
                          )}
                    </p>
                  </div>
                ))}

              {step === 'microphone' && (
                <MicrophoneStep
                  deviceId={deviceId}
                  onDeviceChange={handleDeviceChange}
                  onConfirm={next}
                />
              )}

              {step === 'shortcut' && <ShortcutStep shortcut={shortcut} onSave={saveShortcut} />}

              {step === 'languages' && (
                <SpeechLanguagePicker value={speechLanguages} onChange={handleLanguagesChange} />
              )}

              {step === 'done' && (
                <DoneStep
                  deviceId={deviceId}
                  shortcut={shortcut}
                  speechLanguages={speechLanguages}
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer: Back / Skip / Continue */}
        <footer className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-hairline px-4 py-2.5">
          <div>
            {stepIndex > 0 && (
              <button type="button" className="btn-ghost" onClick={back}>
                <ArrowLeft className="h-4 w-4 rtl-flip" />
                {t('common.back', 'Back')}
              </button>
            )}
          </div>
          <StepDots current={stepIndex} />
          <div className="flex items-center justify-end gap-2">
            {step === 'permissions' && !allGranted && (
              <button type="button" className="btn-ghost" onClick={next}>
                {t('onboarding.skipForNow', 'Skip for now')}
              </button>
            )}
            {step === 'done' ? (
              <button
                type="button"
                className="btn-signal btn-lg"
                onClick={finish}
                disabled={finishing}
              >
                {finishing && <Spinner className="h-3.5 w-3.5" />}
                {t('onboarding.startDictating', 'Start dictating')}
              </button>
            ) : (
              <button
                type="button"
                className="btn-signal btn-lg"
                onClick={next}
                disabled={continueDisabled}
              >
                {step === 'welcome'
                  ? t('onboarding.getStarted', 'Get started')
                  : t('onboarding.continue', 'Continue')}
                <ArrowRight className="h-4 w-4 rtl-flip" />
              </button>
            )}
          </div>
        </footer>
      </main>
    </div>
  )
}

// ── Progress ─────────────────────────────────────────────────────

function StepDots({ current }: { current: number }): JSX.Element {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('onboarding.progress', 'Setup progress')}>
      <p className="sr-only" aria-live="polite">
        {t('onboarding.stepOf', 'Step {{current}} of {{total}}', {
          current: current + 1,
          total: STEPS.length
        })}
        {': '}
        {t(STEP_LABEL_KEYS[STEPS[current]])}
      </p>
      <ol className="flex items-center gap-1.5" aria-hidden="true">
        {STEPS.map((s, i) => (
          <li
            key={s}
            title={t(STEP_LABEL_KEYS[s])}
            className={`h-1.5 rounded-full transition-[width,background-color] duration-200 ${
              i === current
                ? 'w-4 bg-signal'
                : i < current
                  ? 'w-1.5 bg-signal/40'
                  : 'w-1.5 bg-hairline-strong'
            }`}
          />
        ))}
      </ol>
    </nav>
  )
}

// ── Steps ────────────────────────────────────────────────────────

/** Title + one short line for each step, shown in the hero band */
function StepHeading({ step }: { step: Step }): JSX.Element {
  const { t } = useTranslation()
  const heading: Record<Step, { title: ReactNode; line: string }> = {
    welcome: {
      title: (
        <Trans i18nKey="onboarding.welcomeTitle" components={{ em: <em /> }}>
          Say it once. It&apos;s <em>written</em> everywhere.
        </Trans>
      ),
      line: t('onboarding.welcomeBody', 'Hold a key, talk, let go — your words appear in any app.')
    },
    permissions: {
      title: t('onboarding.permissionsTitle', 'A few permissions'),
      line: t('onboarding.permissionsBody', 'TapWisper only listens while you hold your key.')
    },
    microphone: {
      title: t('onboarding.micTitle', 'Check your microphone'),
      line: t('onboarding.micBody', 'Say a few words and watch the bars.')
    },
    shortcut: {
      title: t('onboarding.shortcutTitle', 'Your dictation key'),
      line: t('onboarding.shortcutBody', 'Hold it while you talk, let go to insert the text.')
    },
    languages: {
      title: t('onboarding.languagesTitle', 'Which languages do you speak?'),
      line: t('onboarding.languagesBody', 'Or leave it on auto-detect.')
    },
    done: {
      title: (
        <Trans i18nKey="onboarding.doneTitle" components={{ em: <em /> }}>
          You&apos;re all set. Now just <em>talk</em>.
        </Trans>
      ),
      line: t('onboarding.doneBody', 'Click into any text field, hold your key and speak.')
    }
  }
  const { title, line } = heading[step]
  const big = step === 'welcome' || step === 'done'
  return (
    <>
      <h1 className={`mt-4 text-balance ${big ? 'hero-title text-[28px]' : 'page-title'}`}>
        {title}
      </h1>
      <p className="mt-1 max-w-[520px] text-[13px] leading-snug text-ink-muted text-pretty">
        {line}
      </p>
    </>
  )
}

function WelcomeStep({ shortcut }: { shortcut: string }): JSX.Element {
  const { t } = useTranslation()
  // Illustration: the key held down and the words it produced
  return (
    <div className="pt-1">
      <ShortcutKeys accelerator={shortcut} size="lg" pressed />
      <p className="mt-4 text-[14px] leading-relaxed text-ink" dir="auto">
        {t(
          'onboarding.welcomeSample',
          'Sounds great — let’s meet Thursday at 4 and go over the launch plan.'
        )}
        <span
          aria-hidden="true"
          className="ms-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] bg-signal"
        />
      </p>
    </div>
  )
}

function PermissionRow({
  icon,
  title,
  description,
  granted,
  busy,
  actionLabel,
  onRequest
}: {
  icon: ReactNode
  title: string
  description: string
  granted: boolean
  busy: boolean
  actionLabel: string
  onRequest: () => void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <li className="flex min-h-12 items-center gap-3 py-2.5">
      <span className={`shrink-0 ${granted ? 'text-success' : 'text-ink-soft'}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13.5px] text-ink">{title}</h3>
        <p className="text-[12px] leading-snug text-ink-soft">{description}</p>
      </div>
      {granted ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-success">
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          {t('onboarding.granted', 'Granted')}
        </span>
      ) : (
        <button
          type="button"
          onClick={onRequest}
          disabled={busy}
          className="btn-secondary btn-sm shrink-0"
        >
          {busy && <Spinner className="h-3 w-3" />}
          {actionLabel}
        </button>
      )}
    </li>
  )
}

function MicrophoneStep({
  deviceId,
  onDeviceChange,
  onConfirm
}: {
  deviceId: string
  onDeviceChange: (id: string) => void
  onConfirm: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const changeMicrophone = (): void => {
    containerRef.current?.querySelector('select')?.focus()
  }
  return (
    <>
      <div ref={containerRef}>
        <MicrophonePicker deviceId={deviceId} onChange={onDeviceChange} variant="large" active />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline/70 pt-3">
        <p className="text-[13px] text-ink">
          {t('onboarding.micQuestion', 'Do the bars move when you speak?')}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={changeMicrophone}>
            {t('onboarding.micChange', 'Change microphone')}
          </button>
          <button type="button" className="btn-secondary" onClick={onConfirm}>
            {t('onboarding.micYes', 'Yes, they move')}
          </button>
        </div>
      </div>
    </>
  )
}

function ShortcutStep({
  shortcut,
  onSave
}: {
  shortcut: string
  onSave: ReturnType<typeof useRecordShortcut>['save']
}): JSX.Element {
  const { t } = useTranslation()
  const pressed = useShortcutPressed()
  const [seenPress, setSeenPress] = useState(false)

  useEffect(() => {
    if (pressed) setSeenPress(true)
  }, [pressed])

  // A new shortcut needs a fresh test
  useEffect(() => setSeenPress(false), [shortcut])

  return (
    <>
      <div className="flex flex-col items-center px-4 pb-1 pt-2">
        <ShortcutKeys accelerator={shortcut} size="lg" pressed={pressed} />
        <p className="mt-3 text-center text-[13px] text-ink" aria-live="polite">
          {pressed ? (
            <span className="inline-flex items-center gap-2 font-medium text-signal">
              <span className="ember-dot" />
              {t('onboarding.shortcutHeld', 'Listening — keep holding and speak')}
            </span>
          ) : seenPress ? (
            <span className="inline-flex items-center gap-2 font-medium text-success">
              <Check className="h-4 w-4" strokeWidth={2.75} />
              {t('onboarding.shortcutWorks', 'It works. You’re ready to dictate.')}
            </span>
          ) : (
            t('onboarding.shortcutTest', 'Hold it and speak — does the key light up?')
          )}
        </p>
        {IS_MAC && !seenPress && (
          <p className="mt-1 text-center text-[12px] text-ink-soft">
            {t(
              'onboarding.shortcutAccessibilityHint',
              'Nothing happens? TapWisper needs Accessibility access to hear the key.'
            )}
          </p>
        )}
      </div>

      <div className="mt-5">
        <h2 className="section-label mb-1.5">
          {t('onboarding.shortcutChoose', 'Choose another key')}
        </h2>
        <ShortcutPicker value={shortcut} onSave={onSave} compact />
      </div>
    </>
  )
}

function DoneStep({
  deviceId,
  shortcut,
  speechLanguages
}: {
  deviceId: string
  shortcut: string
  speechLanguages: string[]
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const languages =
    speechLanguages.length === 0
      ? t('settings.speechAutoDetect', 'Auto-detect')
      : speechLanguages
          .map((c) =>
            languageName(
              c,
              i18n.language,
              SPEECH_LANGUAGES.find((l) => l.code === c)?.nativeLabel ?? c
            )
          )
          .join(' + ')

  const rows: { label: string; value: ReactNode }[] = [
    { label: t('mic.device', 'Microphone'), value: <MicName deviceId={deviceId} /> },
    {
      label: t('onboarding.stepShortcut', 'Shortcut'),
      value: <ShortcutKeys accelerator={shortcut} size="sm" />
    },
    { label: t('onboarding.stepLanguages', 'Languages'), value: languages }
  ]

  return (
    <dl className="divide-y divide-hairline/70">
      {rows.map((row) => (
        <div key={row.label} className="flex min-h-10 items-center gap-3 py-2">
          <dt className="w-36 shrink-0 text-[13px] text-ink-soft">{row.label}</dt>
          <dd className="min-w-0 truncate text-[13px] text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Human name of the selected microphone ('' = system default) */
function MicName({ deviceId }: { deviceId: string }): JSX.Element {
  const { t } = useTranslation()
  const fallback = t('mic.systemDefault', 'System default')
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return <>{fallback}</>
  }
  return <MicNameLookup deviceId={deviceId} fallback={fallback} />
}

function MicNameLookup({
  deviceId,
  fallback
}: {
  deviceId: string
  fallback: string
}): JSX.Element {
  const { devices } = useMicrophones()
  const label = devices.find((d) => d.deviceId === deviceId)?.label
  return <>{label && label !== 'Microphone' ? label : fallback}</>
}
