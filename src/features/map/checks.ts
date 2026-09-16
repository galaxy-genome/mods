// Star problems that need the galaxy: position against the outline, reservation slots and generated space.
// Errors: the game hides the star, or hides a catalogue system to make room for it. Displacing generated systems is expected and only a tip.
import type { Severity, Star } from '@/lib/types'
import { type Galaxy, insideOutline } from './galaxy'
import { placeStars } from './placement'

/** The closest generated spacing: one tenth of a cell. */
export const OVERLAP_LY = 4.37

export interface MapCheck {
  id: string
  severity: Severity
  starId: string
  /** i18n key under `map.` */
  key: 'outside' | 'overlap' | 'hides' | 'removes' | 'renumbers' | 'moves'
  vars: Record<string, string>
}

const ly = (n: number) => Math.round(n).toLocaleString('en-US')

export function mapChecks(stars: Star[], g: Galaxy): MapCheck[] {
  const out: MapCheck[] = []
  const placed = placeStars(g, stars)
  stars.forEach((s, i) => {
    const label = s.name.trim() || s.id
    const catalogue = g.byName.get(s.name)
    if (catalogue) out.push({ id: `sname-exists-${s.id}`, severity: 'tip', starId: s.id, key: 'moves', vars: { name: label, x: ly(catalogue[1]), y: ly(catalogue[2]) } })
    if (!insideOutline(g.data.outline, s.x, s.y)) out.push({ id: `soutside-${s.id}`, severity: 'warning', starId: s.id, key: 'outside', vars: { name: label } })
    const p = placed[i]
    if (p.hiddenBy) out.push({ id: `soverlap-${s.id}`, severity: 'error', starId: s.id, key: 'overlap', vars: { name: label, other: p.hiddenBy } })
    if (p.hiddenCatalogue.length) out.push({ id: `shides-${s.id}`, severity: 'error', starId: s.id, key: 'hides', vars: { name: label, other: p.hiddenCatalogue.join(', ') } })
    if (p.deletedGenerated.length) out.push({ id: `sremoves-${s.id}`, severity: 'tip', starId: s.id, key: 'removes', vars: { name: label, other: p.deletedGenerated.join(', ') } })
    if (p.renumberedGenerated.length) out.push({ id: `srenumbers-${s.id}`, severity: 'tip', starId: s.id, key: 'renumbers', vars: { name: label, other: p.renumberedGenerated.join(', ') } })
  })
  return out
}
