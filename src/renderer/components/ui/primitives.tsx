import type { ReactNode } from 'react'

// ── Page scaffolding ─────────────────────────────────────────────

interface PageProps {
  children: ReactNode
  /** Narrower measure for reading-heavy pages */
  width?: 'normal' | 'narrow' | 'wide'
  className?: string
}

/** Content column inside the main sheet */
export function Page({ children, width = 'normal', className = '' }: PageProps): JSX.Element {
  const max =
    width === 'narrow' ? 'max-w-[720px]' : width === 'wide' ? 'max-w-[1040px]' : 'max-w-[860px]'
  return <div className={`mx-auto w-full ${max} px-10 pt-10 pb-16 ${className}`}>{children}</div>
}

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps): JSX.Element {
  return (
    <header className="mb-8 flex items-end justify-between gap-6 animate-rise">
      <div className="min-w-0">
        {eyebrow && <p className="section-label mb-2">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && (
          <p className="mt-2 max-w-[560px] text-[14px] leading-relaxed text-ink-muted text-pretty">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

interface SectionProps {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}

/** A titled group of settings or content */
export function Section({
  title,
  description,
  action,
  children,
  className = ''
}: SectionProps): JSX.Element {
  return (
    <section className={`mb-10 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-end justify-between gap-4">
          <div className="min-w-0">
            {title && <h2 className="section-label">{title}</h2>}
            {description && (
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/** Rows separated by hairlines inside a bordered card */
export function RowGroup({
  children,
  className = ''
}: {
  children: ReactNode
  className?: string
}): JSX.Element {
  return (
    <div className={`card divide-y divide-hairline overflow-hidden ${className}`}>{children}</div>
  )
}

interface RowProps {
  title: ReactNode
  description?: ReactNode
  control?: ReactNode
  children?: ReactNode
  htmlFor?: string
}

/** One setting: label + help on the start side, control on the end side */
export function Row({ title, description, control, children, htmlFor }: RowProps): JSX.Element {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          {htmlFor ? (
            <label htmlFor={htmlFor} className="text-[14px] font-medium text-ink">
              {title}
            </label>
          ) : (
            <p className="text-[14px] font-medium text-ink">{title}</p>
          )}
          {description && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted text-pretty">
              {description}
            </p>
          )}
        </div>
        {control && <div className="shrink-0">{control}</div>}
      </div>
      {children}
    </div>
  )
}

// ── Controls ─────────────────────────────────────────────────────

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[24px] w-[42px] shrink-0 items-center rounded-full border transition-colors duration-200 ease-out disabled:opacity-45 ${
        checked ? 'border-signal bg-signal' : 'border-hairline-strong bg-sunken'
      }`}
    >
      <span
        className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-[inset-inline-start] duration-200 ease-out ${
          checked ? 'start-[20px]' : 'start-[2px]'
        }`}
      />
    </button>
  )
}

interface SegmentedProps<T extends string> {
  value: T
  options: { value: T; label: ReactNode; icon?: ReactNode }[]
  onChange: (value: T) => void
  label: string
}

/** Compact single-choice control (radio group) */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label
}: SegmentedProps<T>): JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-[11px] border border-hairline bg-sunken p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-200 ease-out ${
              active
                ? 'bg-raised text-ink shadow-[0_1px_2px_rgb(27_26_23/0.12)]'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Small inline spinner */
export function Spinner({ className = 'w-4 h-4' }: { className?: string }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`inline-block rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
    />
  )
}

/** Hairline-framed note: info (Signal), warning or danger */
export function Callout({
  tone = 'info',
  icon,
  children
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success'
  icon?: ReactNode
  children: ReactNode
}): JSX.Element {
  const tones = {
    info: 'bg-signal-tint/60 border-signal/20 text-ink-muted [&_svg]:text-signal',
    warning: 'bg-warning-tint border-warning/25 text-ink-muted [&_svg]:text-warning',
    danger: 'bg-danger-tint border-danger/25 text-ink [&_svg]:text-danger',
    success: 'bg-success-tint border-success/25 text-ink-muted [&_svg]:text-success'
  }
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[12.5px] leading-relaxed ${tones[tone]}`}
    >
      {icon && <span className="mt-px shrink-0 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
