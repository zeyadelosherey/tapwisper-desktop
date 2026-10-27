import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus,
  Trash2,
  Pencil,
  Search,
  Bot,
  Terminal,
  Keyboard,
  Smartphone,
  AppWindow,
  Rocket
} from 'lucide-react'
import { Page, PageHeader, Switch } from '../components/ui/primitives'
import type { Trigger, TriggerActionType } from '../models/trigger'
import { ACTION_TYPE_META } from '../models/trigger'
import { TriggerModal } from '../components/trigger-modal'
import { useConfirmDialog } from '../components/confirm-dialog'

const ACTION_ICONS: Record<TriggerActionType, React.ReactNode> = {
  'web-search': <Search className="w-4 h-4" />,
  'ai-chat': <Bot className="w-4 h-4" />,
  terminal: <Terminal className="w-4 h-4" />,
  keyboard: <Keyboard className="w-4 h-4" />,
  'apple-shortcut': <Smartphone className="w-4 h-4" />,
  window: <AppWindow className="w-4 h-4" />,
  'launch-app': <Rocket className="w-4 h-4" />
}

/**
 * Normalize a trigger phrase for duplicate detection:
 * lowercase, punctuation/symbols stripped, whitespace collapsed.
 */
function normalizePhrase(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Find another enabled trigger that uses the same (normalized) phrase */
function findPhraseConflict(candidate: Trigger, triggers: Trigger[]): Trigger | undefined {
  const phrase = normalizePhrase(candidate.triggerPhrase)
  if (!phrase) return undefined
  return triggers.find(
    (other) =>
      other.id !== candidate.id && other.enabled && normalizePhrase(other.triggerPhrase) === phrase
  )
}

export function Triggers(): JSX.Element {
  const { t } = useTranslation()
  const { confirm, dialog } = useConfirmDialog()
  const [triggers, setTriggers] = useState<Trigger[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingTrigger, setEditingTrigger] = useState<Trigger | null>(null)

  useEffect(() => {
    window.tapwisper.store.get('triggers').then((stored: unknown) => {
      if (Array.isArray(stored)) {
        setTriggers(stored as Trigger[])
      }
    })
  }, [])

  const persistTriggers = useCallback((updated: Trigger[]) => {
    setTriggers(updated)
    window.tapwisper.store.set('triggers', updated)
  }, [])

  /** Ask the user whether to proceed when another enabled trigger has the same phrase */
  const confirmDuplicatePhrase = useCallback(
    (candidate: Trigger, conflict: Trigger, confirmLabel: string) =>
      confirm({
        title: t('triggers.duplicateTitle', 'Duplicate trigger phrase'),
        message: t(
          'triggers.duplicateMessage',
          'The enabled trigger "{{name}}" already uses the phrase "{{phrase}}". Only one of them will run when you say it.',
          { name: conflict.name, phrase: candidate.triggerPhrase }
        ),
        confirmLabel,
        destructive: false
      }),
    [confirm, t]
  )

  const toggleEnabled = useCallback(
    async (trigger: Trigger) => {
      const enabling = !trigger.enabled
      if (enabling) {
        const conflict = findPhraseConflict(trigger, triggers)
        if (
          conflict &&
          !(await confirmDuplicatePhrase(
            trigger,
            conflict,
            t('triggers.enableAnyway', 'Enable anyway')
          ))
        ) {
          return
        }
      }
      persistTriggers(
        triggers.map((tr) => (tr.id === trigger.id ? { ...tr, enabled: enabling } : tr))
      )
    },
    [triggers, persistTriggers, confirmDuplicatePhrase, t]
  )

  const deleteTrigger = useCallback(
    async (trigger: Trigger) => {
      const ok = await confirm({
        title: t('triggers.deleteTitle', 'Delete trigger?'),
        message: t(
          'triggers.deleteMessage',
          'The trigger "{{name}}" will be permanently removed.',
          { name: trigger.name }
        )
      })
      if (!ok) return
      persistTriggers(triggers.filter((tr) => tr.id !== trigger.id))
    },
    [triggers, persistTriggers, confirm, t]
  )

  const handleSave = useCallback(
    async (trigger: Trigger) => {
      if (trigger.enabled) {
        const conflict = findPhraseConflict(trigger, triggers)
        // Declining keeps the modal open so the phrase can be changed
        if (
          conflict &&
          !(await confirmDuplicatePhrase(
            trigger,
            conflict,
            t('triggers.saveAnyway', 'Save anyway')
          ))
        ) {
          return
        }
      }
      const existing = triggers.find((tr) => tr.id === trigger.id)
      if (existing) {
        persistTriggers(triggers.map((tr) => (tr.id === trigger.id ? trigger : tr)))
      } else {
        persistTriggers([...triggers, trigger])
      }
      setShowModal(false)
      setEditingTrigger(null)
    },
    [triggers, persistTriggers, confirmDuplicatePhrase, t]
  )

  const handleEdit = useCallback((trigger: Trigger) => {
    setEditingTrigger(trigger)
    setShowModal(true)
  }, [])

  const handleNewTrigger = useCallback(() => {
    setEditingTrigger(null)
    setShowModal(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    setShowModal(false)
    setEditingTrigger(null)
  }, [])

  const getActionLabel = (type: TriggerActionType): string => {
    const meta = ACTION_TYPE_META.find((m) => m.id === type)
    return meta ? t(`triggerTypes.${type}.label`, meta.label) : type
  }

  return (
    <Page>
      <PageHeader
        title={t('nav.triggers', 'Triggers')}
        description={t('triggers.subtitle', 'Say a phrase to run an action.')}
        actions={
          <button onClick={handleNewTrigger} className="btn-primary">
            <Plus className="h-4 w-4" />
            {t('triggers.newTrigger', 'New Trigger')}
          </button>
        }
      />

      {/* Triggers List */}
      {triggers.length === 0 ? (
        <div className="grain-hero flex flex-col items-center rounded-2xl px-5 pb-10 pt-12 text-center">
          <p className="font-display text-[17px] text-ink">
            {t('triggers.noTriggers', 'No triggers yet')}
          </p>
          <p className="mt-1 max-w-sm text-[13px] leading-snug text-ink-muted">
            {t(
              'triggers.noTriggersHint',
              'Run a web search, AI chat or command just by saying a phrase.'
            )}
          </p>
          <button onClick={handleNewTrigger} className="btn-primary mt-4">
            {t('triggers.createFirst', 'Create Your First Trigger')}
          </button>
        </div>
      ) : (
        <div className="divide-y divide-hairline/70 border-t border-hairline/70">
          {triggers.map((trigger) => (
            <div
              key={trigger.id}
              className={`group flex items-center gap-3 py-2 ${
                trigger.enabled ? '' : 'opacity-60'
              }`}
            >
              {/* Action type icon */}
              <span
                className="shrink-0 text-ink-soft"
                title={getActionLabel(trigger.actionType)}
                aria-hidden="true"
              >
                {ACTION_ICONS[trigger.actionType]}
              </span>

              {/* Trigger info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] text-ink">{trigger.name}</span>
                  <span className="sr-only">{getActionLabel(trigger.actionType)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-[12px] text-ink-soft">
                    {t('triggers.say', 'Say:')} &ldquo;
                    <span className="text-ink-muted" dir="auto">
                      {trigger.triggerPhrase}
                    </span>
                    &rdquo;
                  </span>
                  {trigger.triggerType === 'prefix' && (
                    <span className="text-[12px] text-ink-faint">
                      {t('triggers.plusSpeech', '+ your speech')}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleEdit(trigger)}
                  className="icon-btn opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                  title={t('common.edit', 'Edit')}
                  aria-label={t('triggers.editTrigger', 'Edit trigger {{name}}', {
                    name: trigger.name
                  })}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => deleteTrigger(trigger)}
                  className="icon-btn opacity-0 transition-opacity hover:!text-danger group-focus-within:opacity-100 group-hover:opacity-100"
                  title={t('common.delete', 'Delete')}
                  aria-label={t('triggers.deleteTrigger', 'Delete trigger {{name}}', {
                    name: trigger.name
                  })}
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                <span className="ms-1">
                  <Switch
                    checked={trigger.enabled}
                    onChange={() => toggleEnabled(trigger)}
                    label={t('triggers.toggleTrigger', 'Enable trigger {{name}}', {
                      name: trigger.name
                    })}
                  />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <TriggerModal trigger={editingTrigger} onSave={handleSave} onClose={handleCloseModal} />
      )}
      {dialog}
    </Page>
  )
}
