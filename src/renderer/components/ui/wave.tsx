import { useMemo } from 'react'

interface LevelBarsProps {
  /** Input levels 0..1, oldest first */
  levels: number[]
  /** Height of the tallest bar in px */
  height?: number
  barWidth?: number
  gap?: number
  /** Dim, flat bars (mic idle / unavailable) */
  idle?: boolean
  className?: string
}

/**
 * Live audio level as rounded vertical bars in Signal, mirrored around the
 * centre so the newest sample sits in the middle.
 */
export function LevelBars({
  levels,
  height = 56,
  barWidth = 5,
  gap = 4,
  idle = false,
  className = ''
}: LevelBarsProps): JSX.Element {
  const bars = useMemo(() => {
    const n = levels.length
    // Newest sample in the centre, older ones spreading outwards
    return Array.from({ length: n }, (_, i) => {
      const fromCentre = Math.abs(i - (n - 1) / 2)
      const sample = levels[n - 1 - Math.round(fromCentre * 2)] ?? 0
      const envelope = 1 - (fromCentre / ((n - 1) / 2 + 1)) * 0.45
      return Math.max(0.08, Math.min(1, sample * envelope))
    })
  }, [levels])

  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center ${className}`}
      style={{ height, gap }}
    >
      {bars.map((v, i) => (
        <span
          key={i}
          className={`rounded-full transition-[height,background-color] duration-150 ease-out ${
            idle ? 'bg-ink-faint/40' : 'bg-signal'
          }`}
          style={{
            width: barWidth,
            height: idle ? Math.max(barWidth, height * 0.08) : Math.max(barWidth, v * height)
          }}
        />
      ))}
    </div>
  )
}

interface WaveLineProps {
  className?: string
  /** Drift slowly (disabled automatically for reduced motion) */
  animated?: boolean
  strokeWidth?: number
}

/** Decorative sound-wave line in Signal, used as a quiet accent. */
export function WaveLine({
  className = '',
  animated = true,
  strokeWidth = 1.6
}: WaveLineProps): JSX.Element {
  // Two identical periods side by side so a -50% translate loops seamlessly.
  // A gentle sine whose amplitude swells and fades like a spoken phrase.
  const path = useMemo(() => {
    const points: string[] = []
    const period = 300
    for (let x = 0; x <= period * 2; x += 2) {
      const t = (x % period) / period
      const envelope =
        Math.pow(Math.sin(Math.PI * t), 1.6) * (0.55 + 0.45 * Math.sin(Math.PI * 3 * t) ** 2)
      const y = 30 - Math.sin((x / period) * Math.PI * 2 * 7) * 22 * envelope
      points.push(`${x === 0 ? 'M' : 'L'} ${x} ${y.toFixed(2)}`)
    }
    return points.join(' ')
  }, [])

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 300 60"
      preserveAspectRatio="none"
      className={`overflow-hidden ${className}`}
    >
      <g className={animated ? 'animate-wave-drift' : ''}>
        <path
          d={path}
          fill="none"
          stroke="rgb(var(--signal))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          transform="scale(0.5 1)"
        />
      </g>
    </svg>
  )
}
