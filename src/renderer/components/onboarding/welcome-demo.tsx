import { useEffect, useState } from 'react'
import { ShortcutKeys } from '../ui/keycap'

/** Per character while "speaking", then a pause before it starts over */
const TYPE_MS = 38
const HOLD_MS = 2600
const REST_MS = 900

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * The welcome illustration: the dictation key held down, the recording
 * capsule, and the words appearing in a text field — on a loop.
 */
export function WelcomeDemo({ shortcut, text }: { shortcut: string; text: string }): JSX.Element {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? text.length : 0))
  const typing = shown < text.length

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(text.length)
      return
    }
    let count = 0
    let timer: ReturnType<typeof setTimeout>
    const step = (): void => {
      if (count < text.length) {
        count += 1
        setShown(count)
        timer = setTimeout(step, TYPE_MS)
      } else {
        timer = setTimeout(() => {
          count = 0
          setShown(0)
          timer = setTimeout(step, REST_MS)
        }, HOLD_MS)
      }
    }
    timer = setTimeout(step, REST_MS)
    return () => clearTimeout(timer)
  }, [text])

  return (
    <div aria-hidden="true" className="relative">
      {/* The recording capsule, as it appears at the top of the screen */}
      <div className="mb-3 flex justify-center">
        <div
          className={`flex h-9 items-center gap-2 rounded-full bg-capsule px-3.5 pill-shadow transition-opacity duration-300 ${
            typing ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-ember" />
          {[0.45, 0.8, 0.6, 1, 0.7, 0.9, 0.5].map((h, i) => (
            <span
              key={i}
              className="w-[3px] rounded-full bg-capsule-signal animate-pulse"
              style={{ height: `${Math.round(h * 18)}px`, animationDelay: `${i * 90}ms` }}
            />
          ))}
        </div>
      </div>

      {/* A text field in "any app" */}
      <div className="overflow-hidden rounded-2xl border border-hairline bg-raised shadow-pop">
        <div className="flex items-center gap-1.5 border-b border-hairline/70 px-3.5 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-hairline-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-hairline-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-hairline-strong" />
        </div>
        <p className="min-h-[88px] px-4 py-3.5 text-[15px] leading-relaxed text-ink" dir="auto">
          {text.slice(0, shown)}
          <span className="ms-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse bg-signal" />
        </p>
      </div>

      <div className="mt-4 flex justify-center">
        <ShortcutKeys accelerator={shortcut} size="lg" pressed={typing} />
      </div>
    </div>
  )
}
