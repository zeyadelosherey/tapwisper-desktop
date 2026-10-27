import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { AlertTriangle, Mic, MicOff, Square } from 'lucide-react'
import { useMicLevel, useMicrophones, type MicrophoneDevice } from '../hooks/use-microphone'
import { LevelBars } from './ui/wave'
import { Callout } from './ui/primitives'

interface MicrophonePickerProps {
  /** Selected device id; '' = system default */
  deviceId: string
  onChange: (deviceId: string) => void
  /**
   * large: device picker with a big live meter (onboarding).
   * compact: device picker with an on-demand mini meter (settings).
   */
  variant?: 'large' | 'compact'
  /** large only: open the mic for the live meter */
  active?: boolean
}

const hasMediaDevices = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

/** Device picker + live level meter. Degrades to a notice where audio input isn't available. */
export function MicrophonePicker(props: MicrophonePickerProps): JSX.Element {
  const { t } = useTranslation()
  if (!hasMediaDevices()) {
    return (
      <Callout tone="warning" icon={<MicOff />}>
        {t('mic.unavailable', 'Audio input is not available here.')}
      </Callout>
    )
  }
  return <MicrophonePickerInner {...props} />
}

export function micErrorMessage(t: TFunction, error: string): string {
  switch (error) {
    case 'permission-denied':
      return t('errors.micDenied', 'Microphone access denied. Please allow microphone access.')
    case 'not-found':
      return t('errors.micNotFound', 'No microphone found. Please connect a microphone.')
    case 'in-use':
      return t('errors.micInUse', 'The microphone is in use by another application.')
    default:
      return t('mic.unknownError', "Couldn't open the microphone.")
  }
}

function deviceLabel(t: TFunction, device: MicrophoneDevice, index: number): string {
  if (device.label && device.label !== 'Microphone') return device.label
  return device.deviceId === ''
    ? t('mic.systemDefault', 'System default')
    : t('mic.unnamed', 'Microphone {{number}}', { number: index + 1 })
}

function MicrophonePickerInner({
  deviceId,
  onChange,
  variant = 'large',
  active = true
}: MicrophonePickerProps): JSX.Element {
  const { t } = useTranslation()
  const selectId = useId()
  const { devices } = useMicrophones()
  const [testing, setTesting] = useState(false)
  const listening = variant === 'large' ? active : testing
  const { levels, level, error } = useMicLevel(deviceId, listening, variant === 'large' ? 21 : 9)

  const options = devices.some((d) => d.deviceId === '')
    ? devices
    : [{ deviceId: '', label: '', isBluetooth: false }, ...devices]
  const selected = options.find((d) => d.deviceId === deviceId)
  const missing = deviceId !== '' && devices.length > 0 && !selected

  const select = (
    <select
      id={selectId}
      value={missing ? '' : deviceId}
      onChange={(e) => onChange(e.target.value)}
      className="field"
    >
      {options.map((d, i) => (
        <option key={d.deviceId || 'default'} value={d.deviceId}>
          {deviceLabel(t, d, i)}
        </option>
      ))}
    </select>
  )

  const bluetoothWarning = selected?.isBluetooth && (
    <Callout tone="warning" icon={<AlertTriangle />}>
      {t(
        'mic.bluetoothWarning',
        'Bluetooth headsets switch to low-quality call audio while the mic is on, which hurts accuracy. Prefer your built-in or a wired microphone.'
      )}
    </Callout>
  )

  if (variant === 'compact') {
    return (
      <div className="space-y-3">
        <label htmlFor={selectId} className="sr-only">
          {t('mic.device', 'Microphone')}
        </label>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">{select}</div>
          <div className="flex h-10 w-[92px] shrink-0 items-center justify-center rounded-[10px] border border-hairline bg-panel">
            <LevelBars
              levels={levels}
              height={20}
              barWidth={3}
              gap={3}
              idle={!testing || !!error}
            />
          </div>
          <button
            type="button"
            className="btn-secondary shrink-0"
            onClick={() => setTesting((v) => !v)}
            aria-pressed={testing}
          >
            {testing ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            {testing ? t('mic.stopTest', 'Stop') : t('mic.test', 'Test')}
          </button>
        </div>
        {testing && error && (
          <p role="alert" className="text-[12.5px] text-danger">
            {micErrorMessage(t, error)}
          </p>
        )}
        {bluetoothWarning}
      </div>
    )
  }

  const speaking = level > 0.35
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={selectId} className="mb-1.5 block text-[13px] font-medium text-ink">
          {t('mic.device', 'Microphone')}
        </label>
        {select}
      </div>
      {bluetoothWarning}
      <div className="flex flex-col items-center justify-center rounded-xl border border-hairline bg-panel px-6 py-7">
        <LevelBars levels={levels} height={72} barWidth={6} gap={5} idle={!!error || !active} />
        <p className="mt-4 flex items-center gap-2 text-[12.5px] text-ink-muted" aria-live="polite">
          {error ? (
            <span role="alert" className="text-danger">
              {micErrorMessage(t, error)}
            </span>
          ) : (
            <>
              <span className={`ember-dot ${speaking ? '' : 'opacity-50'}`} />
              {speaking
                ? t('mic.hearingYou', 'Hearing you')
                : t('mic.listening', 'Listening… say something')}
            </>
          )}
        </p>
      </div>
    </div>
  )
}
