import { type JSX, type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Section } from '../ui/primitives'
import { EnginePicker } from './engine-picker'
import { LocalModelPanel } from './local-model-panel'
import { SelfHostedPanel } from './self-hosted-panel'
import { useLocalAi } from '../../hooks/use-local-ai'
import type { AIEngine, LocalModelKind } from '../../../shared/local-ai/types'
import { localEngineCheck } from '../../../shared/local-ai/catalog'

type LocalModels = Record<LocalModelKind, string | null>

const ENGINE_KEY: Record<LocalModelKind, 'speechEngine' | 'llmEngine'> = {
  stt: 'speechEngine',
  llm: 'llmEngine'
}

/** Engine choice for speech-to-text or the language model, and that engine's settings */
export function EngineSettings({
  kind,
  cloud,
  languages,
  selfHostedKey,
  onSelfHostedKeyChange
}: {
  kind: LocalModelKind
  /** The cloud provider settings (provider, API key, model) */
  cloud: ReactNode
  languages: string[]
  selfHostedKey: string
  onSelfHostedKeyChange: (value: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  const local = useLocalAi()
  const [engine, setEngine] = useState<AIEngine>('cloud')
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      window.tapwisper.store.get(ENGINE_KEY[kind]),
      window.tapwisper.store.get('localModels')
    ])
      .then(([value, models]) => {
        if (value === 'local' || value === 'self-hosted') setEngine(value)
        setActiveId((models as Partial<LocalModels> | undefined)?.[kind] ?? null)
      })
      .catch(() => {})
  }, [kind])

  const changeEngine = (next: AIEngine): void => {
    setEngine(next)
    void window.tapwisper.store.set(ENGINE_KEY[kind], next)
    if (next === 'local' && activeId) void window.tapwisper.localAi.warmUp(kind)
  }

  const activate = async (id: string | null): Promise<void> => {
    setActiveId(id)
    // Re-read so the other feature's choice (another tab) isn't overwritten
    const current = ((await window.tapwisper.store.get('localModels')) ?? {}) as LocalModels
    await window.tapwisper.store.set('localModels', { ...current, [kind]: id })
    if (id && engine === 'local') void window.tapwisper.localAi.warmUp(kind)
  }

  return (
    <>
      <Section title={t('settings.engines.title', 'Engine')}>
        <EnginePicker
          value={engine}
          onChange={changeEngine}
          localCheck={local.profile ? localEngineCheck(kind, local.profile) : undefined}
        />
      </Section>
      {engine === 'cloud' && cloud}
      {engine === 'local' && (
        <LocalModelPanel
          kind={kind}
          local={local}
          activeId={activeId}
          onActivate={(id) => void activate(id)}
          languages={languages}
        />
      )}
      {engine === 'self-hosted' && (
        <SelfHostedPanel
          kind={kind}
          apiKey={selfHostedKey}
          onApiKeyChange={onSelfHostedKeyChange}
        />
      )}
    </>
  )
}
