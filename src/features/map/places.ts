// Where a quest happens on the galaxy map: one resolver for system, station and planet names, and pure layers that
// turn quests into places, step routes and series routes. No drawing and no store access.
import { parseCondition } from '@/lib/conditions'
import { GENERATED } from '@/lib/dependencies'
import { BODIES, STATIONS } from '@/lib/reference'
import { missionNeedsSystem, stepGraph } from '@/lib/rules'
import type { QuestContent, StarsView } from '@/lib/types'
import { CELL_LY } from './camera'
import type { Galaxy } from './galaxy'

export type PlaceKind = 'system' | 'station' | 'planet' | 'area'
export type PlaceRole = 'offer' | 'start' | 'arrive' | 'fail' | 'missionHome' | 'missionTarget' | 'order'

export interface Point { x: number; y: number; system: string; source: 'mod' | 'catalogue' | 'generated'; approx?: boolean }
export interface Place extends Point { kind: PlaceKind; role: PlaceRole; name: string; r?: number }
export interface Unresolved { kind: Exclude<PlaceKind, 'area'>; role: PlaceRole; name: string }

const pairValue = (p: string) => (p.charCodeAt(0) - 65) * 26 + (p.charCodeAt(1) - 97)
/** Quadrant letter to the signs of anchor minus cell, as `Generator.sectorName` writes it. */
const QUADRANT: Record<string, [number, number][]> = { B: [[1, 1], [1, -1], [-1, 1], [-1, -1]], C: [[1, -1]], D: [[-1, -1]], E: [[-1, 1]] }

export interface Resolver {
  system(name: string): Point | null
  station(name: string): Point | null
  /** A planet name is often shared by many systems; `near` picks among them, otherwise only a unique name resolves. */
  planet(name: string, near?: Set<string>): Point | null
}

/**
 * Names to positions. Systems: stars mods in `stars` order (a mod star with a catalogue name moves that system), the
 * catalogue, then generated names decoded to their cell (exact once the generation maps are loaded, the cell centre
 * before). Stations: reference data, then stars mods. Planets: stars mods, then reference bodies.
 */
export function makeResolver(galaxy: Galaxy, stars: StarsView[]): Resolver {
  const modStars = new Map<string, Point>()
  const modStations = new Map<string, string>()
  const planetSystems = new Map<string, Set<string>>()
  for (const m of [...stars].reverse()) {
    for (const s of m.stars) modStars.set(s.name, { x: s.x, y: s.y, system: s.name, source: 'mod' })
    for (const s of m.stations) modStations.set(s.name, s.system)
  }
  const addPlanet = (name: string | null, system: string) => {
    if (!name) return
    let set = planetSystems.get(name)
    if (!set) planetSystems.set(name, set = new Set())
    set.add(system)
  }
  for (const [system, bodies] of Object.entries(BODIES)) for (const b of bodies) if (b.kind === 'Planet') addPlanet(b.name, system)
  const modPlanets = new Map<string, string>()
  for (const m of stars) for (const p of m.planets) if (!modPlanets.has(p.name)) modPlanets.set(p.name, p.system)
  const cache = new Map<string, Point | null>()

  const generated = (name: string): Point | null => {
    const m = GENERATED.exec(name)
    if (!m) return null
    const [, zone, px, py, q] = m
    const ax = pairValue(px), ay = pairValue(py)
    const anchors = galaxy.data.sectorAnchors
    const gen = galaxy.generator
    for (let i = 0; i < anchors.sectors.length; i++) {
      if (anchors.sectors[i] !== zone) continue
      for (const [sx, sy] of QUADRANT[q]) {
        const cx = anchors.x[i] - sx * ax, cy = anchors.y[i] - sy * ay
        const at = gen.sectorName(cx, cy)
        if (at.zone !== zone || at.sector !== `${px}-${py} ${q}`) continue
        const exact = gen.side ? gen.cellStars(cx, cy).find((st) => st.name === name) : undefined
        if (exact) return { x: exact.x, y: exact.z, system: name, source: 'generated' }
        if (gen.side) continue
        return { x: (cx + 0.5 - 1025) * CELL_LY, y: (1591 - cy - 0.5) * CELL_LY, system: name, source: 'generated', approx: true }
      }
    }
    return null
  }

  const system = (name: string): Point | null => {
    if (!name) return null
    if (cache.has(name)) return cache.get(name)!
    const row = galaxy.byName.get(name)
    const hit = modStars.get(name) ?? (row ? { x: row[1], y: row[2], system: name, source: 'catalogue' as const } : generated(name))
    cache.set(name, hit)
    return hit
  }
  const station = (name: string) => {
    const sys = STATIONS.find((s) => s.name === name)?.system ?? modStations.get(name)
    return sys ? system(sys) : null
  }
  const planet = (name: string, near?: Set<string>) => {
    const own = modPlanets.get(name)
    if (own) return system(own)
    const systems = [...(planetSystems.get(name) ?? [])]
    const pickFrom = near ? systems.filter((s) => near.has(s)) : []
    const sys = pickFrom.length === 1 ? pickFrom[0] : systems.length === 1 ? systems[0] : null
    return sys ? system(sys) : null
  }
  return { system, station, planet }
}

/**
 * A pin's places in the player's words. Stations always name their system: "Manson Orbital (Wolf 359)", or, with
 * several places in one system, "Barnard's Star: Nexus Station, Vertex Terminal". `area` names a start area.
 */
export function placeLabel(places: Place[], area: string) {
  const bySystem = new Map<string, string[]>()
  const out: string[] = []
  for (const p of places) {
    if (p.kind === 'area') { if (!out.includes(area)) out.push(area); continue }
    const names = bySystem.get(p.system) ?? []
    if (!bySystem.has(p.system)) { bySystem.set(p.system, names); out.push(`\0${p.system}`) }
    if (p.name !== p.system && !names.includes(p.name)) names.push(p.name)
  }
  return out.map((o) => {
    if (!o.startsWith('\0')) return o
    const sys = o.slice(1), names = bySystem.get(sys)!
    return !names.length || !sys ? names.join(', ') || sys : names.length === 1 ? `${names[0]} (${sys})` : `${sys}: ${names.join(', ')}`
  }).join(' · ')
}

export interface QuestPlaces {
  /** Places per step, in step order; step 1 also holds the offer station or start area. */
  steps: Place[][]
  unresolved: { step: number; place: Unresolved }[]
}

/** Every place a quest names, per step. Order destinations and ship stops that name no known place are pilots, not problems. */
export function questPlaces(q: QuestContent, resolve: Resolver): QuestPlaces {
  const steps: Place[][] = q.steps.map(() => [])
  const unresolved: QuestPlaces['unresolved'] = []
  const systems = new Set<string>()
  const pending: { step: number; kind: Unresolved['kind']; role: PlaceRole; name: string; quiet?: boolean }[] = []
  const want = (step: number, kind: Unresolved['kind'], role: PlaceRole, name: string, quiet = false) => { if (name && name !== 'OWN') pending.push({ step, kind, role, name, quiet }) }

  const s = q.settings
  if (s.startMode === 'bar') want(0, 'station', 'offer', s.stationName)
  q.steps.forEach((step, i) => {
    for (const [raw, role] of [[step.finishWhen, 'arrive'], ...step.failWhen.map((f) => [f, 'fail'])] as [string | null, PlaceRole][]) {
      if (!raw) continue
      const { def, param } = parseCondition(raw)
      if (def?.param === 'system' || def?.param === 'station' || def?.param === 'planet') want(i, def.param, role, param)
      if (def?.param === 'shipStop') {
        const place = param.split('_at_')[1]
        if (place && place !== 'player') want(i, 'station', 'order', place, true)
      }
    }
    const m = step.mission
    if (m) {
      want(i, 'station', 'missionHome', m.homeStation)
      if (m.targetStation) want(i, 'station', 'missionTarget', m.targetStation)
      if (m.targetSystem && missionNeedsSystem(m)) want(i, 'system', 'missionTarget', m.targetSystem)
    }
    for (const o of step.orders) if (o.target && o.target !== 'player') want(i, 'station', 'order', o.target, true)
  })

  // Systems and stations first, so planet names can be matched against the systems this quest visits.
  const lookup = (p: (typeof pending)[number]) => (p.kind === 'system' ? resolve.system(p.name) : p.kind === 'station' ? resolve.station(p.name) : resolve.planet(p.name, systems))
  const found = new Map<(typeof pending)[number], Point | null>()
  for (const p of pending) if (p.kind !== 'planet') { const at = lookup(p); found.set(p, at); if (at) systems.add(at.system) }
  for (const p of pending) if (p.kind === 'planet') found.set(p, lookup(p))

  if (s.startMode !== 'bar' && q.steps.length) {
    steps[0].push({ kind: 'area', role: 'start', name: '', x: s.pointX, y: s.pointY, r: s.radius, system: '', source: 'catalogue' })
  }
  for (const p of pending) {
    const at = found.get(p)
    if (!at && p.kind === 'station' && p.quiet) {
      const sys = resolve.system(p.name) ?? resolve.planet(p.name, systems)
      if (sys) steps[p.step].push({ ...sys, kind: 'system', role: p.role, name: p.name })
      continue
    }
    if (!at) {
      if (!p.quiet && !unresolved.some((u) => u.step === p.step && u.place.name === p.name)) unresolved.push({ step: p.step, place: { kind: p.kind, role: p.role, name: p.name } })
      continue
    }
    if (steps[p.step].some((o) => o.kind === p.kind && o.name === p.name)) continue
    steps[p.step].push({ ...at, kind: p.kind, role: p.role, name: p.name })
  }
  return { steps, unresolved }
}

export interface RouteSegment { from: number; to: number; kind: 'next' | 'choice'; label?: string; back: boolean; via: number[] }

/**
 * Step edges between steps that have places. An edge into a step without places continues through it to the next
 * placed steps, keeping the first edge's kind and label and listing the steps passed in `via`.
 */
export function placeRoutes(q: QuestContent, places: QuestPlaces): RouteSegment[] {
  const { edges } = stepGraph(q.steps)
  const placed = (i: number) => places.steps[i].length > 0
  const out: RouteSegment[] = []
  const seen = new Set<string>()
  q.steps.forEach((_, from) => {
    if (!placed(from)) return
    for (const first of edges.filter((e) => e.from === from)) {
      const visited = new Set<number>()
      const stack: [number, number[]][] = [[first.to, []]]
      while (stack.length) {
        const [n, via] = stack.pop()!
        if (visited.has(n)) continue
        visited.add(n)
        if (placed(n)) {
          const key = `${from}-${n}-${first.kind}-${first.label ?? ''}`
          if (!seen.has(key)) { seen.add(key); out.push({ from, to: n, kind: first.kind, label: first.label, back: n <= from, via }) }
          continue
        }
        for (const e of edges) if (e.from === n) stack.push([e.to, [...via, n]])
      }
    }
  })
  return out
}

export interface RouteLeg { x1: number; y1: number; x2: number; y2: number; route: RouteSegment; first: boolean }
export interface Waypoint { step: number; x: number; y: number }

/**
 * Lines and waypoints for routes. A route through placeless steps runs through one waypoint per step, spaced along the
 * route or, when both ends share a place, lifted `lift` ly above it so a round trip never reads as a loop. A forward
 * route with no waypoints between two steps at one place draws nothing: the shared pin already lists both steps.
 * A placeless step on several routes keeps its first waypoint.
 */
export function routeLegs(routes: RouteSegment[], places: QuestPlaces, lift: number) {
  const legs: RouteLeg[] = []
  const waypoints = new Map<number, Waypoint>()
  for (const r of routes) {
    const a = places.steps[r.from][places.steps[r.from].length - 1], b = places.steps[r.to][0]
    const same = a.x === b.x && a.y === b.y
    if (same && !r.back && !r.via.length) continue
    const n = r.via.length
    const points = [{ x: a.x, y: a.y }, ...r.via.map((step, k) => {
      const w = waypoints.get(step) ?? (same
        ? { step, x: a.x + (k - (n - 1) / 2) * lift, y: a.y + lift }
        : { step, x: a.x + ((b.x - a.x) * (k + 1)) / (n + 1), y: a.y + ((b.y - a.y) * (k + 1)) / (n + 1) })
      waypoints.set(step, w)
      return w
    }), { x: b.x, y: b.y }]
    for (let k = 1; k < points.length; k++) legs.push({ x1: points[k - 1].x, y1: points[k - 1].y, x2: points[k].x, y2: points[k].y, route: r, first: k === 1 })
  }
  return { legs, waypoints: [...waypoints.values()] }
}

/** Light years between two map points: the flat map's X and Y, as jump range and the explored test use. */
export const distanceLy = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

/** A ship's jump range before boosters never exceeds this (`ShipInfo.CalcJump`). */
export const ONE_JUMP_LY = 150

export interface SeriesQuest {
  key: string
  modId: string
  modTitle: string
  title: string
  questId: number
  requires: number[]
  /** Distinct places in step order, consecutive repeats merged. */
  beats: Place[]
  unresolved: Unresolved[]
}

export interface SeriesGate { from: string; to: string }

/** Quests as ordered beats, plus the follow-up gates between quests in the set. */
export function seriesPlaces(quests: { key: string; modId: string; modTitle: string; title: string; content: QuestContent }[], resolve: Resolver) {
  const out: SeriesQuest[] = quests.map(({ key, modId, modTitle, title, content }) => {
    const qp = questPlaces(content, resolve)
    const beats: Place[] = []
    for (const p of qp.steps.flat()) {
      const last = beats[beats.length - 1]
      if (last && last.x === p.x && last.y === p.y && (last.r ?? 0) === (p.r ?? 0)) continue
      beats.push(p)
    }
    return { key, modId, modTitle, title, questId: content.settings.questId, requires: content.settings.requiredQuestIds, beats, unresolved: qp.unresolved.map((u) => u.place) }
  })
  const byId = new Map<number, SeriesQuest[]>()
  for (const q of out) byId.set(q.questId, [...(byId.get(q.questId) ?? []), q])
  const gates: SeriesGate[] = []
  for (const q of out) for (const id of q.requires) for (const r of byId.get(id) ?? []) if (r !== q) gates.push({ from: r.key, to: q.key })
  return { quests: out, gates }
}

/** Place keys used by quests of more than one mod. */
export function sharedPlaces(quests: SeriesQuest[]) {
  const mods = new Map<string, Set<string>>()
  for (const q of quests) for (const b of q.beats) {
    if (b.kind === 'area') continue
    const k = b.system
    let set = mods.get(k)
    if (!set) mods.set(k, set = new Set())
    set.add(q.modId)
  }
  return new Set([...mods].filter(([, s]) => s.size > 1).map(([k]) => k))
}
