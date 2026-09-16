// What real stars do to the game's map: GalaxyMap.GetRealStars (height test, reservation slots) and GenerateSector
// (generated positions skipped near real stars). Pure; generation runs with and without the given stars.
import { CELL_LY } from './camera'
import type { Galaxy } from './galaxy'
import { Generator, type GeneratedStar, slotOf } from './generator'

export interface StarAt { name: string; x: number; y: number; z: number }

export interface Placement {
  /** "cellX,cellY" */
  cell: string
  slot: string
  /** The earlier-loaded system holding this star's slot: the game neither draws nor generates around this star. */
  hiddenBy: string | null
  /** Off the map: height 7 ly or more within 200 ly of the map origin. */
  tooHigh: boolean
  /** Catalogue systems whose slot this star takes, so the game hides them. */
  hiddenCatalogue: string[]
  /** Generated systems this star removes. */
  deletedGenerated: string[]
  /** Generated systems in this star's cell that keep their name but move or become a different star. */
  renumberedGenerated: string[]
}

/** GetRealStars draws a star when it is under 7 ly high or more than 200 ly from the map origin on either axis. */
const drawn = (s: StarAt) => Math.abs(s.z) < 7 || Math.abs(s.x) > 200 || Math.abs(s.y) > 200

const catalogueOnly = new WeakMap<Galaxy, Generator>()
const generatorFor = (g: Galaxy, points: [number, number][]) => {
  const gen = new Generator(g.data.starTable, g.data.sectorAnchors)
  gen.setMaps(g.generator.side!, g.generator.zones!)
  gen.setReal(points)
  return gen
}

/**
 * Placements for `stars` (one mod's stars, in load order) added to the catalogue. A star named like a catalogue system
 * moves that system and keeps its load position. Without the generation maps, deleted and renumbered stay empty.
 */
export function placeStars(g: Galaxy, stars: StarAt[]): Placement[] {
  const byName = new Map(stars.map((s) => [s.name, s]))
  const loaded: { name: string; x: number; y: number; mod: StarAt | null }[] = []
  for (const row of g.data.systems) {
    const moved = byName.get(row[0])
    if (moved) { if (drawn(moved)) loaded.push({ name: row[0], x: moved.x, y: moved.y, mod: moved }) } else if (row[5]) loaded.push({ name: row[0], x: row[1], y: row[2], mod: null })
  }
  for (const s of stars) if (!g.byName.has(s.name) && drawn(s)) loaded.push({ name: s.name, x: s.x, y: s.y, mod: s })

  const owner = new Map<string, (typeof loaded)[number]>()
  const hiddenBy = new Map<StarAt, string>()
  const hides = new Map<StarAt, string[]>()
  for (const l of loaded) {
    const slot = slotOf(l.x, l.y)
    const first = owner.get(slot)
    if (!first) owner.set(slot, l)
    else if (l.mod) hiddenBy.set(l.mod, first.name)
    else if (first.mod) hides.set(first.mod, [...(hides.get(first.mod) ?? []), l.name])
  }

  const out = stars.map((s): Placement => {
    const slot = slotOf(s.x, s.y)
    return { cell: slot.split(',', 2).join(','), slot, hiddenBy: hiddenBy.get(s) ?? null, tooHigh: !drawn(s), hiddenCatalogue: hides.get(s) ?? [], deletedGenerated: [], renumberedGenerated: [] }
  })
  if (!g.generator.side || !g.generator.zones) return out

  let base = catalogueOnly.get(g)
  if (!base || base.side !== g.generator.side) catalogueOnly.set(g, base = generatorFor(g, g.reachable.map((r) => [r[1], r[2]])))
  const withStars = generatorFor(g, loaded.map((l) => [l.x, l.y]))

  const cells = new Map<string, number[]>()
  out.forEach((p, i) => { if (!p.hiddenBy && !p.tooHigh) cells.set(p.cell, [...(cells.get(p.cell) ?? []), i]) })
  for (const [cell, members] of cells) {
    const [cx, cy] = cell.split(',').map(Number)
    const after = new Map(withStars.cellStars(cx, cy).map((st) => [st.name, st]))
    const side = g.generator.side[cy * 2048 + cx]
    const reach = CELL_LY / (side * Math.SQRT2)
    const changed: string[] = []
    for (const st of base.cellStars(cx, cy)) {
      const now = after.get(st.name)
      if (now) { if (moved(st, now)) changed.push(st.name); continue }
      // A removed system belongs to the member star that clashes with it; a shifted stream can remove it without one.
      const by = members.find((i) => Math.hypot(stars[i].x - st.x, stars[i].y - st.z) < reach) ?? members[0]
      out[by].deletedGenerated.push(st.name)
    }
    for (const i of members) out[i].renumberedGenerated = changed
  }
  return out
}

// Seeds are left out: the generator's seed formula counts catalogue stars, which the game's GenerateSector does not.
const moved = (a: GeneratedStar, b: GeneratedStar) => a.x !== b.x || a.z !== b.z || a.raw !== b.raw
