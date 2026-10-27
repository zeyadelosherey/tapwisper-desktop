import { useId, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

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
  return <div className={`mx-auto w-full ${max} px-6 pt-5 pb-8 ${className}`}>{children}</div>
}

interface PageHeaderProps {
  title: ReactNode
  /** One short line at most */
  description?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps): JSX.Element {
  return (
    <header className="mb-5 flex items-center justify-between gap-4 animate-rise">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {description && (
          <p className="mt-0.5 max-w-[560px] text-[12.5px] leading-snug text-ink-soft text-pretty">
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
    <section className={`mb-7 ${className}`}>
      {(title || action) && (
        <div className="mb-1 flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="section-label">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-[12px] leading-snug text-ink-soft">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/** Rows separated by faint hairlines — no box around them */
export function RowGroup({
  children,
  className = ''
}: {
  children: ReactNode
  className?: string
}): JSX.Element {
  return <div className={`divide-y divide-hairline/70 ${className}`}>{children}</div>
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
    <div className="py-2.5">
      <div className="flex min-h-8 items-center justify-between gap-4">
        <div className="min-w-0">
          {htmlFor ? (
            <label htmlFor={htmlFor} className="text-[13px] text-ink">
              {title}
            </label>
          ) : (
            <p className="text-[13px] text-ink">{title}</p>
          )}
          {description && (
            <p className="mt-0.5 text-[12px] leading-snug text-ink-soft text-pretty">
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
      className={`relative inline-flex h-[20px] w-[34px] shrink-0 items-center rounded-full border transition-colors duration-200 ease-out disabled:opacity-45 ${
        checked ? 'border-signal bg-signal' : 'border-hairline-strong bg-sunken'
      }`}
    >
      <span
        className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-[inset-inline-start] duration-200 ease-out ${
          checked ? 'start-[16px]' : 'start-[2px]'
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
            className={`inline-flex h-7 items-center gap-1.5 rounded-[8px] px-2.5 text-[12.5px] font-medium transition-[background-color,color,box-shadow] duration-200 ease-out ${
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

/** A note. Info/success are a plain faint line; only warnings and errors get a tinted box. */
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
    info: 'text-ink-soft [&_svg]:text-ink-faint',
    success: 'text-ink-soft [&_svg]:text-success',
    warning:
      'rounded-lg border px-3 py-2 bg-warning-tint border-warning/25 text-ink-muted [&_svg]:text-warning',
    danger:
      'rounded-lg border px-3 py-2 bg-danger-tint border-danger/25 text-ink [&_svg]:text-danger'
  }
  return (
    <div className={`flex items-start gap-2 text-[12px] leading-snug ${tones[tone]}`}>
      {icon && <span className="mt-px shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** Quiet "Advanced"-style disclosure for rarely changed options */
export function Disclosure({
  label,
  children,
  defaultOpen = false,
  className = ''
}: {
  label: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  className?: string
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="-ms-1 inline-flex h-7 items-center gap-1 rounded-md px-1 text-[12.5px] text-ink-soft transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-90' : 'rtl-flip'}`}
        />
        {label}
      </button>
      {open && (
        <div id={id} className="mt-1">
          {children}
        </div>
      )}
    </div>
  )
}
