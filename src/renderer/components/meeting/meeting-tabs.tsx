import { useRef, type KeyboardEvent, type ReactNode } from 'react'

export type MeetingTab = 'notes' | 'transcript' | 'summary'

interface MeetingTabsProps {
  tabs: { id: MeetingTab; label: string; icon?: ReactNode; badge?: ReactNode }[]
  value: MeetingTab
  onChange: (tab: MeetingTab) => void
  label: string
  /** id prefix tying each tab to its panel (`${idBase}-panel-${tab}`) */
  idBase: string
  className?: string
}

/** Underlined tab bar (arrow keys move between tabs) */
export function MeetingTabs({
  tabs,
  value,
  onChange,
  label,
  idBase,
  className = ''
}: MeetingTabsProps): JSX.Element {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const index = tabs.findIndex((tab) => tab.id === value)
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    let next = -1
    if (e.key === 'ArrowRight') next = rtl ? index - 1 : index + 1
    else if (e.key === 'ArrowLeft') next = rtl ? index + 1 : index - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    else return
    e.preventDefault()
    next = (next + tabs.length) % tabs.length
    onChange(tabs[next].id)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`flex gap-0.5 border-b border-hairline ${className}`}
    >
      {tabs.map((tab, i) => {
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`${idBase}-panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`relative -mb-px flex items-center gap-1.5 border-b-2 px-2.5 pb-2 pt-1 text-[12.5px] font-medium transition-colors duration-200 ${
              active ? 'border-signal text-ink' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {tab.icon && (
              <span
                className={`[&_svg]:h-3.5 [&_svg]:w-3.5 ${active ? 'text-signal' : 'text-ink-soft'}`}
              >
                {tab.icon}
              </span>
            )}
            {tab.label}
            {tab.badge}
          </button>
        )
      })}
    </div>
  )
}
