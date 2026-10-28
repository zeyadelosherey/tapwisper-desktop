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
  TextCursorInput,
  Users
} from 'lucide-react'
import appLogo from '../assets/logo.png'
import { updateDirection } from '../i18n'
import { UI_LANGUAGES, normalizeSpeechLanguages } from '../constants/speech-languages'
import { useRecordShortcut, useShortcutPressed } from '../hooks/use-record-shortcut'
import { ShortcutKeys } from '../components/ui/keycap'
import { Spinner } from '../components/ui/primitives'
import { MicrophonePicker } from '../components/microphone-picker'
import { ShortcutPicker } from '../components/shortcut-picker'
import { SpeechLanguagePicker } from '../components/speech-language-picker'
import { FnKeyNotice } from '../components/fn-key-notice'
import { SpeechSetup } from '../components/onboarding/speech-setup'
import { WelcomeDemo } from '../components/onboarding/welcome-demo'
import { IS_MAC, OS, sameShortcut } from '../utils/shortcuts'

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

const STEPS = ['welcome', 'permissions', 'microphone', 'languages', 'speech', 'try'] as const
type Step = (typeof STEPS)[number]

const STEP_LABELS: Record<Step, [key: string, fallback: string]> = {
  welcome: ['onboarding.stepWelcome', 'Welcome'],
  permissions: ['onboarding.stepPermissions', 'Permissions'],
  microphone: ['onboarding.stepMicrophone', 'Microphone'],
  languages: ['onboarding.stepLanguages', 'Languages'],
  speech: ['onboarding.stepSpeech', 'Speech engine'],
  try: ['onboarding.stepTry', 'Try it']
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
  const [speechReady, setSpeechReady] = useState(true)
  const [finishing, setFinishing] = useState(false)
  const { shortcut, save: saveShortcut } = useRecordShortcut()
  const contentRef = useRef<HTMLDivElement>(null)
  const [visited, setVisited] = useState(0)

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
    setVisited((v) => Math.max(v, STEPS.indexOf(next)))
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

  const uiLanguage = UI_LANGUAGES.some((l) => l.code === i18n.language) ? i18n.language : 'en'

  // A step that isn't done yet can still be skipped, and set up later in Settings
  const blocked = (step === 'permissions' && !allGranted) || (step === 'speech' && !speechReady)

  return (
    <div className="flex h-screen bg-canvas">
      {/* Step rail. Draggable; on macOS the traffic lights sit above the brand. */}
      <aside
        className={`drag-region flex w-[232px] shrink-0 flex-col px-5 pb-4 ${
          IS_MAC ? 'pt-[52px]' : 'pt-5'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <img src={appLogo} alt="" className="h-7 w-7 rounded-lg object-contain" />
          <span className="font-display text-[17px] leading-none text-ink">{t('app.name')}</span>
        </div>

        <StepRail current={stepIndex} visited={visited} onSelect={(i) => goTo(STEPS[i])} />

        <label className="no-drag relative mt-auto flex items-center">
          <span className="sr-only">{t('settings.language', 'Language')}</span>
          <Globe className="pointer-events-none absolute start-3 h-3.5 w-3.5 text-ink-soft" />
          <select
            value={uiLanguage}
            onChange={(e) => handleUiLanguage(e.target.value)}
            className="field h-8 rounded-lg ps-8 text-[12.5px]"
          >
            {UI_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeLabel}
              </option>
            ))}
          </select>
        </label>
      </aside>

      <main
        className={`sheet mb-2 me-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-sheet ${
          OS === 'win32' ? 'mt-10' : 'mt-2'
        }`}
      >
        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
          <div
            key={step}
            className="mx-auto flex min-h-full w-full max-w-[580px] flex-col justify-center px-8 py-10 animate-rise"
          >
            <StepHeading step={step} index={stepIndex} />

            <div className="mt-7">
              {step === 'welcome' && <WelcomeStep shortcut={shortcut} />}

              {step === 'permissions' &&
                (!platform || !permissions ? (
                  <div className="flex justify-center py-6 text-ink-faint">
                    <Spinner className="h-5 w-5" />
                  </div>
                ) : (
                  <div>
                    <ul className="space-y-2">
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

              {step === 'languages' && (
                <SpeechLanguagePicker value={speechLanguages} onChange={handleLanguagesChange} />
              )}

              {step === 'speech' && (
                <SpeechSetup languages={speechLanguages} onReadyChange={setSpeechReady} />
              )}

              {step === 'try' && <TryStep shortcut={shortcut} onSave={saveShortcut} />}
            </div>
          </div>
        </div>

        {/* Footer: Back / Skip / Continue */}
        <footer className="flex shrink-0 items-center gap-3 border-t border-hairline px-4 py-3">
          {stepIndex > 0 && (
            <button type="button" className="btn-ghost" onClick={back}>
              <ArrowLeft className="h-4 w-4 rtl-flip" />
              {t('common.back', 'Back')}
            </button>
          )}
          <span className="flex-1" />
          {blocked && (
            <button type="button" className="btn-ghost" onClick={next}>
              {t('onboarding.skipForNow', 'Skip for now')}
            </button>
          )}
          {step === 'try' ? (
            <button
              type="button"
              className="btn-signal btn-lg"
              onClick={finish}
              disabled={finishing}
            >
              {finishing && <Spinner className="h-3.5 w-3.5" />}
              {t('onboarding.finish', 'Finish setup')}
            </button>
          ) : (
            <button type="button" className="btn-signal btn-lg" onClick={next} disabled={blocked}>
              {step === 'welcome'
                ? t('onboarding.getStarted', 'Get started')
                : t('onboarding.continue', 'Continue')}
              <ArrowRight className="h-4 w-4 rtl-flip" />
            </button>
          )}
        </footer>
      </main>
    </div>
  )
}

// ── Progress ─────────────────────────────────────────────────────

/** Numbered step list; finished steps can be revisited */
function StepRail({
  current,
  visited,
  onSelect
}: {
  current: number
  visited: number
  onSelect: (index: number) => void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('onboarding.progress', 'Setup progress')} className="mt-9">
      <ol className="space-y-0.5">
        {STEPS.map((s, i) => {
          const [key, fallback] = STEP_LABELS[s]
          const active = i === current
          const done = i < current
          const reachable = i <= visited && !active
          return (
            <li key={s}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                disabled={!reachable}
                aria-current={active ? 'step' : undefined}
                className={`no-drag flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-start text-[13px] transition-colors duration-150 ${
                  active
                    ? 'bg-raised font-medium text-ink shadow-sm'
                    : reachable
                      ? 'text-ink-muted hover:bg-hover'
                      : 'cursor-default text-ink-faint'
                }`}
              >
                <span
                  className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] tabular ${
                    done
                      ? 'bg-signal text-on-signal'
                      : active
                        ? 'border-[1.5px] border-signal text-signal'
                        : 'border border-hairline-strong'
                  }`}
                >
                  {done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className="truncate">{t(key, fallback)}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// ── Steps ────────────────────────────────────────────────────────

/** Title + one short line for each step */
function StepHeading({ step, index }: { step: Step; index: number }): JSX.Element {
  const { t } = useTranslation()
  const heading: Record<Step, { title: ReactNode; line: string }> = {
    welcome: {
      title: (
        <Trans i18nKey="onboarding.welcomeTitle" components={{ em: <em /> }}>
          Your voice, <em>written</em> anywhere.
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
    languages: {
      title: t('onboarding.languagesTitle', 'Which languages do you speak?'),
      line: t('onboarding.languagesBody', 'Or leave it on auto-detect.')
    },
    speech: {
      title: t('onboarding.speechTitle', 'Turn speech into text'),
      line: t(
        'onboarding.speechBody',
        'Pick a speech-to-text provider and paste its API key — or run a model on this device.'
      )
    },
    try: {
      title: (
        <Trans i18nKey="onboarding.tryTitle" components={{ em: <em /> }}>
          Now just <em>talk</em>.
        </Trans>
      ),
      line: t('onboarding.tryBody', 'Click in the box, hold your key, say something and let go.')
    }
  }
  const { title, line } = heading[step]
  return (
    <header>
      {step !== 'welcome' && (
        <p className="mb-2 text-[12px] font-medium text-signal tabular">
          {t('onboarding.stepOf', 'Step {{current}} of {{total}}', {
            current: index + 1,
            total: STEPS.length
          })}
        </p>
      )}
      <h1 className="hero-title text-[30px] leading-tight text-balance">{title}</h1>
      <p className="mt-2 max-w-[500px] text-[14px] leading-snug text-ink-muted text-pretty">
        {line}
      </p>
    </header>
  )
}

function WelcomeStep({ shortcut }: { shortcut: string }): JSX.Element {
  const { t } = useTranslation()
  const features: { icon: ReactNode; title: string; body: string }[] = [
    {
      icon: <Keyboard className="h-4 w-4" />,
      title: t('onboarding.featureDictate', 'Dictate in any app'),
      body: t('onboarding.featureDictateBody', 'Email, chat, docs, code — wherever your cursor is.')
    },
    {
      icon: <TextCursorInput className="h-4 w-4" />,
      title: t('onboarding.featureEdit', 'Edit by voice'),
      body: t(
        'onboarding.featureEditBody',
        'Select text, hold the key and say “make it shorter” or “translate to Spanish”.'
      )
    },
    {
      icon: <Users className="h-4 w-4" />,
      title: t('onboarding.featureMeetings', 'Meeting notes'),
      body: t(
        'onboarding.featureMeetingsBody',
        'Live transcript and summary. No bot joins the call.'
      )
    }
  ]
  return (
    <div className="space-y-7">
      <WelcomeDemo
        shortcut={shortcut}
        text={t(
          'onboarding.welcomeSample',
          'Sounds great — let’s meet Thursday at 4 and go over the launch plan.'
        )}
      />
      <ul className="grid grid-cols-3 gap-4">
        {features.map((f) => (
          <li key={f.title}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-signal-tint text-signal">
              {f.icon}
            </span>
            <h3 className="mt-2 text-[13px] font-medium text-ink">{f.title}</h3>
            <p className="mt-0.5 text-[12px] leading-snug text-ink-soft text-pretty">{f.body}</p>
          </li>
        ))}
      </ul>
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
    <li
      className={`flex items-center gap-3.5 rounded-xl border px-3.5 py-3 transition-colors duration-200 ${
        granted ? 'border-success/25 bg-success-tint/40' : 'border-hairline bg-raised'
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          granted ? 'bg-success-tint text-success' : 'bg-sunken text-ink-muted'
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13.5px] font-medium text-ink">{title}</h3>
        <p className="text-[12px] leading-snug text-ink-soft">{description}</p>
      </div>
      {granted ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-success">
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

/** Hold the key and dictate into a practice box — a real end-to-end test */
function TryStep({
  shortcut,
  onSave
}: {
  shortcut: string
  onSave: ReturnType<typeof useRecordShortcut>['save']
}): JSX.Element {
  const { t } = useTranslation()
  const pressed = useShortcutPressed()
  const [seenPress, setSeenPress] = useState(false)
  const [text, setText] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const dictated = text.trim().length > 0

  useEffect(() => {
    if (pressed) setSeenPress(true)
  }, [pressed])

  // A new shortcut needs a fresh test
  useEffect(() => setSeenPress(false), [shortcut])

  // The dictated text is pasted where the cursor is: keep it in the box
  useEffect(() => boxRef.current?.focus(), [])

  return (
    <div className="space-y-4">
      {IS_MAC && sameShortcut(shortcut, 'Fn') && <FnKeyNotice shortcut={shortcut} />}

      <div
        className={`rounded-2xl border bg-raised transition-[border-color,box-shadow] duration-200 ${
          pressed
            ? 'border-signal ring-4 ring-signal/15'
            : dictated
              ? 'border-success/40'
              : 'border-hairline'
        }`}
      >
        <textarea
          ref={boxRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          dir="auto"
          placeholder={t('onboarding.tryPlaceholder', 'Your words will appear here…')}
          aria-label={t('onboarding.tryLabel', 'Practice box')}
          className="block w-full resize-none rounded-2xl bg-transparent px-4 pt-3.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <div className="flex items-center gap-3 px-3.5 pb-3">
          <ShortcutKeys accelerator={shortcut} size="sm" pressed={pressed} />
          <p className="min-w-0 flex-1 text-[12.5px]" aria-live="polite">
            {pressed ? (
              <span className="inline-flex items-center gap-2 font-medium text-signal">
                <span className="ember-dot" />
                {t('onboarding.shortcutHeld', 'Listening — keep holding and speak')}
              </span>
            ) : dictated ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-success">
                <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
                {t('onboarding.tryWorks', 'It works. That’s all there is to it.')}
              </span>
            ) : seenPress ? (
              <span className="text-ink-muted">
                {t('onboarding.tryWaiting', 'Let go to insert the text…')}
              </span>
            ) : (
              <span className="text-ink-soft">
                {t('onboarding.tryHint', 'Hold the key while you speak, let go to insert.')}
              </span>
            )}
          </p>
        </div>
      </div>

      {IS_MAC && !seenPress && (
        <p className="text-[12px] text-ink-soft">
          {t(
            'onboarding.shortcutAccessibilityHint',
            'Nothing happens? TapWisper needs Accessibility access to hear the key.'
          )}
        </p>
      )}

      <div>
        <button
          type="button"
          className="btn-ghost btn-sm -ms-2"
          onClick={() => setShowPicker((v) => !v)}
          aria-expanded={showPicker}
        >
          {t('onboarding.shortcutChoose', 'Choose another key')}
        </button>
        {showPicker && (
          <div className="mt-2">
            <ShortcutPicker value={shortcut} onSave={onSave} showFnNotice={false} />
          </div>
        )}
      </div>
    </div>
  )
}
