import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { GripVertical, Eye, EyeOff, Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { CategoryIcon, AVAILABLE_ICONS } from '../components/icon-map'

interface ActionCategory {
  id: string
  label: string
  icon: string
  color: string
  isBuiltIn: boolean
  isVisible: boolean
  order: number
  actions: ActionItem[]
}

interface ActionItem {
  id: string
  label: string
  prompt: string
  isBuiltIn: boolean
}

export function ActionsConfig(): JSX.Element {
  const { t } = useTranslation()
  const [categories, setCategories] = useState<ActionCategory[]>([])
  const [editingCategory, setEditingCategory] = useState<ActionCategory | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newCategory, setNewCategory] = useState({
    label: '',
    icon: 'zap',
    color: '#7EB6E0',
    prompt: ''
  })

  useEffect(() => {
    window.tapwisper.store.get('actions').then((data) => {
      if (data) setCategories(data as ActionCategory[])
    })
  }, [])

  const saveCategories = useCallback((updated: ActionCategory[]) => {
    setCategories(updated)
    window.tapwisper.store.set('actions', updated)
  }, [])

  const toggleVisibility = useCallback(
    (categoryId: string) => {
      const updated = categories.map((c) =>
        c.id === categoryId ? { ...c, isVisible: !c.isVisible } : c
      )
      saveCategories(updated)
    },
    [categories, saveCategories]
  )

  const handleAddCategory = useCallback(() => {
    if (!newCategory.label.trim()) return

    const id = `custom-${Date.now()}`
    const category: ActionCategory = {
      id,
      label: newCategory.label,
      icon: newCategory.icon,
      color: newCategory.color,
      isBuiltIn: false,
      isVisible: true,
      order: categories.length,
      actions: newCategory.prompt
        ? [
            {
              id: `${id}-default`,
              label: newCategory.label,
              prompt: newCategory.prompt,
              isBuiltIn: false
            }
          ]
        : []
    }

    saveCategories([...categories, category])
    setNewCategory({ label: '', icon: 'zap', color: '#7EB6E0', prompt: '' })
    setShowNewForm(false)
  }, [categories, newCategory, saveCategories])

  const handleDeleteCategory = useCallback(
    (categoryId: string) => {
      const updated = categories.filter((c) => c.id !== categoryId)
      saveCategories(updated)
    },
    [categories, saveCategories]
  )

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
          {categories
            .filter((c) => c.isVisible)
            .sort((a, b) => a.order - b.order)
            .map((category) => (
              <button
                key={category.id}
                className="action-pill shrink-0 flex items-center gap-1.5"
                style={{
                  backgroundColor: `${category.color}20`,
                  color: category.color
                }}
              >
                <CategoryIcon name={category.icon} className="w-3.5 h-3.5" />
                {category.label}
              </button>
            ))}
        </div>
      </section>

      {/* Categories List */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider mb-3">
          {t('actions.categories', 'Categories')}
        </h2>
        <div>
          {categories
            .sort((a, b) => a.order - b.order)
            .map((category) => (
              <div
                key={category.id}
                className="flex items-center gap-3 py-3 border-b border-theme-border/30 last:border-b-0"
              >
                <GripVertical className="w-4 h-4 text-theme-text-muted cursor-grab" />
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${category.color}15`, color: category.color }}
                >
                  <CategoryIcon name={category.icon} className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-theme-text truncate">{category.label}</p>
                  <p className="text-xs text-theme-text-tertiary">
                    {category.actions.length} {category.actions.length !== 1 ? t('actions.actionPlural', 'actions') : t('actions.actionSingular', 'action')}
                  </p>
                </div>
                <button
                  onClick={() => toggleVisibility(category.id)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-theme-text-tertiary hover:text-theme-text transition-all"
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
                      onClick={() => setEditingCategory(category)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-theme-text-tertiary hover:text-sky-accent transition-all"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(category.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-theme-text-tertiary hover:text-recording-red transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            ))}
        </div>
      </section>

      {/* Add New Category */}
      {showNewForm ? (
        <div className="bg-theme-card rounded-xl p-4 border border-sky-accent/30 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-theme-text">{t('actions.newCategory', 'New Category')}</h3>
            <button
              onClick={() => setShowNewForm(false)}
              className="text-theme-text-tertiary hover:text-theme-text"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            type="text"
            placeholder={t('actions.categoryName', 'Category name')}
            value={newCategory.label}
            onChange={(e) => setNewCategory({ ...newCategory, label: e.target.value })}
            className="w-full bg-theme-surface/50 rounded-lg px-3 py-2 text-sm text-theme-text placeholder-theme-text-muted outline-none"
          />
          <div>
            <label className="block text-xs text-theme-text-secondary mb-2">{t('actions.icon', 'Icon')}</label>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_ICONS.map((iconName) => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setNewCategory({ ...newCategory, icon: iconName })}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                    newCategory.icon === iconName
                      ? 'bg-sky-accent/15 text-sky-accent ring-1 ring-sky-accent/40'
                      : 'bg-theme-surface/50 text-theme-text-secondary hover:text-theme-text hover:bg-theme-surface'
                  }`}
                >
                  <CategoryIcon name={iconName} className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-theme-text-secondary">{t('actions.color', 'Color')}</label>
            <input
              type="color"
              value={newCategory.color}
              onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer"
            />
          </div>
          <textarea
            placeholder={t('actions.defaultPrompt', 'Default prompt (optional)')}
            value={newCategory.prompt}
            onChange={(e) => setNewCategory({ ...newCategory, prompt: e.target.value })}
            className="w-full bg-theme-surface/50 rounded-lg px-3 py-2 text-sm text-theme-text placeholder-theme-text-muted outline-none resize-none h-20"
          />
          <button
            onClick={handleAddCategory}
            disabled={!newCategory.label.trim()}
            className="btn-primary flex items-center gap-2 disabled:opacity-30"
          >
            <Check className="w-4 h-4" />
            {t('actions.createCategory', 'Create Category')}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 px-4 py-3 bg-theme-card rounded-xl border border-dashed border-theme-border text-theme-text-secondary hover:text-theme-text hover:border-sky-accent/30 transition-all text-sm"
        >
          <Plus className="w-4 h-4" />
          {t('actions.addCustom')}
        </button>
      )}
    </div>
  )
}
