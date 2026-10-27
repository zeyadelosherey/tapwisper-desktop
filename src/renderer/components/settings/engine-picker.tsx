import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Cloud, Cpu, Server } from 'lucide-react'
import type { AIEngine, RuntimeCheck } from '../../../shared/local-ai/types'

/** Why the local engine can't be picked, in words */
export function runtimeIssueText(t: TFunction, check: RuntimeCheck): string {
  switch (check.issue) {
    case 'unsupported-platform':
      return t(
        'settings.engines.issueUnsupported',
        'Not available on this computer yet. Use Cloud or Self-hosted.'
      )
    case 'not-bundled':
      return t(
        'settings.engines.issueNotBundled',
        'Not included in this build. Run “npm run build:runtimes” or install a release build.'
      )
    case 'missing-library':
      return t(
        'settings.engines.issueMissingLibrary',
        'A system library is missing. Reinstall TapWisper.'
      )
    case 'crashed':
      return t('settings.engines.issueCrashed', 'The local engine crashed on this processor.')
    case 'blocked':
    default:
      return t(
        'settings.engines.issueBlocked',
        'Blocked by your security software. Allow TapWisper and try again.'
      )
  }
}

/** Cloud / Local / Self-hosted cards for one feature */
export function EnginePicker({
  value,
  onChange,
  localCheck
}: {
  value: AIEngine
  onChange: (engine: AIEngine) => void
  /** undefined while the device is being checked */
  localCheck?: RuntimeCheck
}): JSX.Element {
  const { t } = useTranslation()
  const localUnavailable = localCheck?.available === false
  const engines: { id: AIEngine; icon: JSX.Element; title: string; description: string }[] = [
    {
      id: 'cloud',
      icon: <Cloud />,
      title: t('settings.engines.cloud', 'Cloud providers'),
      description: t('settings.engines.cloudDesc', 'Bring your own API key.')
    },
    {
      id: 'local',
      icon: <Cpu />,
      title: t('settings.engines.local', 'Local'),
      description:
        localCheck && localUnavailable
          ? runtimeIssueText(t, localCheck)
          : t('settings.engines.localDesc', 'Open-source models on this device. Fully private.')
    },
    {
      id: 'self-hosted',
      icon: <Server />,
      title: t('settings.engines.selfHosted', 'Self-hosted'),
      description: t('settings.engines.selfHostedDesc', 'Your own server on your network.')
    }
  ]

  return (
    <div
      role="radiogroup"
      aria-label={t('settings.engines.label', 'Engine')}
      className="divide-y divide-hairline/70 overflow-hidden rounded-xl border border-hairline"
    >
      {engines.map((engine) => {
        const selected = value === engine.id
        // Switching away from an unusable engine is always allowed
        const disabled = engine.id === 'local' && localUnavailable && !selected
        return (
          <button
            key={engine.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(engine.id)}
            className={`flex w-full items-center gap-3 px-3.5 py-3 text-start transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/40 disabled:cursor-not-allowed disabled:opacity-60 ${
              selected ? 'bg-signal-tint/40' : 'bg-raised hover:bg-panel'
            }`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-canvas text-ink-muted [&>svg]:h-4 [&>svg]:w-4">
              {engine.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[13px] text-ink">
                {engine.title}
                {selected && (
                  <span className="rounded-md bg-signal-tint px-1.5 py-px text-[11px] text-signal">
                    {t('settings.engines.active', 'Active')}
                  </span>
                )}
              </span>
              <span className="block text-[12px] leading-snug text-ink-soft">
                {engine.description}
              </span>
            </span>
            <span
              aria-hidden
              className={`h-4 w-4 shrink-0 rounded-full border ${
                selected ? 'border-[5px] border-signal' : 'border-hairline-strong'
              }`}
            />
          </button>
        )
      })}
    </div>
  )
}
