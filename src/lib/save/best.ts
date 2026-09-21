/** What "the best there is" means for each thing the magic wand sits beside, and how to set it.
 *
 * Every entry is a pair: whether the save already holds the best, and the write that puts it
 * there. Nothing here trades one advantage against another, which is why the hull, the cargo and
 * shield choices and the ship itself have no entry.
 */
import { AmfObject, AmfVector, getCredits, setCredits, type Save } from './codec'
import {
  ARENA_LEVELS, BATTLE, DISCOVERY, ELITE, REPUTATION_MAX, TRADE, arena, progressOf, reputationOf,
  setArena, setProgress, setReputation, stationRows,
} from './record'
import { MATERIAL_COUNT, MATERIAL_MAX, allUpgrades, applyBest, atBest, levelOf, setMaterial, setPriorities, upgradeTypeOf } from './engineer'
import {
  ammoOf,
  bestModule, buildSlots, byKey, bySaveName, canPlace, cloneShipData, fittedIn, install,
  installIn, moduleVector, modulesOf, sameModules,
  type ModuleRec, type ShipRec, type Slot,
} from './rules'
import { markExplored, visitedCells, cellOf, type Position } from './position'
import { defaultLoadout, setHullFull, type ShipItem } from './ships'
import { boostOf, computeSpecs, hullMax } from './specs'

/** Below the `uint` ceiling on purpose: a balance near 2^31 goes negative as soon as the player
 * earns more. */
export const CREDITS_BEST = 2_000_000_000

// ------------------------------------------------------- credits

export const creditsAtBest = (sv: Save) => getCredits(sv) >= CREDITS_BEST
export const setCreditsBest = (sv: Save) => setCredits(sv, CREDITS_BEST)

// ------------------------------------------------------- craft materials

export const materialAtBest = (count: number) => count >= MATERIAL_MAX
export const materialsAtBest = (counts: number[]) => counts.every(materialAtBest)
export const setMaterialsBest = (sv: Save) => {
  for (let i = 0; i < MATERIAL_COUNT; i++) setMaterial(sv, i, MATERIAL_MAX)
}

// ------------------------------------------------------- the record

/** The three rank ladders' Elite band is a strict greater-than
 * (`ui/screens/MissionsShipScreen.as:601`), so the best there is sits one point past it. */
export const eliteBest = (field: number) =>
  (field === TRADE ? ELITE.trade : field === BATTLE ? ELITE.combat : ELITE.exploration) + 1

export const RANK_FIELDS = [TRADE, BATTLE, DISCOVERY]

export const rankAtBest = (sv: Save, field: number) => progressOf(sv, field) >= eliteBest(field)
export const setRankBest = (sv: Save, field: number) => setProgress(sv, field, eliteBest(field))

/** Karma has no best. A pirate station refuses an Idolized or Liked pilot and an anarchy system
 * refuses an Idolized one, while high security refuses a Despised one
 * (`ui/screens/MissionsScreen.as:899-909`, bands at `system/Ranks/MoralityRanks.as:8-16`), so
 * each end of the ladder is better at something and the choice is the reader's. */
export const arenaAtBest = (sv: Save) => arena(sv) >= ARENA_MAX
export const reputationAtBest = (row: AmfObject) => reputationOf(row) >= REPUTATION_MAX

export const setArenaBest = (sv: Save) => setArena(sv, ARENA_MAX)
export const setReputationBest = (row: AmfObject) => setReputation(row, REPUTATION_MAX)

/** `arenaLVL` indexes `ArenaLevel.Levels`, 83 of them (`ui/screens/ShipInfoScreen.as:230`). */
export const ARENA_MAX = ARENA_LEVELS - 1

export const recordAtBest = (sv: Save) =>
  arenaAtBest(sv) && stationRows(sv).every(reputationAtBest)
  && RANK_FIELDS.every((f) => rankAtBest(sv, f))

export function setRecordBest(sv: Save) {
  setArenaBest(sv)
  stationRows(sv).forEach(setReputationBest)
  RANK_FIELDS.forEach((f) => setRankBest(sv, f))
}

// ------------------------------------------------------- modules

/** The Zentarks cannon, the best a weapon slot takes (`system/modules/ZenLaserWeapon.as:8-22`,
 * "Zentarks cannon", `lang_en.json:4382`). */
export const ZENTARK = 'ZenLaserWeapon'

/** The best module a slot can hold: the Zentarks cannon in a weapon slot, and otherwise the top
 * grade of the category already there, or of the slot's own category.
 *
 * An empty optional slot has none: cargo, shields and hull reinforcement are each better at
 * something, so the reader chooses.
 */
export function slotBest(slot: Slot, ship: ShipRec, fitted: (ModuleRec | null)[],
  mods: ModuleRec[], keys: Map<string, ModuleRec>): ModuleRec | null {
  // The hull is a choice of armour, not a grade ladder, and its integrity is the ship's own.
  if (slot.index === 0) return null
  const category = slot.restriction === 'Weapon'
    ? ZENTARK
    : fitted[slot.index]?.category ?? (slot.restriction === 'Main' ? slot.category : null)
  const best = category ? bestModule(mods, category, slot.sizeMax) : null
  return best && (fitted[slot.index]?.key === best.key || canPlace(best, slot, ship, fitted, keys)) ? best : null
}

/** A slot holding the best module of its kind, taken as far as the engineer takes it. */
export function slotAtBest(sv: Save, slot: Slot, ship: ShipRec, fitted: (ModuleRec | null)[],
  mods: ModuleRec[], keys: Map<string, ModuleRec>): boolean {
  const best = slotBest(slot, ship, fitted, mods, keys)
  if (!best) return true
  if (fitted[slot.index]?.key !== best.key) return false
  const m = moduleVector(sv).items[slot.index]
  return m instanceof AmfObject ? atBest(m) : false
}

/** Fits the best module a slot takes and applies the engineer's whole ladder to it. */
export function setSlotBest(sv: Save, slot: Slot, ship: ShipRec, fitted: (ModuleRec | null)[],
  mods: ModuleRec[], keys: Map<string, ModuleRec>): boolean {
  const best = slotBest(slot, ship, fitted, mods, keys)
  if (!best) return false
  if (fitted[slot.index]?.key !== best.key) install(sv, slot, best)
  const m = moduleVector(sv).items[slot.index]
  if (m instanceof AmfObject) applyBest(m)
  return true
}

/** The largest class this category reaches anywhere in the table, which is how much room a
 * module of it can use. */
const ceiling = (mods: ModuleRec[], category: string) =>
  mods.reduce((n, m) => (m.category === category ? Math.max(n, m.mClass) : n), 0)

/** Filler: the categories whose job is to occupy whatever room is left rather than to hold a
 * particular slot, so they are the ones that yield when another module can use their slot. Every
 * other module keeps its slot or moves up. */
export const FILLER = ['CargoRack', 'HullReinforcement', 'ShieldsBooster']

/** The tables a fit reads, gathered once so a caller passes one thing. */
export interface Tables {
  mods: ModuleRec[]
  keys: Map<string, ModuleRec>
  names: Map<string, ModuleRec>
}

export const tablesOf = (mods: ModuleRec[]): Tables => ({ mods, keys: byKey(mods), names: bySaveName(mods) })

/**
 * One ship, made the best it can be: the ship being flown or an entry in the hangar, since both
 * are `ShipData` and the fit writes into that entry's own module vector.
 *
 * Each category the ship carries moves to the largest slot that can use it, every empty slot is
 * filled with the ship's own default for it or with filler, each module becomes the best of its
 * category the slot allows, the engineer's ladder is applied wherever an engineer works, each
 * module takes its category's priority, and the hull, the integrity and the shields are made
 * whole. Nothing but filler ever moves to a smaller slot.
 *
 * Running it twice changes nothing the second time, which is what makes the wand disappear.
 */
export function fitShip(entry: AmfObject, ship: ShipRec, t: Tables) {
  const { mods, keys, names } = t
  const slots = buildSlots(ship, keys)
  const vector = modulesOf(entry)

  // A main slot takes one category and a weapon slot has its own settled best, the Zentarks
  // cannon, so neither is part of the shuffle.
  for (const slot of slots) {
    if (slot.restriction !== 'Main' && slot.restriction !== 'Weapon') continue
    const best = slotBest(slot, ship, fittedIn(vector, names), mods, keys)
    if (!best) continue
    if (fittedIn(vector, names)[slot.index]?.key !== best.key) installIn(vector, slot, best)
    const m = vector.items[slot.index]
    if (m instanceof AmfObject) applyBest(m)
  }

  // The slots a category can move between only reach the slots of their own kind: an external
  // module has nowhere else to go, and a military slot takes less than an optional one.
  for (const group of [['External'], ['Optional', 'Military']] as const) {
    const fitted = fittedIn(vector, names)
    const here = slots.filter((s) => group.includes(s.restriction as never))
    const held = here.filter((s) => fitted[s.index]).map((slot) => ({ slot, mod: fitted[slot.index]! }))
    for (const slot of here) vector.items[slot.index] = null

    // The module that held the biggest slot picks first, so nothing is pushed down by a module
    // that had less to begin with; a singleton goes first among equals, having one slot only.
    const real = held.filter((h) => !FILLER.includes(h.mod.category))
      .sort((a, b) => b.slot.sizeMax - a.slot.sizeMax
        || Number(b.mod.singleton) - Number(a.mod.singleton)
        || ceiling(mods, b.mod.category) - ceiling(mods, a.mod.category))
    const filler = held.filter((h) => FILLER.includes(h.mod.category))
      .sort((a, b) => b.slot.sizeMax - a.slot.sizeMax)

    const free = [...here].sort((a, b) => b.sizeMax - a.sizeMax)
    const after: (ModuleRec | null)[] = fittedIn(vector, names)

    const put = (category: string, slot: Slot) => {
      const best = bestModule(mods, category, slot.sizeMax)
      if (!best || !canPlace(best, slot, ship, after, keys)) return false
      free.splice(free.indexOf(slot), 1)
      installIn(vector, slot, best)
      after[slot.index] = best
      const m = vector.items[slot.index]
      if (m instanceof AmfObject) applyBest(m)
      return true
    }

    /** The biggest slot left this category can use, never one smaller than `floor`. */
    const place = (category: string, floor: number) => {
      const slot = free.find((s) => s.sizeMax >= floor && put(category, s))
      return !!slot
    }

    // A module that is not filler keeps at least the slot it came from; filler takes what is
    // left, and takes a smaller slot where a module that can use more has claimed its own.
    for (const { mod, slot } of real) if (!place(mod.category, slot.sizeMax)) place(mod.category, 0)
    for (const { mod } of filler) place(mod.category, 0)

    // An empty slot takes the ship's own default for it (`objects/Ships/ShipType.as`), and
    // filler where the ship names none: a slot with nothing in it is a slot doing no work.
    const defaults = defaultLoadout(ship as ShipItem, slots, mods)
    for (const slot of free.slice()) {
      const own = defaults[slot.index]?.category
      if (own && put(own, slot)) continue
      FILLER.some((category) => put(category, slot))
    }
  }

  // Two slots of the same kind and size are interchangeable, so the modules in them are put in
  // one settled order. Without it a fit could swap them for another and never look finished.
  normalise(vector, slots, names)

  // The game switches modules off by priority when the draw passes what the plant makes, so the
  // ship leaves with the priorities the game itself would give it.
  setPriorities(vector.items)
  repairModules(vector, names)
  chargeShields(vector, ship, names)
  const hull = vector.items[0]
  if (hull instanceof AmfObject) setHullFull(hull, ship, fittedIn(vector, names))
}

/** The shield generator full. Its `shields` field is the charge in points, not a fraction
 * (`objects/Ships/ShipInfo.as:557`), and the game fills it to `ShieldMax` when a generator is
 * fitted (`system/modules/Modules.as:386`). Nothing clamps a larger charge outside a shield cell
 * (`universe/Managers/ShipsManager.as:4675`), so it is set to exactly the capacity the specs
 * give, with every module's engineer level applied. */
function chargeShields(vector: AmfVector, ship: ShipRec, names: Map<string, ModuleRec>) {
  const fitted = fittedIn(vector, names)
  const index = fitted.findIndex((m) => m?.category === 'Shields')
  const generator = vector.items[index]
  if (index < 0 || !(generator instanceof AmfObject)) return
  const boosts = vector.items.map((m: unknown, i: number) => {
    if (!(m instanceof AmfObject)) return null
    const b = m.raw[12][1] as Uint8Array
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0)
    return boostOf(fitted[i], levelOf(v), upgradeTypeOf(v), allUpgrades())
  })
  const { shields } = computeSpecs({ ship, mods: fitted, boosts, cargo: 0, fuel: null })
  generator.raw[8] = ['D', double(shields)]
}

/** Slots of one kind and size hold their modules in name order, which is what makes a fit land
 * in the same place every time it is run. */
function normalise(vector: AmfVector, slots: Slot[], names: Map<string, ModuleRec>) {
  const buckets = new Map<string, Slot[]>()
  for (const slot of slots) {
    if (slot.restriction === 'Main') continue
    const key = `${slot.restriction}.${slot.sizeMax}`
    buckets.set(key, [...(buckets.get(key) ?? []), slot])
  }
  for (const group of buckets.values()) {
    if (group.length < 2) continue
    const fitted = fittedIn(vector, names)
    const held = group.map((s) => vector.items[s.index])
    const order = group.map((s, i) => ({ at: i, key: fitted[s.index]?.key ?? '' }))
      .sort((a, b) => a.key.localeCompare(b.key))
    order.forEach(({ at }, i) => { vector.items[group[i].index] = held[at] })
  }
}

/** Every module whole: its own full integrity, its shields charged and not broken
 * (`system/modules/Module.as:192-193`, `:30-32`), and its rounds loaded and in reserve as the
 * game gives a module of its type (`ammoOf`), which is what buying supplies restores. */
export function repairModules(vector: AmfVector, names: Map<string, ModuleRec>) {
  const fitted = fittedIn(vector, names)
  vector.items.forEach((m: unknown, i: number) => {
    if (!(m instanceof AmfObject) || i === 0) return
    const mod = fitted[i]
    if (mod?.integrity !== undefined) m.raw[2] = ['D', double(mod.integrity)]
    if (mod) {
      const [ammo, total] = ammoOf(mod)
      m.raw[3] = ['I', int32(ammo)]
      m.raw[5] = ['s', uint16(total)]
    }
    m.raw[8] = ['D', double(1)]
    m.raw[9] = ['B', new Uint8Array([0])]
  })
}

const int32 = (n: number) => { const d = new DataView(new ArrayBuffer(4)); d.setInt32(0, n); return new Uint8Array(d.buffer) }
const uint16 = (n: number) => { const d = new DataView(new ArrayBuffer(2)); d.setUint16(0, n); return new Uint8Array(d.buffer) }

const double = (n: number) => {
  const d = new DataView(new ArrayBuffer(8))
  d.setFloat64(0, n)
  return new Uint8Array(d.buffer)
}

/** A ship already at its best, which is a ship a fit would leave alone. */
export function shipAtBest(entry: AmfObject, ship: ShipRec, t: Tables): boolean {
  const copy = cloneShipData(entry)
  fitShip(copy, ship, t)
  return sameModules(modulesOf(entry), modulesOf(copy))
}

/** The hull module's integrity is the ship's hull points (`objects/Ships/ShipInfo.as:306`,
 * `:449`), so a damaged ship reads as damaged however good its other modules are. Which hull is
 * fitted is a choice of armour and is left alone; only the damage goes. */
export function repairHull(sv: Save, ship: ShipRec, fitted: (ModuleRec | null)[]): boolean {
  const m = moduleVector(sv).items[0]
  if (!(m instanceof AmfObject) || hullAtBest(sv, ship, fitted)) return false
  setHullFull(m, ship, fitted)
  return true
}

/** A hull carrying fewer points than the ship's own `HullMax` (`ShipInfo.as:306`). */
export function hullAtBest(sv: Save, ship: ShipRec, fitted: (ModuleRec | null)[]): boolean {
  const m = moduleVector(sv).items[0]
  if (!(m instanceof AmfObject)) return true
  const b = m.raw[2][1] as Uint8Array
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getFloat64(0) >= hullMax(ship, fitted)
}

// ------------------------------------------------------- the galaxy

export const systemAtBest = (sv: Save, at: Position) => visitedCells(sv).has(cellOf(at))
export const setSystemBest = (sv: Save, at: Position) => markExplored(sv, at)
