import { useRef, useEffect, useCallback } from 'react'

interface WaveformBarsProps {
  data: number[] // 0-1 amplitude values
  barCount?: number
  barWidth?: number
  maxHeight?: number
  color?: string
  animated?: boolean
  settled?: boolean // calm, low-energy idle state
  className?: string
}

// Spring physics constants (outside component to avoid re-creation)
const SPRING_STIFFNESS = 280 // how snappy
const SPRING_DAMPING = 22 // how quickly oscillation dies
const SPRING_MASS = 1
const MIN_HEIGHT = 4
const REST_DISPLACEMENT = 0.1
const REST_VELOCITY = 0.5
/** Bars update at ~20fps — smooth for a level meter, a third of the frames of 60fps */
const FRAME_INTERVAL_MS = 50

export function WaveformBars({
  data,
  barCount = 7,
  barWidth = 3,
  maxHeight = 24,
  color = 'rgb(var(--signal))',
  animated: _animated = true,
  settled = false,
  className = ''
}: WaveformBarsProps): JSX.Element {
  const currentRef = useRef<number[]>(Array(barCount).fill(MIN_HEIGHT))
  const targetRef = useRef<number[]>(Array(barCount).fill(MIN_HEIGHT))
  const velocityRef = useRef<number[]>(Array(barCount).fill(0))
  const rafRef = useRef<number | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)
  const barRefsArr = useRef<(HTMLDivElement | null)[]>([])
  const isAnimatingRef = useRef(false)

  // Ensure bar refs array matches barCount
  if (barRefsArr.current.length !== barCount) {
    barRefsArr.current = Array(barCount).fill(null)
  }

  // Spring animation loop — uses direct DOM manipulation instead of setState
  const animate = useCallback(
    (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time - FRAME_INTERVAL_MS
      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.05)
      lastTimeRef.current = time

      let needsUpdate = false

      for (let i = 0; i < barCount; i++) {
        const target = targetRef.current[i] ?? MIN_HEIGHT
        const current = currentRef.current[i] ?? MIN_HEIGHT
        const velocity = velocityRef.current[i] ?? 0

        const displacement = current - target
        const springForce = -SPRING_STIFFNESS * displacement
        const dampingForce = -SPRING_DAMPING * velocity
        const acceleration = (springForce + dampingForce) / SPRING_MASS

        const newVelocity = velocity + acceleration * dt
        const newPosition = current + newVelocity * dt

        velocityRef.current[i] = newVelocity
        currentRef.current[i] = newPosition

        const clampedHeight = Math.max(MIN_HEIGHT, Math.min(maxHeight, newPosition))

        // Direct DOM update — avoids React re-render entirely. scaleY is
        // compositor-only: no layout, and no repaint of the surrounding
        // (shadowed) capsule on every frame like a height change would cause
        const barEl = barRefsArr.current[i]
        if (barEl) {
          barEl.style.transform = `scaleY(${(clampedHeight / maxHeight).toFixed(3)})`
        }

        // Check if still animating (not at rest)
        if (Math.abs(displacement) > REST_DISPLACEMENT || Math.abs(newVelocity) > REST_VELOCITY) {
          needsUpdate = true
        }
      }

      // Only continue while bars are still moving toward targets (stops
      // entirely at rest). Wait with a timer and request a single frame when
      // the next update is due — re-requesting rAF every vsync to skip
      // frames would still make the window produce a frame each vsync.
      if (needsUpdate) {
        timeoutRef.current = window.setTimeout(() => {
          timeoutRef.current = null
          rafRef.current = requestAnimationFrame(animate)
        }, FRAME_INTERVAL_MS)
      } else {
        isAnimatingRef.current = false
        rafRef.current = null
      }
    },
    [barCount, maxHeight]
  )

  // Helper to kick off animation if not already running
  const ensureAnimating = useCallback(() => {
    if (!isAnimatingRef.current) {
      isAnimatingRef.current = true
      lastTimeRef.current = 0
      rafRef.current = requestAnimationFrame(animate)
    }
  }, [animate])

  // Update targets when data changes — restarts animation loop if needed
  useEffect(() => {
    if (settled) {
      // Settled state: gentle, stable bars
      const center = Math.floor(barCount / 2)
      targetRef.current = Array.from({ length: barCount }, (_, i) => {
        const dist = Math.abs(i - center) / center
        return MIN_HEIGHT + (1 - dist) * (maxHeight * 0.3 - MIN_HEIGHT)
      })
    } else {
      targetRef.current = Array.from({ length: barCount }, (_, i) => {
        const amplitude = data[i] ?? 0
        return MIN_HEIGHT + amplitude * (maxHeight - MIN_HEIGHT)
      })
    }
    // Kick off animation whenever targets change
    ensureAnimating()
  }, [data, barCount, maxHeight, settled, ensureAnimating])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      isAnimatingRef.current = false
    }
  }, [])

  return (
    <div
      className={`flex items-center gap-[2.5px] ${className}`}
      // Own compositing layer + containment: bar updates never invalidate the parent
      style={{
        height: maxHeight,
        contain: 'strict',
        width: barCount * (barWidth + 2.5) - 2.5,
        willChange: 'transform'
      }}
    >
      {Array.from({ length: barCount }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            barRefsArr.current[i] = el
          }}
          className="rounded-full"
          style={{
            width: barWidth,
            height: maxHeight,
            backgroundColor: color,
            transform: `scaleY(${(MIN_HEIGHT / maxHeight).toFixed(3)})`,
            transformOrigin: 'center',
            willChange: 'transform'
          }}
        />
      ))}
    </div>
  )
}
