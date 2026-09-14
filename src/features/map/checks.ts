// Star problems that need the galaxy: position against the outline, catalogue systems and generated space.
// The game loads a star at any position, so none of these is an error.
import type { Severity, Star } from '@/lib/types'
import { CELL_LY, cellOf } from './camera'
import { type Galaxy, insideOutline } from './galaxy'

/** The closest generated spacing: one tenth of a cell. */
export const OVERLAP_LY = 4.37

export interface MapCheck {
  id: string
  severity: Severity
  starId: string
  /** i18n key under `map.` */
  key: 'outside' | 'overlap' | 'hides' | 'moves'
  vars: Record<string, string>
}

const ly = (n: number) => Math.round(n).toLocaleString('en-US')

export function mapChecks(stars: Star[], g: Galaxy): MapCheck[] {
  const out: MapCheck[] = []
  const names = new Set(stars.map((s) => s.name))
  // Reachable catalogue systems by cell, without the ones this mod moves.
  const byCell = new Map<number, { name: string; x: number; y: number }[]>()
  const put = (name: string, x: number, y: number) => {
    const [cx, cy] = cellOf(x, y)
    const k = cy * 2048 + cx
    let list = byCell.get(k)
    if (!list) byCell.set(k, list = [])
    list.push({ name, x, y })
  }
  for (const s of g.reachable) if (!names.has(s[0])) put(s[0], s[1], s[2])
  stars.forEach((s) => put(s.name, s.x, s.y))

  for (const s of stars) {
    const label = s.name.trim() || s.id
    const catalogue = g.byName.get(s.name)
    if (catalogue) out.push({ id: `sname-exists-${s.id}`, severity: 'tip', starId: s.id, key: 'moves', vars: { name: label, x: ly(catalogue[1]), y: ly(catalogue[2]) } })
    if (!insideOutline(g.data.outline, s.x, s.y)) out.push({ id: `soutside-${s.id}`, severity: 'warning', starId: s.id, key: 'outside', vars: { name: label } })

    const [cx, cy] = cellOf(s.x, s.y)
    let near: { name: string; d: number } | null = null
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const o of byCell.get((cy + dy) * 2048 + cx + dx) ?? []) {
        if (o.name === s.name && o.x === s.x && o.y === s.y) continue
        const d = Math.hypot(o.x - s.x, o.y - s.y)
        if (d < OVERLAP_LY && (!near || d < near.d)) near = { name: o.name || '?', d }
      }
    }
    if (near) out.push({ id: `soverlap-${s.id}`, severity: 'warning', starId: s.id, key: 'overlap', vars: { name: label, other: near.name } })

    const side = g.generator.side?.[cy * 2048 + cx]
    if (side) {
      const reach = CELL_LY / (side * Math.SQRT2)
      let hidden: { name: string } | null = null, best = reach
      for (const st of g.generator.cellStars(cx, cy)) {
        const d = Math.hypot(st.x - s.x, st.z - s.y)
        if (d < best) { best = d; hidden = st }
      }
      if (hidden) out.push({ id: `shides-${s.id}`, severity: 'tip', starId: s.id, key: 'hides', vars: { name: label, other: hidden.name } })
    }
  }
  return out
}
