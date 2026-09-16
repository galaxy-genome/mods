// Pure layout for overlay pins: framing the camera on them, and fanning pins that sit too close to read.
import { clampScale } from './camera'

export const PIN_R = 9
/** Screen margin around framed pins: room for a pin and the start of its label. */
export const FIT_PAD = { x: 64, y: 44 }
/** The narrowest span a fit shows, so a one-place quest keeps its neighbours in view. */
export const FIT_MIN_LY = 8

/** A point to frame: a world position, an optional world radius, and an optional box of pixels it draws over. */
export interface FitPoint { x: number; y: number; r?: number; box?: { l: number; r: number; t: number; b: number } }

/**
 * A camera centre and scale that shows every point, circle and drawn box inside `W`×`H` with `pad` pixels spare.
 * A box is pixels wide whatever the zoom, so the scale that holds everything is found by bisection.
 */
export function fitView(points: FitPoint[], W: number, H: number, pad = FIT_PAD, minLy = FIT_MIN_LY) {
  if (!points.length) return undefined
  const w = Math.max(1, W - 2 * pad.x), h = Math.max(1, H - 2 * pad.y)
  // A box wider than the view can never fit: it is trimmed to the view, so the rest still frames.
  const boxes = points.map((p) => {
    const b = p.box
    if (!b) return undefined
    const l = Math.min(b.l, w / 2), t = Math.min(b.t, h / 2)
    return { l, t, r: Math.min(b.r, w - l), b: Math.min(b.b, h - t) }
  })
  // Screen span of the points at `scale`, and the centre that puts it in the middle.
  const spanAt = (scale: number) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const [i, p] of points.entries()) {
      const r = (p.r ?? 0) * scale, b = boxes[i]
      x0 = Math.min(x0, p.x * scale - r - (b?.l ?? 0)); x1 = Math.max(x1, p.x * scale + r + (b?.r ?? 0))
      y0 = Math.min(y0, p.y * scale - r - (b?.b ?? 0)); y1 = Math.max(y1, p.y * scale + r + (b?.t ?? 0))
    }
    return { x: (x0 + x1) / 2 / scale, y: (y0 + y1) / 2 / scale, dx: x1 - x0, dy: y1 - y0 }
  }
  let lo = clampScale(W, 0), hi = clampScale(W, Math.min(w / minLy, h / minLy))
  const fits = (s: number) => { const v = spanAt(s); return v.dx <= w && v.dy <= h }
  if (!fits(hi)) {
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid }
    hi = lo
  }
  const scale = clampScale(W, hi)
  const { x, y } = spanAt(scale)
  return { x, y, scale }
}

/**
 * Displayed positions for pins at screen `px, py` with width `w`. Pins nearer than their half-widths plus a gap join one
 * group; a group of several spreads evenly on a circle around its centroid, keeping each pin's side of it.
 */
export function fanPins(pins: { px: number; py: number; w: number }[], gap = 4): { x: number; y: number; fanned: boolean }[] {
  const n = pins.length
  const root = pins.map((_, i) => i)
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])))
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = pins[i], b = pins[j]
    if (Math.abs(a.px - b.px) < (a.w + b.w) / 2 + gap && Math.abs(a.py - b.py) < 2 * PIN_R + gap) root[find(i)] = find(j)
  }
  // ponytail: O(n²) grouping and no second pass for fans that land on other pins; fine for a quest's few dozen pins.
  const out = pins.map((p) => ({ x: p.px, y: p.py, fanned: false }))
  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) groups.set(find(i), [...(groups.get(find(i)) ?? []), i])
  for (const g of groups.values()) {
    if (g.length < 2) continue
    const cx = g.reduce((s, i) => s + pins[i].px, 0) / g.length, cy = g.reduce((s, i) => s + pins[i].py, 0) / g.length
    const wide = Math.max(...g.map((i) => pins[i].w))
    // Neighbours on the ring sit a pin width plus a gap apart, and never nearer the centre than one pin.
    const R = Math.max(wide + 2 * gap, (g.length * (wide + 2 * gap)) / (2 * Math.PI))
    const angle = (i: number) => Math.atan2(pins[i].py - cy, pins[i].px - cx) || 0
    const order = g.toSorted((a, b) => angle(a) - angle(b) || a - b)
    const a0 = angle(order[0])
    order.forEach((i, k) => {
      const a = a0 + (2 * Math.PI * k) / g.length
      out[i] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), fanned: true }
    })
  }
  return out
}
