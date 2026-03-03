import { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, RotateCcw } from 'lucide-react'
import type { ShortcutsConfig } from './types'
import { DEFAULT_SHORTCUTS } from './types'
import { ShortcutRecorder } from './shortcut-recorder'
import { isMac } from './shortcut-utils'

const FN_COMBO_KEYS = [
  { key: 'Space', label: 'Space' },
  { key: 'S', label: 'S' },
  { key: 'R', label: 'R' },
  { key: 'D', label: 'D' },
  { key: 'F', label: 'F' },
  { key: 'J', label: 'J' },
  { key: 'K', label: 'K' }
]

interface ShortcutsTabProps {
  shortcuts: ShortcutsConfig
  onShortcutChange: (key: keyof ShortcutsConfig, value: string) => void
  onResetShortcuts: () => void
}

export function ShortcutsTab({ shortcuts, onShortcutChange, onResetShortcuts }: ShortcutsTabProps): JSX.Element {
  const { t } = useTranslation()
  const isFnBased = shortcuts.record.toUpperCase().startsWith('FN+')

  return (
    <>
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-theme-text-secondary" />
            <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider">
              {t('settings.keyboardShortcuts')}
            </h2>
          </div>
          <button
            onClick={onResetShortcuts}
            className="flex items-center gap-1.5 text-xs text-theme-text-tertiary hover:text-theme-text-secondary transition-colors"
            title={t('settings.reset')}
          >
            <RotateCcw className="w-3 h-3" />
            {t('settings.reset')}
          </button>
        </div>
        <div className="space-y-4">
          <ShortcutRecorder
            label={t('settings.shortcutRecord')}
            description={t('settings.shortcutRecordDesc')}
            value={shortcuts.record}
            onChange={(v) => onShortcutChange('record', v)}
            pressKeysText={t('settings.pressKeys')}
            disabled={isFnBased}
          />
        </div>

        {/* Fn (Globe) key combos — macOS only */}
        {isMac && (
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">🌐</span>
              <p className="text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider">
                {t('settings.fnKey', 'Fn (Globe) Key')}
              </p>
            </div>
            <p className="text-xs text-theme-text-tertiary mb-3">
              {t(
                'settings.fnKeyDesc',
                'Use the Globe/Fn key combined with another key to start and stop recording'
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {FN_COMBO_KEYS.map((combo) => {
                const comboValue = `Fn+${combo.key}`
                const isActive = shortcuts.record.toUpperCase() === comboValue.toUpperCase()
                return (
                  <button
                    key={combo.key}
                    onClick={() => {
                      if (isActive) {
                        onShortcutChange('record', DEFAULT_SHORTCUTS.record)
                      } else {
                        onShortcutChange('record', comboValue)
                      }
                    }}
                    className={`
                      px-3 py-2 rounded-lg text-sm font-mono transition-all border
                      ${
                        isActive
                          ? 'bg-sky-accent/15 border-sky-accent/50 text-sky-accent'
                          : 'bg-theme-card border-theme-border/50 text-theme-text-secondary hover:border-theme-border hover:text-theme-text'
                      }
                    `}
                  >
                    🌐 + {combo.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </>
  )
}
