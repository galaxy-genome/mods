// Pure placement for Flow graph edge labels: clear of step cards and of each other.

export interface Rect { x: number; y: number; w: number; h: number }
/** A cubic curve's start, two controls and end. */
export type Cubic = [number, number, number, number, number, number, number, number]

const at = ([x0, y0, x1, y1, x2, y2, x3, y3]: Cubic, t: number) => {
  const u = 1 - t
  return { x: u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, y: u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3 }
}
const hits = (a: Rect, b: Rect, pad: number) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad

/**
 * Label rectangles, in order, each centred on its curve where it overlaps no card and no earlier label: points along
 * the curve from the middle out, then the same points pushed sideways by `side` (-1 left, 1 right) in growing steps.
 * A label with no clear spot takes the last candidate, the farthest out.
 */
export function placeLabels(cards: Rect[], labels: { curve: Cubic; w: number; h: number; side: -1 | 1 }[], pad = 3): Rect[] {
  const placed: Rect[] = []
  for (const { curve, w, h, side } of labels) {
    let best: Rect | null = null
    search: for (const push of [0, 1, 2, 3, 4, 6]) {
      for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
        const p = at(curve, t)
        best = { x: p.x - w / 2 + side * push * (w / 2 + 6), y: p.y - h / 2, w, h }
        if (![...cards, ...placed].some((r) => hits(best!, r, pad))) break search
      }
    }
    placed.push(best!)
  }
  return placed
}
