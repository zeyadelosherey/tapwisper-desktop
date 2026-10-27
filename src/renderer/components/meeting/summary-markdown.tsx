import { Fragment, useMemo, type ReactNode } from 'react'
import { Check } from 'lucide-react'

/**
 * Renders the subset of Markdown meeting summaries use: headings, bullet and
 * numbered lists, `- [ ]` tasks, paragraphs and inline **bold**, *italic*,
 * `code` and [12:03] timestamps. Tasks can be ticked off in place.
 */

type Block =
  | { type: 'heading'; level: number; text: string; line: number }
  | { type: 'paragraph'; text: string; line: number }
  | { type: 'list'; ordered: boolean; items: ListItem[] }

interface ListItem {
  text: string
  depth: number
  line: number
  /** null = plain bullet */
  task: boolean | null
}

const HEADING = /^(#{1,6})\s+(.*)$/
const TASK = /^(\s*)[-*+]\s+\[([ xX])\]\s*(.*)$/
const BULLET = /^(\s*)[-*+•]\s+(.*)$/
const ORDERED = /^(\s*)\d+[.)]\s+(.*)$/

export function parseSummary(markdown: string): Block[] {
  const blocks: Block[] = []
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  let list: Extract<Block, { type: 'list' }> | null = null

  const pushItem = (ordered: boolean, item: ListItem): void => {
    if (!list || list.ordered !== ordered) {
      list = { type: 'list', ordered, items: [] }
      blocks.push(list)
    }
    list.items.push(item)
  }

  lines.forEach((raw, line) => {
    const text = raw.trimEnd()
    if (!text.trim()) {
      list = null
      return
    }
    let m: RegExpMatchArray | null
    if ((m = text.match(HEADING))) {
      list = null
      blocks.push({ type: 'heading', level: m[1].length, text: m[2].replace(/[#\s]+$/, ''), line })
    } else if ((m = text.match(TASK))) {
      pushItem(false, { text: m[3], depth: depthOf(m[1]), line, task: m[2] !== ' ' })
    } else if ((m = text.match(BULLET))) {
      pushItem(false, { text: m[2], depth: depthOf(m[1]), line, task: null })
    } else if ((m = text.match(ORDERED))) {
      pushItem(true, { text: m[2], depth: depthOf(m[1]), line, task: null })
    } else {
      list = null
      const last = blocks[blocks.length - 1]
      if (last && last.type === 'paragraph' && last.line + countLines(last.text) === line) {
        last.text += `\n${text.trim()}`
      } else {
        blocks.push({ type: 'paragraph', text: text.trim(), line })
      }
    }
  })
  return blocks
}

function depthOf(indent: string): number {
  return Math.min(3, Math.floor(indent.replace(/\t/g, '  ').length / 2))
}

function countLines(text: string): number {
  return text.split('\n').length
}

/** Flip the `[ ]` / `[x]` of the task on `line` */
export function toggleTaskLine(markdown: string, line: number): string {
  const lines = markdown.split('\n')
  const current = lines[line]
  if (current === undefined) return markdown
  lines[line] = current.replace(/\[([ xX])\]/, (_m, mark: string) => (mark === ' ' ? '[x]' : '[ ]'))
  return lines.join('\n')
}

// ── Inline ───────────────────────────────────────────────────────

const INLINE =
  /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[\d{1,2}:\d{2}(?::\d{2})?\]|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (!part) return null
    if (
      (part.startsWith('**') && part.endsWith('**')) ||
      (part.startsWith('__') && part.endsWith('__'))
    ) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="rounded bg-sunken px-1 py-px text-[0.92em]">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (/^\[\d{1,2}:\d{2}(?::\d{2})?\]$/.test(part)) {
      return (
        <span key={i} className="text-[0.9em] text-ink-soft tabular" dir="ltr">
          {part}
        </span>
      )
    }
    if (
      (part.startsWith('*') && part.endsWith('*')) ||
      (part.startsWith('_') && part.endsWith('_'))
    ) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}

// ── Component ────────────────────────────────────────────────────

interface SummaryMarkdownProps {
  text: string
  /** Called with the source line of a task the user ticked */
  onToggleTask?: (line: number) => void
  taskLabel?: (text: string, done: boolean) => string
  className?: string
}

export function SummaryMarkdown({
  text,
  onToggleTask,
  taskLabel,
  className = ''
}: SummaryMarkdownProps): JSX.Element {
  const blocks = useMemo(() => parseSummary(text), [text])

  return (
    <div className={`space-y-2 text-[13px] leading-relaxed text-ink ${className}`}>
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          const Tag = block.level <= 2 ? 'h3' : 'h4'
          return (
            <Tag
              key={i}
              dir="auto"
              className={
                block.level === 1
                  ? 'font-display pt-1 text-[16px] leading-snug text-ink'
                  : block.level === 2
                    ? 'pt-1.5 text-[13px] font-semibold text-ink first:pt-0'
                    : 'pt-1 text-[12.5px] font-semibold text-ink-muted first:pt-0'
              }
            >
              {renderInline(block.text)}
            </Tag>
          )
        }
        if (block.type === 'paragraph') {
          return (
            <p key={i} dir="auto" className="whitespace-pre-line text-ink-muted text-pretty">
              {renderInline(block.text)}
            </p>
          )
        }
        const ListTag = block.ordered ? 'ol' : 'ul'
        return (
          <ListTag key={i} className="space-y-0.5">
            {block.items.map((item, j) => (
              <li
                key={j}
                dir="auto"
                className="flex items-start gap-2"
                style={{ paddingInlineStart: `${item.depth * 16}px` }}
              >
                {item.task !== null ? (
                  <TaskBox
                    done={item.task}
                    label={taskLabel?.(item.text, item.task) ?? item.text}
                    onToggle={onToggleTask ? () => onToggleTask(item.line) : undefined}
                  />
                ) : block.ordered ? (
                  <span className="mt-px w-4 shrink-0 text-end text-[12px] text-ink-soft tabular">
                    {j + 1}.
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className={`mt-[8px] h-[5px] w-[5px] shrink-0 rounded-full ${
                      item.depth ? 'border border-ink-faint' : 'bg-ink-faint'
                    }`}
                  />
                )}
                <span
                  className={`min-w-0 flex-1 text-pretty ${
                    item.task ? 'text-ink-soft line-through decoration-ink-faint' : ''
                  }`}
                >
                  {renderInline(item.text)}
                </span>
              </li>
            ))}
          </ListTag>
        )
      })}
    </div>
  )
}

function TaskBox({
  done,
  label,
  onToggle
}: {
  done: boolean
  label: string
  onToggle?: () => void
}): JSX.Element {
  const box = (
    <span
      className={`flex h-[15px] w-[15px] items-center justify-center rounded-[4px] border transition-colors duration-200 ${
        done ? 'border-signal bg-signal text-on-signal' : 'border-hairline-strong bg-raised'
      }`}
    >
      {done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
    </span>
  )
  if (!onToggle) {
    return (
      <span className="mt-[3px] shrink-0" role="img" aria-label={label}>
        {box}
      </span>
    )
  }
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={onToggle}
      className="-m-1 mt-[-1px] shrink-0 rounded-md p-1 hover:bg-hover"
    >
      {box}
    </button>
  )
}
