import { memo, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import type { MeetingSegment } from '../../models/meeting'
import { SPEECH_LANGUAGES, languageName } from '../../constants/speech-languages'
import { translateMeetingSegments } from '../../services/translate'
import { meetingAIErrorMessage } from '../../utils/meeting'
import { Spinner } from '../ui/primitives'

/** Store key for the live meeting translation language ('' = off) */
export const MEETING_TRANSLATE_KEY = 'meetingTranslateTo'

/** The saved meeting translation language, kept in sync with changes made here */
export function useMeetingTranslateTo(): [string, (code: string) => void] {
  const [value, setValue] = useState('')
  useEffect(() => {
    let cancelled = false
    window.tapwisper.store
      .get(MEETING_TRANSLATE_KEY)
      .then((v) => {
        if (!cancelled && typeof v === 'string') setValue(v)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  const update = useCallback((code: string): void => {
    setValue(code)
    void window.tapwisper.store.set(MEETING_TRANSLATE_KEY, code)
  }, [])
  return [value, update]
}

interface LanguageSelectProps {
  value: string
  onChange: (code: string) => void
  label: string
  /** Text of the '' option */
  offLabel: string
  className?: string
  disabled?: boolean
  id?: string
}

/** Off + the speech languages, named in the UI language */
export function LanguageSelect({
  value,
  onChange,
  label,
  offLabel,
  className = '',
  disabled,
  id
}: LanguageSelectProps): JSX.Element {
  const { i18n } = useTranslation()
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      disabled={disabled}
      className={`field ${className}`}
    >
      <option value="">{offLabel}</option>
      {SPEECH_LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {languageName(lang.code, i18n.language, lang.nativeLabel)}
        </option>
      ))}
    </select>
  )
}

/**
 * Live meeting: picks the language new lines are translated into
 * (the recorder translates as it transcribes).
 */
export const LiveTranslateControl = memo(function LiveTranslateControl({
  value,
  onChange
}: {
  value: string
  onChange: (code: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <label className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
      <Languages className={`h-3.5 w-3.5 ${value ? 'text-signal' : 'text-ink-soft'}`} />
      <span className="sr-only">{t('notepad.translateTo', 'Translate into')}</span>
      <LanguageSelect
        value={value}
        onChange={onChange}
        label={t('notepad.translateTo', 'Translate into')}
        offLabel={t('notepad.translateOff', 'No translation')}
        className="!h-7 !w-auto max-w-[150px] !rounded-lg !py-0 !pe-7 !ps-2 !text-[12px]"
      />
    </label>
  )
})

/**
 * Saved meeting: choose a language and translate the whole transcript
 * (saved with the meeting, so it's there next time).
 */
export const TranslateTranscriptControl = memo(function TranslateTranscriptControl({
  meetingId,
  segments,
  value,
  onChange
}: {
  meetingId: string
  segments: MeetingSegment[]
  value: string
  onChange: (code: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setProgress(null)
    setError(null)
  }, [meetingId])

  const missing = value
    ? segments.filter((s) => s.text.trim() && s.translatedTo !== value).length
    : 0

  const translate = async (): Promise<void> => {
    if (!value) return
    setError(null)
    setProgress({ done: 0, total: missing })
    try {
      await translateMeetingSegments(meetingId, value, (done, total) =>
        setProgress({ done, total })
      )
    } catch (err) {
      setError(meetingAIErrorMessage(t, err))
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Languages className={`h-3.5 w-3.5 shrink-0 ${value ? 'text-signal' : 'text-ink-soft'}`} />
      <LanguageSelect
        value={value}
        onChange={(code) => {
          setError(null)
          onChange(code)
        }}
        label={t('notepad.translateTo', 'Translate into')}
        offLabel={t('notepad.translateOff', 'No translation')}
        disabled={!!progress}
        className="!h-7 !w-auto max-w-[150px] !rounded-lg !py-0 !pe-7 !ps-2 !text-[12px]"
      />
      {progress ? (
        <span
          role="status"
          className="flex items-center gap-1.5 text-[11.5px] text-ink-muted tabular"
        >
          <Spinner className="h-3 w-3 text-signal" />
          {t('notepad.translatingProgress', 'Translating {{done}}/{{total}}…', progress)}
        </span>
      ) : (
        value &&
        missing > 0 && (
          <button type="button" className="btn-secondary btn-sm h-7" onClick={translate}>
            {t('notepad.translateTranscript', 'Translate transcript')}
          </button>
        )
      )}
      {error && (
        <span role="alert" className="basis-full text-[11.5px] text-danger">
          {error}
        </span>
      )}
    </div>
  )
})
