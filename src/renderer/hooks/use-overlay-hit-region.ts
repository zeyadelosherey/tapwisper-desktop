import { useEffect, useRef, type RefObject } from 'react'

// Extra space around each visible element that stays drawn/clickable on
// Linux, so card shadows aren't clipped by the window shape.
const SHAPE_PADDING = 24

// On macOS/Windows the window becomes clickable slightly before the cursor
// reaches the card, so drag regions at the card's edge (which don't receive
// mouse events themselves) are already interactive.
const HOVER_MARGIN = 8

const isLinux = window.tapwisper.platform.os === 'linux'

function getRects(elements: ReadonlyArray<RefObject<HTMLElement | null>>): DOMRect[] {
  return elements
    .map((ref) => ref.current)
    .filter((el): el is HTMLElement => el !== null)
    .map((el) => el.getBoundingClientRect())
}

/**
 * Keeps the transparent parts of an overlay window click-through so they
 * don't swallow clicks meant for the apps underneath.
 *
 * - macOS / Windows: the main process ignores mouse events on the window but
 *   forwards mouse moves. This hook tracks whether the cursor is over one of
 *   `elements` and tells the main process to make the window clickable.
 * - Linux (no mouse forwarding): the bounding boxes of `elements` are sent
 *   to the main process, which clips the window shape to them.
 *
 * @param elements refs of every visible element of the overlay
 * @param active whether the overlay content is currently shown
 * @param layoutKey changes whenever the set of rendered elements changes
 */
export function useOverlayHitRegion(
  elements: ReadonlyArray<RefObject<HTMLElement | null>>,
  active: boolean,
  layoutKey = ''
): void {
  const elementsRef = useRef(elements)
  elementsRef.current = elements

  // macOS / Windows: hover tracking via forwarded mouse moves
  useEffect(() => {
    if (isLinux || !active) return

    let inside = false
    const setInside = (next: boolean): void => {
      if (next === inside) return
      inside = next
      window.tapwisper.overlay.setInteractive(next)
    }

    const onMouseMove = (e: MouseEvent): void => {
      const hit = getRects(elementsRef.current).some(
        (r) =>
          e.clientX >= r.left - HOVER_MARGIN &&
          e.clientX <= r.right + HOVER_MARGIN &&
          e.clientY >= r.top - HOVER_MARGIN &&
          e.clientY <= r.bottom + HOVER_MARGIN
      )
      setInside(hit)
    }
    const onMouseLeave = (): void => setInside(false)
    // The main process resets the window to click-through when it hides it
    const onVisibilityChange = (): void => {
      if (document.hidden) setInside(false)
    }

    document.addEventListener('mousemove', onMouseMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', onMouseLeave)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.documentElement.removeEventListener('mouseleave', onMouseLeave)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      // Content is going away — it can no longer report the cursor leaving
      window.tapwisper.overlay.setInteractive(false)
    }
  }, [active])

  // Linux: clip the window shape to the visible elements
  useEffect(() => {
    if (!isLinux) return
    if (!active) {
      window.tapwisper.overlay.setHitRegion([])
      return
    }

    let frame = 0
    const report = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const rects = getRects(elementsRef.current).map((r) => ({
          x: r.left - SHAPE_PADDING,
          y: r.top - SHAPE_PADDING,
          width: r.width + SHAPE_PADDING * 2,
          height: r.height + SHAPE_PADDING * 2
        }))
        window.tapwisper.overlay.setHitRegion(rects)
      })
    }

    report()
    const observer = new ResizeObserver(report)
    for (const ref of elementsRef.current) {
      if (ref.current) observer.observe(ref.current)
    }
    // Scale/slide animations and window resizes move elements without
    // resizing them
    window.addEventListener('resize', report)
    document.addEventListener('animationend', report, true)
    document.addEventListener('transitionend', report, true)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', report)
      document.removeEventListener('animationend', report, true)
      document.removeEventListener('transitionend', report, true)
    }
  }, [active, layoutKey])
}
