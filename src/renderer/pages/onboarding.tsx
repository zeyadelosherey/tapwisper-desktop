import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import {
  Mic,
  Accessibility,
  Monitor,
  Check,
  ArrowLeft,
  ArrowRight,
  Globe,
  Keyboard,
  Languages,
  CircleAlert
} from 'lucide-react'
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
import { WaveLine } from '../components/ui/wave'
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
    icon: <Mic className="h-[18px] w-[18px]" />
  },
  {
    id: 'accessibility',
    labelKey: 'onboarding.accessibility',
    descKey: 'onboarding.accessibilityDesc',
    icon: <Accessibility className="h-[18px] w-[18px]" />
  },
  {
    id: 'screenRecording',
    labelKey: 'onboarding.screenRecording',
    descKey: 'onboarding.screenRecordingDesc',
    icon: <Monitor className="h-[18px] w-[18px]" />
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
        <div className="flex min-w-0 items-center gap-2">
          <img src={appLogo} alt="" className="h-[22px] w-[22px] rounded-md object-contain" />
          <span className="font-display text-[16px] leading-none text-ink">{t('app.name')}</span>
        </div>
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
        <Stepper current={stepIndex} />

        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
          <div key={step} className="mx-auto w-full max-w-[600px] px-6 pb-6 pt-5 animate-rise">
            {step === 'welcome' && <WelcomeStep shortcut={shortcut} />}

            {step === 'permissions' && (
              <StepIntro
                title={t('onboarding.permissionsTitle', 'A few permissions')}
                description={t(
                  'onboarding.permissionsBody',
                  'TapWisper listens only while you hold your key, and types into the app you are using. Your system asks you to confirm that once.'
                )}
              >
                {!platform || !permissions ? (
                  <div className="flex justify-center py-6 text-ink-faint">
                    <Spinner className="h-5 w-5" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {relevant.map((perm) => (
                      <PermissionCard
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
                    <p
                      className="flex items-center gap-2 pt-2 text-[12.5px] text-ink-muted"
                      aria-live="polite"
                    >
                      {allGranted ? (
                        <>
                          <Check className="h-4 w-4 text-success" />
                          {t('onboarding.allGranted', 'All permissions granted')}
                        </>
                      ) : (
                        t(
                          'onboarding.permissionsRemainingCount',
                          '{{count}} permissions remaining',
                          {
                            count: pendingCount
                          }
                        )
                      )}
                    </p>
                  </div>
                )}
              </StepIntro>
            )}

            {step === 'microphone' && (
              <MicrophoneStep
                deviceId={deviceId}
                onDeviceChange={handleDeviceChange}
                onConfirm={next}
              />
            )}

            {step === 'shortcut' && <ShortcutStep shortcut={shortcut} onSave={saveShortcut} />}

            {step === 'languages' && (
              <StepIntro
                title={t('onboarding.languagesTitle', 'Which languages do you speak?')}
                description={t(
                  'onboarding.languagesBody',
                  'Pick the languages you dictate in, or leave it on auto-detect. You can change this any time in Settings.'
                )}
              >
                <SpeechLanguagePicker value={speechLanguages} onChange={handleLanguagesChange} />
              </StepIntro>
            )}

            {step === 'done' && (
              <DoneStep deviceId={deviceId} shortcut={shortcut} speechLanguages={speechLanguages} />
            )}
          </div>
        </div>

        {/* Footer: Back / Skip / Continue */}
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-hairline px-4 py-2.5">
          <div>
            {stepIndex > 0 && (
              <button type="button" className="btn-ghost" onClick={back}>
                <ArrowLeft className="h-4 w-4 rtl-flip" />
                {t('common.back', 'Back')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
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

// ── Stepper ──────────────────────────────────────────────────────

function Stepper({ current }: { current: number }): JSX.Element {
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('onboarding.progress', 'Setup progress')}
      className="shrink-0 border-b border-hairline px-4 py-2"
    >
      <ol className="mx-auto flex max-w-[780px] items-center gap-1.5">
        {STEPS.map((s, i) => {
          const done = i < current
          const active = i === current
          return (
            <li
              key={s}
              className={`flex items-center gap-2 ${i < STEPS.length - 1 ? 'min-w-0 flex-1' : 'shrink-0'}`}
              aria-current={active ? 'step' : undefined}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular transition-colors duration-200 ${
                  active
                    ? 'border-signal bg-signal text-on-signal'
                    : done
                      ? 'border-signal/40 bg-signal-tint text-signal'
                      : 'border-hairline-strong text-ink-faint'
                }`}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={2.75} /> : i + 1}
              </span>
              <span
                className={`shrink-0 whitespace-nowrap text-[12px] ${
                  active ? 'font-medium text-ink' : done ? 'text-ink-muted' : 'text-ink-faint'
                }`}
              >
                {t(STEP_LABEL_KEYS[s])}
              </span>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`mx-1 h-px min-w-[10px] flex-1 ${done ? 'bg-signal/40' : 'bg-hairline'}`}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// ── Steps ────────────────────────────────────────────────────────

function StepIntro({
  title,
  description,
  children
}: {
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
}): JSX.Element {
  return (
    <>
      <h1 className="page-title">{title}</h1>
      {description && (
        <p className="mt-1 max-w-[540px] text-[13px] leading-snug text-ink-muted text-pretty">
          {description}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </>
  )
}

function WelcomeStep({ shortcut }: { shortcut: string }): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="pt-1">
      <p className="section-label">{t('onboarding.welcomeEyebrow', 'Welcome to TapWisper')}</p>
      <h1 className="hero-title mt-1.5 text-balance">
        <Trans i18nKey="onboarding.welcomeTitle" components={{ em: <em /> }}>
          Say it once. It&apos;s <em>written</em> everywhere.
        </Trans>
      </h1>
      <p className="mt-2 max-w-[500px] text-[13.5px] leading-snug text-ink-muted text-pretty">
        {t(
          'onboarding.welcomeBody',
          'Hold a key, talk naturally, let go — your words appear in whatever app you are typing in. Mixed languages included.'
        )}
      </p>

      {/* Illustration: a key being held and text arriving on paper */}
      <div className="relative mt-5 overflow-hidden rounded-xl border border-hairline bg-panel px-4 py-4">
        <div className="flex items-center gap-3">
          <ShortcutKeys accelerator={shortcut} size="lg" pressed />
          <WaveLine className="h-9 min-w-0 flex-1" />
        </div>
        <div className="mt-3 rounded-lg border border-hairline bg-raised px-3.5 py-2.5 text-[13px] shadow-[0_1px_2px_rgb(27_26_23/0.05)]">
          <p className="text-[14px] leading-relaxed text-ink" dir="auto">
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
      </div>
    </div>
  )
}

function PermissionCard({
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
    <div
      className={`flex items-start gap-3 rounded-xl border px-3.5 py-2.5 transition-colors duration-200 ${
        granted ? 'border-success/30 bg-success-tint/40' : 'border-hairline bg-raised'
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          granted ? 'bg-success-tint text-success' : 'bg-sunken text-ink-muted'
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[14px] font-medium text-ink">{title}</h3>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              granted ? 'bg-success-tint text-success' : 'bg-warning-tint text-warning'
            }`}
          >
            {granted ? (
              <Check className="h-3 w-3" strokeWidth={3} />
            ) : (
              <CircleAlert className="h-3 w-3" />
            )}
            {granted
              ? t('onboarding.granted', 'Granted')
              : t('onboarding.notGranted', 'Not Granted')}
          </span>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{description}</p>
      </div>
      {!granted && (
        <button
          type="button"
          onClick={onRequest}
          disabled={busy}
          className="btn-secondary btn-sm shrink-0 self-center"
        >
          {busy && <Spinner className="h-3 w-3" />}
          {actionLabel}
        </button>
      )}
    </div>
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
    <StepIntro
      title={t('onboarding.micTitle', 'Check your microphone')}
      description={t(
        'onboarding.micBody',
        'Built-in and wired microphones are the most accurate. Say a few words and watch the bars.'
      )}
    >
      <div ref={containerRef}>
        <MicrophonePicker deviceId={deviceId} onChange={onDeviceChange} variant="large" active />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline px-3.5 py-2.5">
        <p className="font-display text-[15px] text-ink">
          {t('onboarding.micQuestion', 'Do the bars move when you speak?')}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={changeMicrophone}>
            {t('onboarding.micChange', 'Change microphone')}
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm}>
            {t('onboarding.micYes', 'Yes, they move')}
          </button>
        </div>
      </div>
    </StepIntro>
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
    <StepIntro
      title={t('onboarding.shortcutTitle', 'Your dictation key')}
      description={t(
        'onboarding.shortcutBody',
        'Hold it while you talk and let go to insert the text. Tap it once to keep listening hands-free.'
      )}
    >
      <div className="flex flex-col items-center rounded-xl border border-hairline bg-panel px-4 pb-3 pt-4">
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
          <p className="mt-2 text-center text-[12px] text-ink-muted">
            {t(
              'onboarding.shortcutAccessibilityHint',
              'Nothing happens? TapWisper needs Accessibility access to hear the key.'
            )}
          </p>
        )}
      </div>

      <div className="mt-4">
        <h2 className="section-label mb-3 flex items-center gap-2">
          <Keyboard className="h-3.5 w-3.5" />
          {t('onboarding.shortcutChoose', 'Choose another key')}
        </h2>
        <ShortcutPicker value={shortcut} onSave={onSave} compact />
      </div>
    </StepIntro>
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

  const rows: { icon: ReactNode; label: string; value: ReactNode }[] = [
    {
      icon: <Mic className="h-4 w-4" />,
      label: t('mic.device', 'Microphone'),
      value: <MicName deviceId={deviceId} />
    },
    {
      icon: <Keyboard className="h-4 w-4" />,
      label: t('onboarding.stepShortcut', 'Shortcut'),
      value: <ShortcutKeys accelerator={shortcut} size="sm" />
    },
    {
      icon: <Languages className="h-4 w-4" />,
      label: t('onboarding.stepLanguages', 'Languages'),
      value: languages
    }
  ]

  return (
    <div className="pt-1">
      <p className="section-label">{t('onboarding.doneEyebrow', 'Setup complete')}</p>
      <h1 className="hero-title mt-1.5 text-balance">
        <Trans i18nKey="onboarding.doneTitle" components={{ em: <em /> }}>
          You&apos;re all set. Now just <em>talk</em>.
        </Trans>
      </h1>
      <p className="mt-2 max-w-[500px] text-[13.5px] leading-snug text-ink-muted">
        {t(
          'onboarding.doneBody',
          'Click into any text field, hold your key and speak. Everything you dictate is kept in your history on this device.'
        )}
      </p>
      <dl className="mt-4 divide-y divide-hairline rounded-xl border border-hairline">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3 px-3.5 py-2">
            <dt className="flex w-40 shrink-0 items-center gap-2.5 text-[13px] text-ink-muted">
              <span className="text-ink-soft">{row.icon}</span>
              {row.label}
            </dt>
            <dd className="min-w-0 truncate text-[13.5px] font-medium text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
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
