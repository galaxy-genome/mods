// Where the places a mod names come from: the game, the mod itself, or another mod. Pure; works on stored mod JSON too.
import { parseCondition } from './conditions'
import { BODIES, GAME_QUEST_ID_MAX, GAME_QUEST_ID_MIN, STATIONS, SYSTEMS } from './reference'
import type { ModMeta, Planet, QuestContent, ModStation, Requirement, Star } from './types'

export type PlaceKind = 'system' | 'station' | 'planet'

/** The fields of a mod this module reads; a `Mod` or its stored record. */
export interface PlaceSource {
  meta: Pick<ModMeta, 'id' | 'title' | 'version' | 'favorite'> & { community?: { entryId: string }; requires?: Requirement[] }
  quests: { primaryLang: string; versions: Record<string, QuestContent | undefined> }[]
  stars: { stars: Star[]; planets: Planet[]; stations: ModStation[] } | null
}

/** A generated system name: zone, sector pair, quadrant letter and number. */
export const GENERATED = /^(.+) ([^ ][a-z])-([^ ][a-z]) ([B-E])(\d+)$/

export const gameSystemTest = (catalogue?: { has(name: string): boolean }) => (name: string) =>
  !!catalogue?.has(name) || SYSTEMS.some((s) => s.name === name) || STATIONS.some((s) => s.system === name) || GENERATED.test(name)

const isGameStation = (name: string) => STATIONS.some((s) => s.name === name)
const isGamePlanet = (name: string, system?: string) =>
  system ? !!BODIES[system]?.some((b) => b.kind === 'Planet' && b.name === name) : Object.values(BODIES).some((list) => list.some((b) => b.kind === 'Planet' && b.name === name))

export interface ModAdds { systems: string[]; stations: string[]; planets: string[]; quests: string[] }

export const sortedNames = (names: Iterable<string>) => [...new Set(names)].sort()
const addsCache = new WeakMap<PlaceSource, ModAdds>()
/** The names a mod adds to the game: its stars, stations and planets, and its quests' IDs. Cached per mod object. */
export function addsOf(src: PlaceSource): ModAdds {
  const hit = addsCache.get(src)
  if (hit) return hit
  const s = src.stars
  const adds = {
    systems: sortedNames(s?.stars.map((x) => x.name) ?? []),
    stations: sortedNames(s?.stations.map((x) => x.name) ?? []),
    planets: sortedNames(s?.planets.map((x) => x.name) ?? []),
    quests: sortedNames(src.quests.flatMap((q) => { const id = q.versions[q.primaryLang]?.settings.questId; return id === undefined ? [] : [String(id)] })),
  }
  addsCache.set(src, adds)
  return adds
}

const has = (src: PlaceSource, kind: PlaceUse['kind'], name: string): boolean => {
  const a = addsOf(src)
  if (kind === 'quest') return a.quests.includes(name)
  if (kind === 'system') return a.systems.includes(name)
  if (kind === 'station') return a.stations.includes(name)
  if (kind === 'planet') return a.planets.includes(name)
  return a.systems.includes(name) || a.stations.includes(name) || a.planets.includes(name)
}

export const requirementOf = (m: PlaceSource): Requirement => ({
  modId: m.meta.id, title: m.meta.title, ...(m.meta.version ? { version: m.meta.version } : {}), ...(m.meta.community ? { entryId: m.meta.community.entryId } : {}),
})

/** A requirement names a mod by id, or by library entry so it survives reinstalls and new versions. */
export const satisfies = (r: Requirement, m: PlaceSource) => r.modId === m.meta.id || (!!r.entryId && m.meta.community?.entryId === r.entryId)

/** One name a quest uses. `any` is an order destination or ship stop, which may also be a pilot; `quest` is a required quest ID. */
export interface PlaceUse { kind: PlaceKind | 'any' | 'quest'; name: string; path: string; field: string }

export function questPlaceUses(q: QuestContent): PlaceUse[] {
  const out: PlaceUse[] = []
  const use = (kind: PlaceUse['kind'], name: string | undefined, path: string, field: string) => { if (name && name !== 'OWN' && name !== 'player') out.push({ kind, name, path, field }) }
  if (q.settings.startMode === 'bar') use('station', q.settings.stationName, 'overview', 'stationName')
  for (const id of q.settings.requiredQuestIds) if (id !== 0 && (id < GAME_QUEST_ID_MIN || id > GAME_QUEST_ID_MAX)) use('quest', String(id), 'overview', 'requiredQuestIds')
  for (const step of q.steps) {
    const path = `steps/${step.id}`
    for (const [raw, field] of [[step.finishWhen, 'finishWhen'], ...step.failWhen.map((f) => [f, 'failWhen'])] as [string | null, string][]) {
      if (!raw) continue
      const { def, param } = parseCondition(raw)
      if (def?.param === 'system' || def?.param === 'station' || def?.param === 'planet') use(def.param, param, path, field)
      if (def?.param === 'shipStop') use('any', param.split('_at_')[1], path, field)
    }
    const m = step.mission
    if (m) {
      use('station', m.homeStation, `${path}/mission`, 'homeStation')
      use('station', m.targetStation, `${path}/mission`, 'targetStation')
      use('system', m.targetSystem, `${path}/mission`, 'targetSystem')
    }
    for (const o of step.orders) use('any', o.target, `${path}/orders/${o.id}`, 'target')
  }
  return out
}

export interface Dependency { requirement: Requirement; source: PlaceSource; uses: PlaceUse[] }

/**
 * Other mods whose places or quests `mod` uses: every station, system, planet or required quest ID that neither the
 * game nor the mod itself provides but another mod does. Several providers: one already required wins, then a favorite, then the first.
 */
export function modDependencies(mod: PlaceSource, all: PlaceSource[], isGameSystem = gameSystemTest()): Dependency[] {
  const others = all.filter((m) => m.meta.id !== mod.meta.id)
  const requires = mod.meta.requires ?? []
  const out = new Map<string, Dependency>()
  for (const q of mod.quests) {
    const content = q.versions[q.primaryLang]
    if (!content) continue
    for (const u of questPlaceUses(content)) {
      if (has(mod, u.kind, u.name)) continue
      if ((u.kind === 'system' || u.kind === 'any') && isGameSystem(u.name)) continue
      if ((u.kind === 'station' || u.kind === 'any') && isGameStation(u.name)) continue
      if ((u.kind === 'planet' || u.kind === 'any') && isGamePlanet(u.name)) continue
      const providers = others.filter((m) => has(m, u.kind, u.name))
      const source = providers.find((m) => requires.some((r) => satisfies(r, m))) ?? providers.find((m) => m.meta.favorite) ?? providers[0]
      if (!source) continue
      const dep = out.get(source.meta.id) ?? { requirement: requires.find((r) => satisfies(r, source)) ?? requirementOf(source), source, uses: [] }
      dep.uses.push(u)
      out.set(source.meta.id, dep)
    }
  }
  return [...out.values()]
}

export interface PlaceOption { name: string; system?: string; x?: number; y?: number; security?: string | null; faction?: string; type?: string; mod?: PlaceSource }

/**
 * What a place picker offers for `mod`. Systems: the catalogue and this mod's stars. Stations: the game's and this
 * mod's (within `system` when given). Planets: bodies of `system` from reference data, and this mod's (all of them without `system`). `others` lists
 * what other mods add, per mod, leaving out names already offered.
 */
export function placeOptions(kind: PlaceKind, mod: PlaceSource | null, all: PlaceSource[], opts: { catalogue?: PlaceOption[]; system?: string } = {}) {
  const sys = opts.system
  const game: PlaceOption[] = kind === 'system' ? opts.catalogue ?? SYSTEMS.map((s) => ({ name: s.name, x: s.x, y: s.y, security: s.security }))
    : kind === 'station' ? STATIONS.filter((s) => !sys || s.system === sys).map((s) => ({ name: s.name, system: s.system, faction: s.faction }))
    : sys ? (BODIES[sys] ?? []).filter((b) => b.kind === 'Planet' && b.name).map((b) => ({ name: b.name, system: sys, type: b.type })) : []
  const of = (m: PlaceSource): PlaceOption[] => {
    const s = m.stars
    if (!s) return []
    if (kind === 'system') return s.stars.map((x) => ({ name: x.name, x: x.x, y: x.y, security: x.security, mod: m }))
    if (kind === 'station') return s.stations.filter((x) => !sys || x.system === sys).map((x) => ({ name: x.name, system: x.system, faction: x.faction as string, mod: m }))
    return s.planets.filter((x) => !sys || x.system === sys).map((x) => ({ name: x.name, system: x.system, type: x.type, mod: m }))
  }
  const own = mod ? of(mod) : []
  const taken = new Set([...game, ...own].map((o) => o.name))
  const others = all
    .filter((m) => m.meta.id !== mod?.meta.id)
    .map((m) => ({ mod: m, options: of(m).filter((o) => !taken.has(o.name)) }))
    .filter((x) => x.options.length)
  return { game, own, others }
}

/** `ids` plus every mod they require, following requirements of requirements; cycles end where a mod repeats. */
export function withRequired(ids: string[], mods: PlaceSource[]): string[] {
  const out = new Set(ids)
  const queue = [...ids]
  while (queue.length) {
    const id = queue.pop()
    const mod = mods.find((m) => m.meta.id === id)
    for (const r of mod?.meta.requires ?? []) {
      const found = mods.find((m) => m.meta.id === r.modId) ?? mods.find((m) => satisfies(r, m))
      if (found && !out.has(found.meta.id)) { out.add(found.meta.id); queue.push(found.meta.id) }
    }
  }
  return [...out]
}
