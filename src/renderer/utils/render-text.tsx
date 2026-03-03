import { type JSX } from 'react'
import { Code } from 'lucide-react'

/**
 * Renders text with fenced code blocks (```language\ncode\n```) styled as
 * syntax-highlighted panels with a copy button.
 */
export function renderTextWithCodeBlocks(text: string): JSX.Element {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
  const parts: JSX.Element[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`} className="whitespace-pre-wrap">
          {text.slice(lastIndex, match.index)}
        </span>
      )
    }

    const language = match[1] || 'code'
    const code = match[2]
    parts.push(
      <div key={`code-${match.index}`} className="my-3 rounded-lg overflow-hidden border border-theme-border/30">
        <div className="flex items-center justify-between px-3 py-1.5 bg-theme-surface/50 border-b border-theme-border/20">
          <div className="flex items-center gap-2">
            <Code className="w-3 h-3 text-theme-text-muted" />
            <span className="text-[10px] text-theme-text-muted uppercase font-medium">{language}</span>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(code)}
            className="text-[10px] text-theme-text-muted hover:text-theme-text transition-colors"
          >
            Copy
          </button>
        </div>
        <pre className="p-3 bg-theme-surface/30 overflow-x-auto">
          <code className="text-xs text-theme-text font-mono">{code}</code>
        </pre>
      </div>
    )

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(
      <span key={`text-${lastIndex}`} className="whitespace-pre-wrap">
        {text.slice(lastIndex)}
      </span>
    )
  }

  return <>{parts}</>
}
