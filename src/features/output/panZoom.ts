import * as React from 'react'

/**
 * Drag to pan, wheel or pinch to zoom, for the graph canvases. `moved` counts the pointer travel of the current
 * gesture, so a click handler can tell a tap from the end of a drag.
 */
export function usePanZoom() {
  const box = React.useRef<HTMLDivElement>(null)
  const [view, setView] = React.useState({ k: 1, x: 0, y: 0 })
  const pointers = React.useRef(new Map<number, { x: number; y: number }>())
  const moved = React.useRef(0)
  const pinch = React.useRef<number | null>(null)

  const zoom = (factor: number) => setView((v) => ({ ...v, k: Math.min(2.5, Math.max(0.4, v.k * factor)) }))
  const reset = () => setView({ k: 1, x: 0, y: 0 })

  React.useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1) }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const handlers = {
    onPointerDown(e: React.PointerEvent) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      moved.current = 0
      pinch.current = null
    },
    onPointerMove(e: React.PointerEvent) {
      const prev = pointers.current.get(e.pointerId)
      if (!prev) return
      const next = { x: e.clientX, y: e.clientY }
      pointers.current.set(e.pointerId, next)
      const pts = [...pointers.current.values()]
      if (pts.length === 2) {
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
        if (pinch.current) zoom(d / pinch.current)
        pinch.current = d
        moved.current += 10
        return
      }
      const dx = next.x - prev.x
      const dy = next.y - prev.y
      moved.current += Math.abs(dx) + Math.abs(dy)
      if (moved.current > 6) {
        if (!box.current?.hasPointerCapture(e.pointerId)) box.current?.setPointerCapture(e.pointerId)
        setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
      }
    },
    onPointerUp(e: React.PointerEvent) {
      pointers.current.delete(e.pointerId)
      if (pointers.current.size < 2) pinch.current = null
    },
    onPointerCancel(e: React.PointerEvent) {
      pointers.current.delete(e.pointerId)
      if (pointers.current.size < 2) pinch.current = null
    },
  }

  /** A tap, rather than the release of a drag. */
  const tapped = () => moved.current <= 6

  return { box, view, setView, zoom, reset, handlers, tapped }
}
