import { useEffect, useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  ChevronDown
} from 'lucide-react'
import { CategoryIcon, AVAILABLE_ICONS } from '../components/icon-map'
import { useConfirmDialog } from '../components/confirm-dialog'
import type { ConfirmDialogOptions } from '../components/confirm-dialog'
import type { ActionCategory, ActionItem } from '../models/actions-config'
import { BUILT_IN_CATEGORIES } from '../models/actions-config'

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-sky-accent/60'
const ICON_BUTTON = `w-8 h-8 rounded-lg flex items-center justify-center text-theme-text-tertiary transition-all disabled:opacity-30 disabled:pointer-events-none ${FOCUS_RING}`
const SMALL_ARROW_BUTTON = `w-8 h-5 rounded flex items-center justify-center text-theme-text-tertiary hover:text-theme-text transition-all disabled:opacity-30 disabled:pointer-events-none ${FOCUS_RING}`
const INPUT =
  'w-full bg-theme-surface/50 rounded-lg px-3 py-2 text-sm text-theme-text placeholder-theme-text-muted outline-none focus-visible:ring-1 focus-visible:ring-sky-accent/40'
const DEFAULT_COLOR = '#7EB6E0'

interface ActionDraft {
  id: string
  label: string
  prompt: string
}

interface CategoryDraft {
  label: string
  icon: string
  color: string
  actions: ActionDraft[]
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Return a copy of `items` with the element at `from` moved to `to` */
function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Sort a copy (never the state array itself) by the persisted `order` */
function sortByOrder(categories: ActionCategory[]): ActionCategory[] {
  return [...categories].sort((a, b) => a.order - b.order)
}

/** Order actions of a built-in category the way they are defined */
function sortByBuiltInDefinition(categoryId: string, actions: ActionItem[]): ActionItem[] {
  const definition = BUILT_IN_CATEGORIES.find((c) => c.id === categoryId)?.actions ?? []
  const index = (id: string): number => {
    const i = definition.findIndex((a) => a.id === id)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  return [...actions].sort((a, b) => index(a.id) - index(b.id))
}

/** Convert editor rows to stored actions, dropping rows left completely empty */
function draftToActions(draft: CategoryDraft, fallbackLabel: string): ActionItem[] {
  return draft.actions
    .filter((a) => a.label.trim() || a.prompt.trim())
    .map((a) => ({
      id: a.id,
      label: a.label.trim() || fallbackLabel,
      prompt: a.prompt.trim(),
      isBuiltIn: false
    }))
}

// ── Category editor (create + edit custom categories) ────────────

interface CategoryEditorProps {
  initial: ActionCategory | null
  onSave: (draft: CategoryDraft) => void
  onCancel: () => void
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>
}

function CategoryEditor({ initial, onSave, onCancel, confirm }: CategoryEditorProps): JSX.Element {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<CategoryDraft>(() =>
    initial
      ? {
          label: initial.label,
          icon: initial.icon,
          color: initial.color,
          actions: initial.actions.map((a) => ({ id: a.id, label: a.label, prompt: a.prompt }))
        }
      : {
          label: '',
          icon: 'zap',
          color: DEFAULT_COLOR,
          actions: [{ id: generateId('action'), label: '', prompt: '' }]
        }
  )
  const [submitted, setSubmitted] = useState(false)

  const savedActionIds = useMemo(() => new Set(initial?.actions.map((a) => a.id) ?? []), [initial])

  const nameMissing = !draft.label.trim()
  // An action with a label needs a prompt; a prompt alone falls back to the category name
  const actionMissingPrompt = (a: ActionDraft): boolean => !!a.label.trim() && !a.prompt.trim()
  const hasErrors = nameMissing || draft.actions.some(actionMissingPrompt)

  const updateAction = (id: string, patch: Partial<ActionDraft>): void => {
    setDraft((d) => ({
      ...d,
      actions: d.actions.map((a) => (a.id === id ? { ...a, ...patch } : a))
    }))
  }

  const addAction = (): void => {
    setDraft((d) => ({
      ...d,
      actions: [...d.actions, { id: generateId('action'), label: '', prompt: '' }]
    }))
  }

  const removeAction = async (action: ActionDraft): Promise<void> => {
    const hasContent = !!action.label.trim() || !!action.prompt.trim()
    if (savedActionIds.has(action.id) && hasContent) {
      const ok = await confirm({
        title: t('actions.removeActionTitle', 'Remove action?'),
        message: t(
          'actions.removeActionMessage',
          'The action "{{name}}" will be removed when you save this category.',
          { name: action.label || draft.label }
        ),
        confirmLabel: t('common.remove', 'Remove')
      })
      if (!ok) return
    }
    setDraft((d) => ({ ...d, actions: d.actions.filter((a) => a.id !== action.id) }))
  }

  const moveAction = (index: number, delta: number): void => {
    setDraft((d) => ({ ...d, actions: moveItem(d.actions, index, index + delta) }))
  }

  const handleSave = (): void => {
    setSubmitted(true)
    if (hasErrors) return
    onSave(draft)
  }

  return (
    <div
      className="bg-theme-card rounded-xl p-4 border border-sky-accent/30 space-y-4 my-2"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-theme-text">
          {initial
            ? t('actions.editCategory', 'Edit Category')
            : t('actions.newCategory', 'New Category')}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label={t('common.close', 'Close')}
          className={`w-7 h-7 rounded-lg flex items-center justify-center text-theme-text-tertiary hover:text-theme-text ${FOCUS_RING}`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div>
        <input
          type="text"
          autoFocus
          placeholder={t('actions.categoryName', 'Category name')}
          aria-label={t('actions.categoryName', 'Category name')}
          aria-invalid={submitted && nameMissing}
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          className={INPUT}
        />
        {submitted && nameMissing && (
          <p role="alert" className="text-xs text-recording-red mt-1">
            {t('actions.nameRequired', 'Category name is required')}
          </p>
        )}
      </div>

      <div>
        <span className="block text-xs text-theme-text-secondary mb-2">
          {t('actions.icon', 'Icon')}
        </span>
        <div
          className="flex flex-wrap gap-1.5"
          role="radiogroup"
          aria-label={t('actions.icon', 'Icon')}
        >
          {AVAILABLE_ICONS.map((iconName) => (
            <button
              key={iconName}
              type="button"
              role="radio"
              aria-checked={draft.icon === iconName}
              aria-label={iconName}
              onClick={() => setDraft({ ...draft, icon: iconName })}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${FOCUS_RING} ${
                draft.icon === iconName
                  ? 'bg-sky-accent/15 text-sky-accent ring-1 ring-sky-accent/40'
                  : 'bg-theme-surface/50 text-theme-text-secondary hover:text-theme-text hover:bg-theme-surface'
              }`}
            >
              <CategoryIcon name={iconName} className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 w-fit">
        <span className="text-xs text-theme-text-secondary">{t('actions.color', 'Color')}</span>
        <input
          type="color"
          value={draft.color}
          onChange={(e) => setDraft({ ...draft, color: e.target.value })}
          className={`w-8 h-8 rounded cursor-pointer ${FOCUS_RING}`}
        />
      </label>

      {/* Actions */}
      <div className="space-y-2">
        <span className="block text-xs text-theme-text-secondary">
          {t('actions.actionsHeading', 'Actions')}
        </span>
        {draft.actions.length === 0 && (
          <p className="text-xs text-theme-text-muted">
            {t('actions.noActions', 'No actions yet. Add one below.')}
          </p>
        )}
        {draft.actions.map((action, index) => {
          const missingPrompt = submitted && actionMissingPrompt(action)
          const name = action.label || t('actions.untitledAction', 'Untitled action')
          return (
            <div
              key={action.id}
              className="p-3 rounded-lg bg-theme-surface/30 border border-theme-border/30 space-y-2"
            >
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder={t('actions.actionLabel', 'Action label')}
                  aria-label={t('actions.actionLabel', 'Action label')}
                  value={action.label}
                  onChange={(e) => updateAction(action.id, { label: e.target.value })}
                  className={`${INPUT} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => moveAction(index, -1)}
                  disabled={index === 0}
                  aria-label={t('actions.moveActionUp', 'Move {{name}} up', { name })}
                  className={`${ICON_BUTTON} hover:text-theme-text`}
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveAction(index, 1)}
                  disabled={index === draft.actions.length - 1}
                  aria-label={t('actions.moveActionDown', 'Move {{name}} down', { name })}
                  className={`${ICON_BUTTON} hover:text-theme-text`}
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeAction(action)}
                  aria-label={t('actions.removeAction', 'Remove action {{name}}', { name })}
                  className={`${ICON_BUTTON} hover:text-recording-red`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <textarea
                placeholder={t(
                  'actions.actionPrompt',
                  'Prompt sent to the AI with the selected text'
                )}
                aria-label={t('actions.actionPromptLabel', 'Action prompt')}
                aria-invalid={missingPrompt}
                value={action.prompt}
                onChange={(e) => updateAction(action.id, { prompt: e.target.value })}
                className={`${INPUT} resize-y min-h-[4rem]`}
              />
              {missingPrompt && (
                <p role="alert" className="text-xs text-recording-red">
                  {t('actions.promptRequired', 'A prompt is required for this action')}
                </p>
              )}
            </div>
          )
        })}
        <button
          type="button"
          onClick={addAction}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-sky-accent/10 text-sky-accent hover:bg-sky-accent/20 transition-all ${FOCUS_RING}`}
        >
          <Plus className="w-3.5 h-3.5" />
          {t('actions.addAction', 'Add action')}
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitted && hasErrors}
          className={`btn-primary flex items-center gap-2 disabled:opacity-30 ${FOCUS_RING}`}
        >
          <Check className="w-4 h-4" />
          {initial ? t('common.save', 'Save') : t('actions.createCategory', 'Create Category')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`px-3 py-2 bg-theme-surface/30 rounded-lg text-sm text-theme-text-secondary ${FOCUS_RING}`}
        >
          {t('recording.cancel', 'Cancel')}
        </button>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────

export function ActionsConfig(): JSX.Element {
  const { t } = useTranslation()
  const { confirm, dialog } = useConfirmDialog()
  const [categories, setCategories] = useState<ActionCategory[]>([])
  // null = no editor open, 'new' = creating, otherwise the id of the category being edited
  const [editor, setEditor] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    window.tapwisper.store.get('actions').then((data) => {
      // Same fallback the overlays use when nothing has been stored yet
      if (Array.isArray(data) && data.length > 0) setCategories(data as ActionCategory[])
      else setCategories(BUILT_IN_CATEGORIES.map((c) => ({ ...c, actions: [...c.actions] })))
    })
  }, [])

  const saveCategories = useCallback((updated: ActionCategory[]) => {
    setCategories(updated)
    window.tapwisper.store.set('actions', updated)
  }, [])

  const sortedCategories = useMemo(() => sortByOrder(categories), [categories])

  const toggleVisibility = useCallback(
    (categoryId: string) => {
      saveCategories(
        categories.map((c) => (c.id === categoryId ? { ...c, isVisible: !c.isVisible } : c))
      )
    },
    [categories, saveCategories]
  )

  /** Move a category one step up/down and renumber `order` to match */
  const moveCategory = useCallback(
    (index: number, delta: number) => {
      const reordered = moveItem(sortedCategories, index, index + delta)
      if (reordered === sortedCategories) return
      saveCategories(reordered.map((c, i) => ({ ...c, order: i })))
    },
    [sortedCategories, saveCategories]
  )

  /** Hide or restore a single built-in action (hidden ones live in `hiddenActions`) */
  const toggleActionHidden = useCallback(
    (categoryId: string, actionId: string) => {
      saveCategories(
        categories.map((c) => {
          if (c.id !== categoryId) return c
          const hidden = c.hiddenActions ?? []
          const visibleAction = c.actions.find((a) => a.id === actionId)
          if (visibleAction) {
            return {
              ...c,
              actions: c.actions.filter((a) => a.id !== actionId),
              hiddenActions: [...hidden, visibleAction]
            }
          }
          const hiddenAction = hidden.find((a) => a.id === actionId)
          if (!hiddenAction) return c
          return {
            ...c,
            actions: sortByBuiltInDefinition(c.id, [...c.actions, hiddenAction]),
            hiddenActions: hidden.filter((a) => a.id !== actionId)
          }
        })
      )
    },
    [categories, saveCategories]
  )

  const handleCreateCategory = useCallback(
    (draft: CategoryDraft) => {
      const label = draft.label.trim()
      const id = generateId('custom')
      const maxOrder = categories.reduce((max, c) => Math.max(max, c.order), -1)
      const category: ActionCategory = {
        id,
        label,
        icon: draft.icon,
        color: draft.color,
        isBuiltIn: false,
        isVisible: true,
        order: maxOrder + 1,
        actions: draftToActions(draft, label)
      }
      saveCategories([...categories, category])
      setEditor(null)
    },
    [categories, saveCategories]
  )

  const handleUpdateCategory = useCallback(
    (categoryId: string, draft: CategoryDraft) => {
      const label = draft.label.trim()
      saveCategories(
        categories.map((c) =>
          c.id === categoryId && !c.isBuiltIn
            ? {
                ...c,
                label,
                icon: draft.icon,
                color: draft.color,
                actions: draftToActions(draft, label)
              }
            : c
        )
      )
      setEditor(null)
    },
    [categories, saveCategories]
  )

  const handleDeleteCategory = useCallback(
    async (category: ActionCategory) => {
      const ok = await confirm({
        title: t('actions.deleteCategoryTitle', 'Delete category?'),
        message: t(
          'actions.deleteCategoryMessage',
          'The category "{{name}}" and all of its actions will be permanently removed.',
          { name: category.label }
        )
      })
      if (!ok) return
      saveCategories(categories.filter((c) => c.id !== category.id))
      if (editor === category.id) setEditor(null)
    },
    [categories, saveCategories, confirm, editor, t]
  )

  const actionCountLabel = (count: number): string =>
    `${count} ${
      count !== 1 ? t('actions.actionPlural', 'actions') : t('actions.actionSingular', 'action')
    }`

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="drag-region mb-8">
        <h1 className="text-2xl font-bold text-theme-text">{t('nav.actions')}</h1>
        <p className="text-sm text-theme-text-secondary mt-1">
          {t('actions.manageCategories', 'Manage your AI action categories and toolbar')}
        </p>
      </div>

      {/* Toolbar Preview */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider mb-3">
          {t('actions.toolbarPreview')}
        </h2>
        <div className="flex gap-2 p-4 bg-theme-card rounded-xl border border-theme-border/50 overflow-x-auto">
          {sortedCategories
            .filter((c) => c.isVisible)
            .map((category) => (
              <span
                key={category.id}
                className="action-pill shrink-0 flex items-center gap-1.5"
                style={{
                  backgroundColor: `${category.color}20`,
                  color: category.color
                }}
              >
                <CategoryIcon name={category.icon} className="w-3.5 h-3.5" />
                {category.label}
              </span>
            ))}
        </div>
      </section>

      {/* Categories List */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider mb-3">
          {t('actions.categories', 'Categories')}
        </h2>
        <ul>
          {sortedCategories.map((category, index) => {
            if (editor === category.id && !category.isBuiltIn) {
              return (
                <li key={category.id}>
                  <CategoryEditor
                    initial={category}
                    onSave={(draft) => handleUpdateCategory(category.id, draft)}
                    onCancel={() => setEditor(null)}
                    confirm={confirm}
                  />
                </li>
              )
            }

            const hiddenCount = category.hiddenActions?.length ?? 0
            const isExpanded = expandedId === category.id
            const allBuiltInActions = sortByBuiltInDefinition(category.id, [
              ...category.actions,
              ...(category.hiddenActions ?? [])
            ])
            const hiddenIds = new Set((category.hiddenActions ?? []).map((a) => a.id))

            return (
              <li
                key={category.id}
                className="py-3 border-b border-theme-border/30 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col -my-1">
                    <button
                      onClick={() => moveCategory(index, -1)}
                      disabled={index === 0}
                      aria-label={t('actions.moveCategoryUp', 'Move {{name}} up', {
                        name: category.label
                      })}
                      title={t('common.moveUp', 'Move up')}
                      className={SMALL_ARROW_BUTTON}
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveCategory(index, 1)}
                      disabled={index === sortedCategories.length - 1}
                      aria-label={t('actions.moveCategoryDown', 'Move {{name}} down', {
                        name: category.label
                      })}
                      title={t('common.moveDown', 'Move down')}
                      className={SMALL_ARROW_BUTTON}
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${category.color}15`, color: category.color }}
                  >
                    <CategoryIcon name={category.icon} className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-theme-text truncate">{category.label}</p>
                    <p className="text-xs text-theme-text-tertiary">
                      {actionCountLabel(category.actions.length)}
                      {hiddenCount > 0 &&
                        ` · ${t('actions.hiddenCount', '{{count}} hidden', { count: hiddenCount })}`}
                    </p>
                  </div>
                  {category.isBuiltIn && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : category.id)}
                      aria-expanded={isExpanded}
                      aria-controls={`actions-${category.id}`}
                      aria-label={t('actions.manageActions', 'Show actions in {{name}}', {
                        name: category.label
                      })}
                      title={t('actions.manageActionsShort', 'Show actions')}
                      className={`${ICON_BUTTON} hover:text-theme-text`}
                    >
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </button>
                  )}
                  <button
                    onClick={() => toggleVisibility(category.id)}
                    aria-label={
                      category.isVisible
                        ? t('actions.hideCategory', 'Hide {{name}} from toolbar', {
                            name: category.label
                          })
                        : t('actions.showCategory', 'Show {{name}} in toolbar', {
                            name: category.label
                          })
                    }
                    className={`${ICON_BUTTON} hover:text-theme-text`}
                  >
                    {category.isVisible ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                  </button>
                  {!category.isBuiltIn && (
                    <>
                      <button
                        onClick={() => {
                          setExpandedId(null)
                          setEditor(category.id)
                        }}
                        aria-label={t('actions.editCategoryNamed', 'Edit {{name}}', {
                          name: category.label
                        })}
                        title={t('common.edit', 'Edit')}
                        className={`${ICON_BUTTON} hover:text-sky-accent`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(category)}
                        aria-label={t('actions.deleteCategoryNamed', 'Delete {{name}}', {
                          name: category.label
                        })}
                        title={t('common.delete', 'Delete')}
                        className={`${ICON_BUTTON} hover:text-recording-red`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>

                {/* Built-in actions: read-only, but each one can be hidden */}
                {category.isBuiltIn && isExpanded && (
                  <ul id={`actions-${category.id}`} className="mt-2 ms-11 space-y-1">
                    {allBuiltInActions.map((action) => {
                      const isHidden = hiddenIds.has(action.id)
                      return (
                        <li
                          key={action.id}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg bg-theme-surface/30"
                        >
                          <div className={`flex-1 min-w-0 ${isHidden ? 'opacity-50' : ''}`}>
                            <p className="text-sm text-theme-text truncate">{action.label}</p>
                            <p className="text-xs text-theme-text-muted truncate">
                              {action.prompt}
                            </p>
                          </div>
                          <button
                            onClick={() => toggleActionHidden(category.id, action.id)}
                            aria-label={
                              isHidden
                                ? t('actions.showAction', 'Show {{name}}', { name: action.label })
                                : t('actions.hideAction', 'Hide {{name}}', { name: action.label })
                            }
                            className={`${ICON_BUTTON} hover:text-theme-text`}
                          >
                            {isHidden ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {/* Add New Category */}
      {editor === 'new' ? (
        <CategoryEditor
          initial={null}
          onSave={handleCreateCategory}
          onCancel={() => setEditor(null)}
          confirm={confirm}
        />
      ) : (
        <button
          onClick={() => setEditor('new')}
          className={`flex items-center gap-2 px-4 py-3 bg-theme-card rounded-xl border border-dashed border-theme-border text-theme-text-secondary hover:text-theme-text hover:border-sky-accent/30 transition-all text-sm ${FOCUS_RING}`}
        >
          <Plus className="w-4 h-4" />
          {t('actions.addCustom')}
        </button>
      )}
      {dialog}
    </div>
  )
}
