import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Pencil, Search, Bot, Terminal, Keyboard, Smartphone, AppWindow, Rocket } from 'lucide-react'
import type { Trigger, TriggerActionType } from '../models/trigger'
import { ACTION_TYPE_META } from '../models/trigger'
import { TriggerModal } from '../components/trigger-modal'

const ACTION_ICONS: Record<TriggerActionType, React.ReactNode> = {
  'web-search': <Search className="w-4 h-4" />,
  'ai-chat': <Bot className="w-4 h-4" />,
  'terminal': <Terminal className="w-4 h-4" />,
  'keyboard': <Keyboard className="w-4 h-4" />,
  'apple-shortcut': <Smartphone className="w-4 h-4" />,
  'window': <AppWindow className="w-4 h-4" />,
  'launch-app': <Rocket className="w-4 h-4" />
}

const ACTION_COLORS: Record<TriggerActionType, string> = {
  'web-search': '#7EB6E0',
  'ai-chat': '#B07CD8',
  'terminal': '#4DC778',
  'keyboard': '#E8A838',
  'apple-shortcut': '#E86B6B',
  'window': '#6BB5E8',
  'launch-app': '#E8A838'
}

export function Triggers(): JSX.Element {
  const { t } = useTranslation()
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

  const toggleEnabled = useCallback((id: string) => {
    const updated = triggers.map((t) =>
      t.id === id ? { ...t, enabled: !t.enabled } : t
    )
    persistTriggers(updated)
  }, [triggers, persistTriggers])

  const deleteTrigger = useCallback((id: string) => {
    persistTriggers(triggers.filter((t) => t.id !== id))
  }, [triggers, persistTriggers])

  const handleSave = useCallback((trigger: Trigger) => {
    const existing = triggers.find((t) => t.id === trigger.id)
    if (existing) {
      persistTriggers(triggers.map((t) => t.id === trigger.id ? trigger : t))
    } else {
      persistTriggers([...triggers, trigger])
    }
    setShowModal(false)
    setEditingTrigger(null)
  }, [triggers, persistTriggers])

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
    return ACTION_TYPE_META.find((m) => m.id === type)?.label || type
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="drag-region mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-theme-text">Triggers</h1>
          <p className="text-sm text-theme-text-secondary mt-1">
            Create voice-activated triggers to perform actions when you say specific phrases
          </p>
        </div>
        <button
          onClick={handleNewTrigger}
          className="btn-primary flex items-center gap-2 shrink-0 no-drag"
        >
          <Plus className="w-4 h-4" />
          New Trigger
        </button>
      </div>

      {/* Triggers List */}
      {triggers.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-theme-surface/50 flex items-center justify-center mx-auto mb-4">
            <Search className="w-7 h-7 text-theme-text-muted" />
          </div>
          <p className="text-sm font-medium text-theme-text-muted">No triggers yet</p>
          <p className="text-xs text-theme-text-muted mt-1.5 max-w-sm mx-auto">
            Create a trigger to perform actions like web searches, AI chat, terminal commands, and more — just by speaking a phrase.
          </p>
          <button
            onClick={handleNewTrigger}
            className="mt-5 btn-primary"
          >
            Create Your First Trigger
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {triggers.map((trigger) => (
            <div
              key={trigger.id}
              className={`
                group flex items-center gap-4 p-4 rounded-xl border transition-all
                ${trigger.enabled
                  ? 'bg-theme-card border-theme-border/30 hover:border-theme-border/50'
                  : 'bg-theme-surface/30 border-theme-border/20 opacity-60'
                }
              `}
            >
              {/* Action type icon */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${ACTION_COLORS[trigger.actionType]}20` }}
              >
                <span style={{ color: ACTION_COLORS[trigger.actionType] }}>
                  {ACTION_ICONS[trigger.actionType]}
                </span>
              </div>

              {/* Trigger info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-theme-text truncate">
                    {trigger.name}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-theme-surface/60 text-theme-text-muted shrink-0">
                    {getActionLabel(trigger.actionType)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-theme-text-muted">
                    Say: &ldquo;<span className="font-medium text-theme-text-secondary">{trigger.triggerPhrase}</span>&rdquo;
                  </span>
                  {trigger.triggerType === 'prefix' && (
                    <span className="text-xs text-theme-text-muted">
                      + your speech
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleEdit(trigger)}
                  className="w-8 h-8 rounded-lg hover:bg-theme-surface/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5 text-theme-text-muted" />
                </button>
                <button
                  onClick={() => deleteTrigger(trigger.id)}
                  className="w-8 h-8 rounded-lg hover:bg-red-500/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>

                {/* Toggle switch */}
                <button
                  onClick={() => toggleEnabled(trigger.id)}
                  className={`
                    relative w-10 h-6 rounded-full transition-colors shrink-0
                    ${trigger.enabled ? 'bg-sky-accent' : 'bg-theme-surface/60'}
                  `}
                >
                  <div
                    className={`
                      absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform
                      ${trigger.enabled ? 'ltr:translate-x-5 rtl:-translate-x-5' : 'ltr:translate-x-1 rtl:-translate-x-1'}
                    `}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <TriggerModal
          trigger={editingTrigger}
          onSave={handleSave}
          onClose={handleCloseModal}
        />
      )}
    </div>
  )
}
