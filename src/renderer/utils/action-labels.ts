import type { TFunction } from 'i18next'
import { BUILT_IN_CATEGORIES } from '../models/actions-config'

/**
 * Display helpers for action/category names.
 *
 * Stored action data (labels, prompts) stays English so prompts and history
 * are stable. Built-in names are translated at render time by id, but only
 * while the stored label still matches the built-in default — a name the user
 * typed is always shown as-is.
 */

const MINI_APPS_CATEGORY_ID = 'mini-apps'
const MINI_APPS_DEFAULT_LABEL = 'Mini Apps'

const DEFAULT_CATEGORY_LABELS = new Map(BUILT_IN_CATEGORIES.map((c) => [c.id, c.label]))

const DEFAULT_ACTION_LABELS = new Map(
  BUILT_IN_CATEGORIES.flatMap((c) => c.actions.map((a) => [a.id, a.label] as const))
)

/** Built-in action label (English) → action id, for names stored in history */
const ACTION_ID_BY_LABEL = new Map(
  BUILT_IN_CATEGORIES.flatMap((c) => c.actions.map((a) => [a.label, a.id] as const))
)

/** Fixed English action names the app itself stores (activity history, overlays) */
const SYSTEM_ACTION_KEYS: Record<string, string> = {
  'Voice Command': 'actionNames.voiceCommand',
  'voice-command': 'actionNames.voiceCommand',
  'Ask Question': 'actions.askQuestion',
  'ask-question': 'actions.askQuestion',
  'AI Chat': 'triggerTypes.ai-chat.label',
  Terminal: 'triggerTypes.terminal.label',
  general: 'actionNames.general'
}

interface LabeledCategory {
  id: string
  label: string
  isBuiltIn?: boolean
}

interface LabeledAction {
  id: string
  label: string
  isBuiltIn?: boolean
}

export function categoryLabel(t: TFunction, category: LabeledCategory): string {
  if (category.id === MINI_APPS_CATEGORY_ID && category.label === MINI_APPS_DEFAULT_LABEL) {
    return t('nav.miniApps', category.label)
  }
  if (category.isBuiltIn && DEFAULT_CATEGORY_LABELS.get(category.id) === category.label) {
    return t(`actions.${category.id}`, category.label)
  }
  return category.label
}

export function actionLabel(t: TFunction, action: LabeledAction): string {
  if (action.isBuiltIn && DEFAULT_ACTION_LABELS.get(action.id) === action.label) {
    return t(`actionLabels.${action.id}`, action.label)
  }
  return action.label
}

/**
 * Translate an action name stored as plain text (activity history, result
 * badges): a built-in action id or label, or one of the app's fixed names.
 * Anything else (custom actions, mini-apps) is returned unchanged.
 */
export function displayActionName(t: TFunction, name: string): string {
  if (!name) return name
  const systemKey = SYSTEM_ACTION_KEYS[name]
  if (systemKey) return t(systemKey, name)
  const defaultLabel = DEFAULT_ACTION_LABELS.get(name)
  if (defaultLabel) return t(`actionLabels.${name}`, defaultLabel)
  const id = ACTION_ID_BY_LABEL.get(name)
  if (id) return t(`actionLabels.${id}`, name)
  return name
}
