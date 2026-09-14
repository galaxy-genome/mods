// What a tap or a press lands on, and what each map mode does with it. Pure functions over screen positions.
import { type Camera, sx, sy, wxOf, wzOf } from './camera'

export type MapMode = 'edit' | 'point' | 'circle' | 'pick' | 'view'

export interface Hit {
  kind: 'mod' | 'other' | 'catalogue' | 'generated'
  name: string
  x: number
  y: number
  /** A mod star's id. */
  id?: string
}

export interface PickLayers {
  mod: Hit[]
  other: Hit[]
  catalogue: Hit[]
  generated: Hit[]
}

export const pickRadius = (touch: boolean) => (touch ? 24 : 14)
export const slop = (touch: boolean) => (touch ? 10 : 3)

export const worldAt = (c: Camera, mx: number, my: number) => ({ x: wxOf(c, mx), y: wzOf(c, my) })

function nearest(c: Camera, mx: number, my: number, list: Hit[], r: number) {
  let best: Hit | null = null, bd = r * r
  for (const h of list) {
    const dx = sx(c, h.x) - mx, dy = sy(c, h.y) - my, d = dx * dx + dy * dy
    if (d < bd) { bd = d; best = h }
  }
  return best
}

/** Nearest system within the pick radius: mod stars first, then other favorites, catalogue, generated. */
export function pick(c: Camera, mx: number, my: number, layers: PickLayers, touch: boolean): Hit | null {
  const r = pickRadius(touch)
  return nearest(c, mx, my, layers.mod, r) ?? nearest(c, mx, my, layers.other, r)
    ?? nearest(c, mx, my, layers.catalogue, r) ?? nearest(c, mx, my, layers.generated, r)
}

export interface Circle { x: number; y: number; r: number }

export type Grab =
  | { kind: 'star'; id: string }
  | { kind: 'point' }
  | { kind: 'centre' }
  | { kind: 'ring' }
  | { kind: 'pan' }

/** What a press starts dragging. Only a handle or a mod star within the pick radius drags; anything else pans. */
export function grabAt(mode: MapMode, c: Camera, mx: number, my: number, o: { stars: Hit[]; point?: { x: number; y: number }; circle?: Circle; touch: boolean }): Grab {
  const r = pickRadius(o.touch)
  if (mode === 'edit') {
    const hit = nearest(c, mx, my, o.stars, r)
    return hit?.id ? { kind: 'star', id: hit.id } : { kind: 'pan' }
  }
  if (mode === 'point' && o.point) {
    return Math.hypot(sx(c, o.point.x) - mx, sy(c, o.point.y) - my) < r ? { kind: 'point' } : { kind: 'pan' }
  }
  if (mode === 'circle' && o.circle) {
    const d = Math.hypot(sx(c, o.circle.x) - mx, sy(c, o.circle.y) - my)
    if (d < r) return { kind: 'centre' }
    if (Math.abs(d - o.circle.r * c.scale) < r) return { kind: 'ring' }
  }
  return { kind: 'pan' }
}

export type TapAction =
  | { kind: 'add'; x: number; y: number }
  | { kind: 'open'; id: string }
  | { kind: 'select'; hit: Hit }
  | { kind: 'point'; x: number; y: number }
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'pick'; name: string }
  | { kind: 'none' }

/** What a tap (press and release without a drag) does in each mode. */
export function tapAction(mode: MapMode, hit: Hit | null, world: { x: number; y: number }, circle?: Circle): TapAction {
  switch (mode) {
    case 'edit':
      if (!hit) return { kind: 'add', x: world.x, y: world.y }
      return hit.kind === 'mod' && hit.id ? { kind: 'open', id: hit.id } : { kind: 'select', hit }
    case 'point':
      return hit ? { kind: 'point', x: hit.x, y: hit.y } : { kind: 'point', x: world.x, y: world.y }
    case 'circle': {
      const at = hit ?? world
      return { kind: 'circle', x: at.x, y: at.y, r: circle?.r ?? 0 }
    }
    case 'pick':
      return hit ? { kind: 'pick', name: hit.name } : { kind: 'none' }
    case 'view':
      return hit ? { kind: 'select', hit } : { kind: 'none' }
  }
}

/** Where a drag of `grab` puts things, from the pointer's world position. */
export function dragTo(grab: Grab, world: { x: number; y: number }, circle?: Circle): { x: number; y: number; r?: number } | null {
  if (grab.kind === 'star' || grab.kind === 'point' || grab.kind === 'centre') return { x: world.x, y: world.y, r: circle?.r }
  if (grab.kind === 'ring' && circle) return { x: circle.x, y: circle.y, r: Math.hypot(world.x - circle.x, world.y - circle.y) }
  return null
}
