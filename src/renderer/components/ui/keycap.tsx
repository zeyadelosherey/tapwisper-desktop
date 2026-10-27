import { useTranslation } from 'react-i18next'
import { shortcutParts, shortcutText, type KeyPart } from '../../utils/shortcuts'

export type KeycapSize = 'sm' | 'md' | 'lg'

const SIZE: Record<KeycapSize, { base: string; wide: string; glyph: string; caption: string }> = {
  sm: {
    base: 'min-w-[24px] h-[24px] px-1.5 rounded-md',
    wide: 'min-w-[48px]',
    glyph: 'text-[11px]',
    caption: 'hidden'
  },
  md: {
    base: 'min-w-[36px] h-[36px] px-2 rounded-lg',
    wide: 'min-w-[72px]',
    glyph: 'text-[13px]',
    caption: 'text-[8.5px] mt-0.5'
  },
  lg: {
    base: 'min-w-[54px] h-[54px] px-3 rounded-[11px]',
    wide: 'min-w-[120px]',
    glyph: 'text-[17px]',
    caption: 'text-[10px] mt-1'
  }
}

interface KeycapProps {
  part: KeyPart
  size?: KeycapSize
  pressed?: boolean
}

/** One physical-looking key. `pressed` sinks it and lights it up in Signal. */
export function Keycap({ part, size = 'md', pressed = false }: KeycapProps): JSX.Element {
  const { t } = useTranslation()
  const s = SIZE[size]
  const caption = part.right
    ? t('shortcut.rightCaption', 'right {{key}}', { key: part.caption ?? '' }).trim()
    : part.caption
  return (
    <kbd
      data-pressed={pressed ? 'true' : undefined}
      className={`keycap ${s.base} ${part.wide ? s.wide : ''} font-sans`}
      dir="ltr"
    >
      <span className={`${s.glyph} leading-none whitespace-nowrap`}>
        {part.right && size === 'sm'
          ? t('shortcut.right', 'Right {{key}}', { key: part.glyph })
          : part.glyph}
      </span>
      {caption && size !== 'sm' && (
        <span className={`${s.caption} leading-none font-normal opacity-60 lowercase`}>
          {caption}
        </span>
      )}
    </kbd>
  )
}

interface ShortcutKeysProps {
  accelerator: string
  size?: KeycapSize
  pressed?: boolean
  className?: string
}

/** The user's shortcut as a row of keycaps, with an accessible text label */
export function ShortcutKeys({
  accelerator,
  size = 'md',
  pressed = false,
  className = ''
}: ShortcutKeysProps): JSX.Element {
  const { t } = useTranslation()
  const parts = shortcutParts(accelerator)
  const label = shortcutText(accelerator, (key) => t('shortcut.right', 'Right {{key}}', { key }))
  const gap = size === 'lg' ? 'gap-2' : size === 'md' ? 'gap-1.5' : 'gap-1'
  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-flex items-center align-middle ${gap} ${className}`}
      dir="ltr"
    >
      {parts.map((part, i) => (
        <Keycap key={`${part.glyph}-${i}`} part={part} size={size} pressed={pressed} />
      ))}
    </span>
  )
}
