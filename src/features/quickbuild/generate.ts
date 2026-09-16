// Quick Build: stars, planets and stations from a few knobs. Pure and seeded; the same knobs and seed give the same
// systems. Output loads in full under the StarsStations rules: planets only, never a
// star-type entry (the loader makes it a companion star that later planets orbit), one planet per orbit hundred,
// stations on planets this batch made, unique star and station names.
import { OVERLAP_LY } from '@/features/map/checks'
import { type Galaxy, insideOutline } from '@/features/map/galaxy'
import { CELL_LY } from '@/features/map/camera'
import { Rndm, mix } from '@/features/map/generator'
import { GOODS, PLANET_TYPES, SECURITY_LEVELS, STAR_TYPE_GROUPS, STATIONS, STATION_FACTIONS, STATION_TYPES, SYSTEMS } from '@/lib/reference'
import type { ModStation, Planet, Star, StarsView } from '@/lib/types'

export const BATCH_MAX = 100
export const ORBIT_MAX = 3000

export type PresetId = 'random' | 'trading' | 'exploration' | 'combat' | 'mining'
export const PRESETS: PresetId[] = ['random', 'trading', 'exploration', 'combat', 'mining']
/** `[min, max]`; equal ends fix the value. */
export type Range = [number, number]
type Security = Star['security']

export interface Knobs {
  preset: PresetId
  seed: number
  mode: 'point' | 'region'
  x: number
  y: number
  radius: number
  count: number
  /** Least distance in ly from any other system. */
  spacing: number
  /** Star type group names from STAR_TYPE_GROUPS, by index. */
  starGroups: number[]
  security: Security[]
  planets: Range
  planetTypes: string[]
  /** Allows asteroid belts among the planet types. */
  belts: boolean
  /** Orbit distance in the file's units; drawn on whole hundreds. */
  orbit: Range
  moons: Range
  size: Range
  rings: Range
  materials: string[]
  materialShare: number
  stations: Range
  /** Share of systems that get any station, 0..1. */
  stationShare: number
  stationTypes: ModStation['type'][]
  factions: ModStation['faction'][]
}

/** `slot` is the system's batch index, which locks, rerolls and the seed key on. */
export interface GenSystem { slot: number; star: Star; planets: Planet[]; stations: ModStation[] }

export interface Keep {
  /** Systems kept whole, by batch index. */
  systems?: Record<number, GenSystem>
  /** Planets kept inside a rerolled system, by batch index. */
  planets?: Record<number, Planet[]>
  /** Extra salt per batch index; a reroll bumps it. */
  salts?: Record<number, number>
}

/** `blocked` names what took most of the circle when it ran short; `room` is how many positions were free. */
export interface Batch { systems: GenSystem[]; requested: number; outside: boolean; room: number; blocked: 'near' | 'outside' | 'batch' | null }

/** One reservation slot: a hundredth of a cell. */
const SLOT_LY = CELL_LY / 100

const ORES = ['Bouxite', 'Gallite', 'Coltan', 'Bromellite', 'Rutile', 'Uraninite', 'Monazite', 'Painite', 'Lepidolite']
const GEMS = ['Diamonds', 'Alexandrite', 'VoidOpal', 'Musgravite']
export const MATERIALS = [...ORES, ...GEMS, 'Iron', 'Copper', 'Titanium', 'Gold', 'Platinum', 'Uranium'].filter((g) => GOODS.includes(g))

const group = (key: string) => STAR_TYPE_GROUPS.findIndex((g) => g.items[0] === key)
const MAIN = group('M-RedDwarf'), GIANTS = group('K-RedGiant'), DWARFS = group('DA-WhiteDwarf'), WOLF = group('WolfRayetStar')
const PULSARS = group('BursterPulsar'), CARBON = group('CarbonC-RStar'), HOLE = group('BlackHole')
const ALL_GROUPS = STAR_TYPE_GROUPS.map((_, i) => i)
const ALL_STATION_TYPES = STATION_TYPES.map((s) => s.key) as ModStation['type'][]
const ALL_FACTIONS = STATION_FACTIONS.map((f) => f.key) as ModStation['faction'][]

/** Knob defaults per preset. */
export function presetKnobs(preset: PresetId, at: { x: number; y: number; seed: number; mode: Knobs['mode'] }): Knobs {
  const base: Knobs = {
    preset, seed: at.seed, mode: at.mode, x: at.x, y: at.y, radius: 300, count: 10, spacing: 10,
    starGroups: ALL_GROUPS, security: [...SECURITY_LEVELS], planets: [1, 8], planetTypes: [...PLANET_TYPES], belts: false, orbit: [100, 1500],
    moons: [0, 4], size: [1, 5], rings: [0, 2], materials: [], materialShare: 0,
    stations: [0, 3], stationShare: 0.5, stationTypes: ALL_STATION_TYPES, factions: ALL_FACTIONS,
  }
  switch (preset) {
    case 'random': return base
    case 'trading': return {
      ...base, radius: 200, count: 8, starGroups: [MAIN], security: ['High', 'Medium'], planets: [3, 6],
      planetTypes: ['EarthLikePlanet', 'WaterWorld', 'AmmoniaPlanet', 'GasGiantClassI', 'GasGiantClassII', 'GasGiantClassIII', 'RockPlanet', 'HighMetalPlanet'],
      moons: [0, 2], rings: [0, 1], stations: [1, 3], stationShare: 1, stationTypes: ['NovaStation', 'FarmStation', 'OrbitalWhite'], factions: ['USA', 'China', 'Independent'],
    }
    case 'exploration': return {
      ...base, radius: 600, count: 20, spacing: 40, starGroups: [GIANTS, DWARFS, PULSARS, WOLF, HOLE].filter((i) => i >= 0), security: ['NoOne', 'Low'],
      planets: [4, 9], orbit: [100, 2500], moons: [0, 6], rings: [0, 3], materials: GEMS.filter((g) => GOODS.includes(g)), materialShare: 0.2,
      stations: [0, 1], stationShare: 0.2, stationTypes: ['StationHighTech', 'OrbitalWhite'], factions: ['Independent'],
    }
    case 'combat': return {
      ...base, radius: 250, count: 10, starGroups: [MAIN, CARBON], security: ['Anarchy', 'Conflict'], planets: [1, 4],
      planetTypes: ['RockPlanet', 'IcePlanet', 'GasGiantClassI', 'GasGiantClassII', 'GasGiantClassIII', 'GasGiantClassIV', 'GasGiantClassV'],
      moons: [0, 2], rings: [0, 1], stations: [1, 2], stationShare: 0.7, stationTypes: ['OrbitalDark'], factions: ['Pirates', 'Independent', 'Russian'],
    }
    case 'mining': return {
      ...base, radius: 300, count: 12, starGroups: [MAIN, DWARFS], security: ['Low', 'Medium'], planets: [3, 7],
      planetTypes: ['RockPlanet', 'IcePlanet', 'HighMetalPlanet', 'MetalRichPlanet'], moons: [0, 3], rings: [0, 1],
      materials: ORES.filter((g) => GOODS.includes(g)), materialShare: 0.7,
      stations: [1, 2], stationShare: 0.8, stationTypes: ['AsteroidStation', 'OrbitalWhite'], factions: ['Independent', 'China'],
    }
  }
}

/* ---------- names ---------- */

const ONSETS = ['', 'b', 'c', 'd', 'f', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'z', 'th', 'kr', 'st', 'dr', 'vel', 'mor', 'ss']
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'y', 'eo']
const CODAS = ['', '', 'n', 'r', 's', 'x', 'th', 'l', 'm']
const STATION_WORDS: Record<PresetId, string[]> = {
  random: ['Station', 'Hub', 'Outpost', 'Port', 'Ring', 'Anchorage'],
  trading: ['Exchange', 'Market', 'Port', 'Bazaar', 'Hub'],
  exploration: ['Survey', 'Beacon', 'Lookout', 'Waystation'],
  combat: ['Bastion', 'Garrison', 'Redoubt', 'Stronghold'],
  mining: ['Refinery', 'Works', 'Claim', 'Foundry', 'Dig'],
}
const pick = <T,>(r: Rndm, list: readonly T[]) => list[Math.min(list.length - 1, Math.floor(r.random() * list.length))]
const between = (r: Rndm, [a, b]: Range) => Math.min(b, a + Math.floor(r.random() * (b - a + 1)))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function starName(r: Rndm) {
  const syllables = 2 + (r.random() < 0.3 ? 1 : 0)
  let w = ''
  for (let i = 0; i < syllables; i++) w += pick(r, ONSETS) + pick(r, VOWELS)
  return cap(w + pick(r, CODAS))
}

/** Appends a numeral until `taken` does not hold the name, then claims it. */
function unique(name: string, taken: Set<string>) {
  let out = name
  for (let n = 2; taken.has(out.toLowerCase()); n++) out = `${name} ${n}`
  taken.add(out.toLowerCase())
  return out
}

/* ---------- generation ---------- */

const allowed = <T,>(chosen: readonly T[], valid: readonly T[], fallback: readonly T[]) => {
  const ok = chosen.filter((c) => valid.includes(c))
  return ok.length ? ok : fallback
}

const round1 = (n: number) => Math.round(n * 10) / 10
const genId = (_kind: string) => crypto.randomUUID()

/**
 * One batch. `mod` is what the batch lands in: its names are avoided and, unless `replace`, its stars are spaced
 * from, as are `neighbours` (other favorite mods' stars). Ids are fresh on every call; everything else follows the seed.
 */
export function generate(k: Knobs, galaxy: Galaxy | null, mod: StarsView | null, replace = false, keep: Keep = {}, neighbours: { x: number; y: number }[] = []): Batch {
  const defaults = presetKnobs(k.preset, { ...k })
  const starTypes = allowed(k.starGroups, ALL_GROUPS, defaults.starGroups).flatMap((g) => STAR_TYPE_GROUPS[g].items)
  const security = allowed(k.security, SECURITY_LEVELS, defaults.security)
  const planetTypes = [...allowed(k.planetTypes, PLANET_TYPES, defaults.planetTypes), ...(k.belts ? ['Asteroids'] : [])]
  const stationTypes = allowed(k.stationTypes, ALL_STATION_TYPES, defaults.stationTypes)
  const factions = allowed(k.factions, ALL_FACTIONS, defaults.factions)
  const materials = allowed(k.materials, MATERIALS, MATERIALS)
  const count = k.mode === 'point' ? 1 : Math.max(1, Math.min(BATCH_MAX, Math.round(k.count)))

  const starNames = new Set<string>([...SYSTEMS.map((s) => s.name.toLowerCase()), 'sagittarius a*'])
  galaxy?.byName.forEach((_, name) => starNames.add(name.toLowerCase()))
  const stationNames = new Set<string>(STATIONS.map((s) => s.name.toLowerCase()))
  mod?.stars.forEach((s) => starNames.add(s.name.toLowerCase()))
  mod?.stations.forEach((s) => stationNames.add(s.name.toLowerCase()))
  // Planets orbiting a game system share its name, so the mod's planet systems are taken too.
  mod?.planets.forEach((p) => starNames.add(p.system.toLowerCase()))
  Object.values(keep.systems ?? {}).forEach((g) => { starNames.add(g.star.name.toLowerCase()); g.stations.forEach((s) => stationNames.add(s.name.toLowerCase())) })

  // Positions: the circle rasterised at slot resolution. A position is free when it is inside the galaxy, at least
  // OVERLAP_LY from every drawn catalogue star, this mod's stars and other favorites' stars, which also keeps it out of
  // their reservation slots. Generated systems give way to mod stars, so they block nothing. The seed orders the free
  // positions; each system placed blocks its own OVERLAP_LY neighbourhood.
  const place = new Rndm(mix(k.seed * 2654435761 + 17))
  const others: [number, number][] = (galaxy?.reachable ?? []).map((s) => [s[1], s[2]])
  if (!replace) mod?.stars.forEach((s) => others.push([s.x, s.y]))
  neighbours.forEach((s) => others.push([s.x, s.y]))
  Object.values(keep.systems ?? {}).forEach((g) => others.push([g.star.x, g.star.y]))
  const rejected = { near: 0, outside: 0, batch: 0 }
  const free: { x: number; y: number; tie: number }[] = []
  const positions: ({ x: number; y: number } | null)[] = []
  if (k.mode === 'region' && Object.keys(keep.systems ?? {}).length < count) {
    // ponytail: wide circles use every nth slot, holding the raster near 10,000 positions.
    const step = SLOT_LY * Math.max(1, Math.ceil(k.radius / (SLOT_LY * 56)))
    const i0 = Math.ceil((k.x - k.radius) / step), j0 = Math.ceil((k.y - k.radius) / step)
    const ni = Math.floor((k.x + k.radius) / step) - i0 + 1, nj = Math.floor((k.y + k.radius) / step) - j0 + 1
    const block = new Uint8Array(ni * nj)
    /** Blocks every raster position within `r` of (x, y). */
    const mark = (x: number, y: number, r: number) => {
      for (let i = Math.max(0, Math.ceil((x - r) / step) - i0); i < ni && (i + i0) * step <= x + r; i++)
        for (let j = Math.max(0, Math.ceil((y - r) / step) - j0); j < nj && (j + j0) * step <= y + r; j++)
          if (Math.hypot((i + i0) * step - x, (j + j0) * step - y) < r) block[i * nj + j] = 1
    }
    const pad = k.radius + 5
    for (const [x, y] of others) if (Math.abs(x - k.x) <= pad && Math.abs(y - k.y) <= pad) mark(x, y, OVERLAP_LY)
    for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
      const x = round1((i + i0) * step), y = round1((j + j0) * step)
      if (Math.hypot(x - k.x, y - k.y) > k.radius) continue
      if (block[i * nj + j]) rejected.near++
      else if (galaxy && !insideOutline(galaxy.data.outline, x, y)) rejected.outside++
      else free.push({ x, y, tie: place.random() })
    }
    free.sort((a, b) => a.tie - b.tie)
  }

  // Greedy in seed order can box itself out of a small circle; reshuffled orders retry, and the fullest attempt wins.
  let best: ({ x: number; y: number } | null)[] = []
  let bestCount = -1, bestBatch = 0
  for (let attempt = 0; attempt < 30; attempt++) {
    if (attempt) for (const f of free) f.tie = place.random()
    if (attempt) free.sort((a, b) => a.tie - b.tie)
    const placed: { x: number; y: number }[] = []
    const tried: ({ x: number; y: number } | null)[] = []
    let next = 0, batch = 0, made = 0
    for (let i = 0; i < count; i++) {
      if (keep.systems?.[i]) { tried.push({ x: keep.systems[i].star.x, y: keep.systems[i].star.y }); continue }
      if (k.mode === 'point') { tried.push({ x: round1(k.x), y: round1(k.y) }); made++; continue }
      while (next < free.length && placed.some((p) => Math.hypot(p.x - free[next].x, p.y - free[next].y) < OVERLAP_LY)) { next++; batch++ }
      const at = next < free.length ? free[next++] : null
      if (at) { placed.push(at); made++ }
      tried.push(at && { x: at.x, y: at.y })
    }
    if (made > bestCount) { best = tried; bestCount = made; bestBatch = batch }
    if (k.mode === 'point' || tried.every((t) => t)) break
  }
  // Short after the shuffles: a hex lattice packs denser than greedy random. The seed turns and shifts it; the lattice
  // step carries a margin so rounding to 0.1 ly keeps neighbours OVERLAP_LY apart.
  const wanted = best.filter((_, i) => !keep.systems?.[i]).length
  if (k.mode === 'region' && bestCount < wanted) {
    const s = OVERLAP_LY + 0.15, h = s * Math.sqrt(3) / 2, R = k.radius + s
    const turn = place.random() * Math.PI, cos = Math.cos(turn), sin = Math.sin(turn)
    const du = place.random() * s, dv = place.random() * h
    const near = others.filter(([x, y]) => Math.hypot(x - k.x, y - k.y) <= k.radius + OVERLAP_LY)
    const hex: { x: number; y: number; tie: number }[] = []
    for (let row = Math.floor(-R / h) - 1; row * h <= R; row++) for (let col = Math.floor(-R / s) - 1; col * s <= R; col++) {
      const u = col * s + (row & 1 ? s / 2 : 0) + du, v = row * h + dv
      const x = round1(k.x + u * cos - v * sin), y = round1(k.y + u * sin + v * cos)
      if (Math.hypot(x - k.x, y - k.y) > k.radius) continue
      if (galaxy && !insideOutline(galaxy.data.outline, x, y)) continue
      if (near.some(([ox, oy]) => Math.hypot(ox - x, oy - y) < OVERLAP_LY)) continue
      hex.push({ x, y, tie: place.random() })
    }
    if (hex.length > bestCount) {
      hex.sort((a, b) => a.tie - b.tie)
      let next = 0
      best = best.map((t, i) => (keep.systems?.[i] ? t : hex[next++] ?? null))
    }
  }
  positions.push(...best)
  rejected.batch = bestBatch
  const systems: GenSystem[] = []
  positions.forEach((at, i) => {
    const kept = keep.systems?.[i]
    if (kept) { systems.push(kept); return }
    if (!at) return
    const r = new Rndm(mix(k.seed * 31 + i * 7919 + (keep.salts?.[i] ?? 0) * 104729 + 1))
    const name = unique(starName(r), starNames)
    const star: Star = { id: genId('star'), name, x: at.x, y: at.y, z: 0, security: pick(r, security), type: pick(r, starTypes) }

    // Orbits on distinct hundreds, clear of kept planets; file order is orbit order, so PlanetID is the list index.
    const keptPlanets = (keep.planets?.[i] ?? []).map((p) => ({ ...p, system: name, name: /^.+ [b-z]$/.test(p.name) && p.name.startsWith(`${p.system} `) ? '' : p.name }))
    const used = new Set(keptPlanets.map((p) => Math.floor(p.orbit / 100)))
    const lo = Math.max(1, Math.floor(k.orbit[0] / 100)), hi = Math.max(lo, Math.floor(k.orbit[1] / 100))
    const hundreds: number[] = []
    for (let h = lo; h <= hi; h++) if (!used.has(h)) hundreds.push(h)
    const want = Math.max(0, Math.min(hundreds.length, between(r, k.planets) - keptPlanets.length))
    for (let j = 0; j < want; j++) { const at2 = j + Math.floor(r.random() * (hundreds.length - j)); [hundreds[j], hundreds[at2]] = [hundreds[at2], hundreds[j]] }
    const fresh: Planet[] = hundreds.slice(0, want).map((h) => ({
      id: genId('planet'), name: '', system: name, type: pick(r, planetTypes), orbit: h * 100,
      moons: between(r, k.moons), size: Math.max(1, between(r, k.size)), rings: between(r, k.rings),
      material: materials.length && r.random() < k.materialShare ? pick(r, materials) : null,
    }))
    const planets = [...keptPlanets, ...fresh].sort((a, b) => a.orbit - b.orbit)
    const planetNames = new Set(keptPlanets.map((p) => p.name.toLowerCase()))
    let letter = 0
    for (const p of planets) {
      if (p.name) continue
      while (planetNames.has(`${name} ${String.fromCharCode(98 + letter)}`.toLowerCase())) letter++
      p.name = `${name} ${String.fromCharCode(98 + letter++)}`
    }

    const stations: ModStation[] = []
    if (planets.length && r.random() < k.stationShare) {
      const m = Math.min(planets.length, Math.max(k.stations[0] > 0 ? 1 : 0, between(r, k.stations)))
      const slots = planets.map((_, j) => j + 1)
      for (let j = 0; j < m; j++) {
        const s = j + Math.floor(r.random() * (slots.length - j));[slots[j], slots[s]] = [slots[s], slots[j]]
        const word = pick(r, STATION_WORDS[k.preset])
        const base = j === 0 ? `${name} ${word}` : `${planets[slots[j] - 1].name} ${word}`
        stations.push({ id: genId('station'), name: unique(base, stationNames), system: name, bodyIndex: slots[j], type: pick(r, stationTypes), faction: pick(r, factions) })
      }
      stations.sort((a, b) => a.bodyIndex - b.bodyIndex)
    }
    systems.push({ slot: i, star, planets, stations })
  })
  const outside = k.mode === 'point' && !!galaxy && !insideOutline(galaxy.data.outline, k.x, k.y)
  const short = systems.length < count
  const blocked = !short ? null : (Object.keys(rejected) as (keyof typeof rejected)[]).reduce<keyof typeof rejected | null>((a, b) => (rejected[b] > (a ? rejected[a] : 0) ? b : a), null)
  return { systems, requested: count, outside, room: free.length, blocked }
}

/** What the mod holds after Add (`replace` false) or Replace all. */
export function applyBatch(m: { stars: Star[]; planets: Planet[]; stations: ModStation[] }, batch: GenSystem[], replace: boolean) {
  if (replace) { m.stars = []; m.planets = []; m.stations = [] }
  for (const g of batch) { m.stars.push(g.star); m.planets.push(...g.planets); m.stations.push(...g.stations) }
}
