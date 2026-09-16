// A mod's dependencies JSON: the names its quests use, the names it adds, and what its stars change on the game's map.
// Checks across mods intersect these arrays instead of resolving every quest again. Pure.
import type { Galaxy } from '@/features/map/galaxy'
import { placeStars } from '@/features/map/placement'
import { GENERATED, type PlaceSource, addsOf, questPlaceUses, sortedNames } from './dependencies'
import { BODIES, STATIONS } from './reference'

export interface ModDeps {
  uses: { systems: string[]; stations: string[]; planets: string[]; generated: string[]; quests: string[] }
  adds: { systems: string[]; stations: string[]; planets: string[]; quests: string[] }
  changes: { cells: string[]; hiddenSlots: string[]; deletedGenerated: string[]; renumberedGenerated: string[] }
}

const isGameStation = (name: string) => STATIONS.some((s) => s.name === name)
const isGamePlanet = (name: string) => Object.values(BODIES).some((list) => list.some((b) => b.kind === 'Planet' && b.name === name))

/** Galaxy-free part, cached per mod object; `changes` also depends on whether the generation maps are loaded. */
const cache = new WeakMap<PlaceSource, { maps: unknown; deps: ModDeps }>()

export function modDeps(mod: PlaceSource, ctx: { galaxy: Galaxy | null }): ModDeps {
  const g = ctx.galaxy
  const maps = g?.generator.side ?? g
  const hit = cache.get(mod)
  if (hit && hit.maps === maps) return hit.deps

  const own = new Set(mod.stars?.stars.map((s) => s.name) ?? [])
  const isSystem = (name: string) => own.has(name) || !!g?.byName.has(name) || !GENERATED.test(name)
  const uses = { systems: [] as string[], stations: [] as string[], planets: [] as string[], generated: [] as string[], quests: [] as string[] }
  for (const q of mod.quests) {
    const content = q.versions[q.primaryLang]
    if (!content) continue
    for (const u of questPlaceUses(content)) {
      if (u.kind === 'quest') uses.quests.push(u.name)
      else if (u.kind === 'station' || (u.kind === 'any' && isGameStation(u.name))) uses.stations.push(u.name)
      else if (u.kind === 'planet' || (u.kind === 'any' && isGamePlanet(u.name))) uses.planets.push(u.name)
      // ponytail: an order target naming nothing known (a pilot, another mod's station) lands in systems.
      else (isSystem(u.name) ? uses.systems : uses.generated).push(u.name)
    }
  }

  const changes = { cells: [] as string[], hiddenSlots: [] as string[], deletedGenerated: [] as string[], renumberedGenerated: [] as string[] }
  if (g && mod.stars?.stars.length) {
    for (const p of placeStars(g, mod.stars.stars)) {
      if (p.hiddenBy) { changes.hiddenSlots.push(p.slot); continue }
      if (p.tooHigh) continue
      changes.cells.push(p.cell)
      changes.deletedGenerated.push(...p.deletedGenerated)
      changes.renumberedGenerated.push(...p.renumberedGenerated)
    }
  }

  const sort = <T extends Record<string, string[]>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, sortedNames(v)])) as T
  const deps: ModDeps = { uses: sort(uses), adds: addsOf(mod), changes: sort(changes) }
  cache.set(mod, { maps, deps })
  return deps
}
