import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info, ShieldCheck } from 'lucide-react'
import { Callout, Row, RowGroup, Section, Switch } from '../ui/primitives'
import { LanguageSelect, MEETING_TRANSLATE_KEY } from './translate-control'

type BoolKey = 'recognizeMeetings' | 'captureMeetingAudio' | 'autoSummarizeMeetings'

const DEFAULTS: Record<BoolKey, boolean> = {
  recognizeMeetings: true,
  captureMeetingAudio: true,
  autoSummarizeMeetings: true
}

/** Settings → Notetaker */
export function NotetakerSettings(): JSX.Element {
  const { t } = useTranslation()
  const [values, setValues] = useState(DEFAULTS)
  const [translateTo, setTranslateTo] = useState('')
  const os = window.tapwisper.platform.os

  useEffect(() => {
    let cancelled = false
    const keys = Object.keys(DEFAULTS) as BoolKey[]
    Promise.all([
      ...keys.map((k) => window.tapwisper.store.get(k)),
      window.tapwisper.store.get(MEETING_TRANSLATE_KEY)
    ])
      .then((stored) => {
        if (cancelled) return
        const next = { ...DEFAULTS }
        keys.forEach((k, i) => {
          if (typeof stored[i] === 'boolean') next[k] = stored[i] as boolean
        })
        setValues(next)
        const lang = stored[keys.length]
        if (typeof lang === 'string') setTranslateTo(lang)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const set = (key: BoolKey, value: boolean): void => {
    setValues((prev) => ({ ...prev, [key]: value }))
    // recognizeMeetings: the main process turns call detection on/off
    void window.tapwisper.store.set(key, value)
  }

  const permissionText =
    os === 'darwin'
      ? t(
          'settings.notetakerPermissionMac',
          'To hear the other participants, TapWisper needs Screen & System Audio Recording (System Settings → Privacy & Security). Only audio is used — nothing on your screen is recorded.'
        )
      : os === 'linux'
        ? t(
            'settings.notetakerPermissionLinux',
            'Linux can’t capture app audio directly. TapWisper uses a “Monitor of …” input (PulseAudio / PipeWire) when one is available; otherwise only your microphone is recorded.'
          )
        : t(
            'settings.notetakerPermissionWin',
            'The meeting’s audio is captured from your speakers or headset output — no extra permission is needed.'
          )

  const privacy = [
    t(
      'settings.notetakerPrivacyAudio',
      'Audio is sent to your voice provider for transcription and is not stored'
    ),
    t('settings.notetakerPrivacyLocal', 'Transcripts, notes and summaries stay on this device'),
    t('settings.notetakerPrivacyConsent', 'Always let people know when you’re taking notes')
  ]

  return (
    <>
      <Section
        title={t('settings.notetaker', 'Notetaker')}
        description={t(
          'settings.notetakerHint',
          'Meeting notes from your microphone and the call’s audio — no bot joins the meeting.'
        )}
      >
        <RowGroup>
          <Row
            title={t('settings.recognizeMeetings', 'Recognize meetings')}
            description={t(
              'settings.recognizeMeetingsHint',
              'When a Zoom, Meet, Teams or Slack call starts, offer to take notes.'
            )}
            control={
              <Switch
                checked={values.recognizeMeetings}
                onChange={(v) => set('recognizeMeetings', v)}
                label={t('settings.recognizeMeetings', 'Recognize meetings')}
              />
            }
          />
          <Row
            title={t('settings.captureMeetingAudio', 'Record meeting audio')}
            description={t(
              'settings.captureMeetingAudioHint',
              'Hear the other participants, not just you. Turn off for in-person meetings.'
            )}
            control={
              <Switch
                checked={values.captureMeetingAudio}
                onChange={(v) => set('captureMeetingAudio', v)}
                label={t('settings.captureMeetingAudio', 'Record meeting audio')}
              />
            }
          />
          <Row
            title={t('settings.autoSummarize', 'Summarize automatically')}
            description={t(
              'settings.autoSummarizeHint',
              'Write a summary with decisions and next steps when you stop.'
            )}
            control={
              <Switch
                checked={values.autoSummarizeMeetings}
                onChange={(v) => set('autoSummarizeMeetings', v)}
                label={t('settings.autoSummarize', 'Summarize automatically')}
              />
            }
          />
          <Row
            title={t('settings.meetingTranslate', 'Translate transcripts into')}
            description={t(
              'settings.meetingTranslateHint',
              'Shows a live translation under each line. Uses your AI provider.'
            )}
            htmlFor="meeting-translate"
            control={
              <LanguageSelect
                id="meeting-translate"
                value={translateTo}
                onChange={(code) => {
                  setTranslateTo(code)
                  void window.tapwisper.store.set(MEETING_TRANSLATE_KEY, code)
                }}
                label={t('settings.meetingTranslate', 'Translate transcripts into')}
                offLabel={t('notepad.translateOff', 'No translation')}
                className="h-8 w-44"
              />
            }
          />
        </RowGroup>
        <div className="mt-2">
          <Callout tone="info" icon={<Info />}>
            {permissionText}
          </Callout>
        </div>
      </Section>

      <Section title={t('settings.privacy', 'Privacy')}>
        <ul className="card divide-y divide-hairline">
          {privacy.map((item) => (
            <li
              key={item}
              className="flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] text-ink-muted"
            >
              <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
              {item}
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}
