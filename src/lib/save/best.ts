/** What "the best there is" means for each thing the magic wand sits beside, and how to set it.
 *
 * Every entry is a pair: whether the save already holds the best, and the write that puts it
 * there. Nothing here trades one advantage against another, which is why the hull, the cargo and
 * shield choices and the ship itself have no entry.
 */
import { AmfObject, getCredits, setCredits, type Save } from './codec'
import {
  ARENA_LEVELS, BATTLE, DISCOVERY, ELITE, KARMA_MAX, REPUTATION_MAX, TRADE, arena, karma,
  progressOf, reputationOf, setKarma, setArena, setProgress, setReputation, stationRows,
} from './record'
import { MATERIAL_COUNT, MATERIAL_MAX, applyBest, atBest, setMaterial } from './engineer'
import {
  bestModule, buildSlots, canPlace, fittedModules, install, moduleVector,
  type ModuleRec, type ShipRec, type Slot,
} from './rules'
import { markExplored, visitedCells, cellOf, type Position } from './position'
import { setHullFull } from './ships'
import { hullMax } from './specs'

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

export const karmaAtBest = (sv: Save) => karma(sv) >= KARMA_MAX
export const arenaAtBest = (sv: Save) => arena(sv) >= ARENA_MAX
export const reputationAtBest = (row: AmfObject) => reputationOf(row) >= REPUTATION_MAX

export const setKarmaBest = (sv: Save) => setKarma(sv, KARMA_MAX)
export const setArenaBest = (sv: Save) => setArena(sv, ARENA_MAX)
export const setReputationBest = (row: AmfObject) => setReputation(row, REPUTATION_MAX)

/** `arenaLVL` indexes `ArenaLevel.Levels`, 83 of them (`ui/screens/ShipInfoScreen.as:230`). */
export const ARENA_MAX = ARENA_LEVELS - 1

export const recordAtBest = (sv: Save) =>
  karmaAtBest(sv) && arenaAtBest(sv) && stationRows(sv).every(reputationAtBest)
  && RANK_FIELDS.every((f) => rankAtBest(sv, f))

export function setRecordBest(sv: Save) {
  setKarmaBest(sv)
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

/** Every slot of the ship in use at its best. */
export function shipAtBest(sv: Save, ship: ShipRec, mods: ModuleRec[], keys: Map<string, ModuleRec>,
  names: Map<string, ModuleRec>): boolean {
  const fitted = fittedModules(sv, names)
  return hullAtBest(sv, ship, fitted)
    && buildSlots(ship, keys).every((slot) => slotAtBest(sv, slot, ship, fitted, mods, keys))
}

export function setShipBest(sv: Save, ship: ShipRec, mods: ModuleRec[], keys: Map<string, ModuleRec>,
  names: Map<string, ModuleRec>) {
  for (const slot of buildSlots(ship, keys)) {
    setSlotBest(sv, slot, ship, fittedModules(sv, names), mods, keys)
  }
  repairHull(sv, ship, fittedModules(sv, names))
}

/** The hull module's integrity is the ship's own hull value (`system/modules/Modules.as:118`), so
 * a damaged ship reads as damaged however good its other modules are. Which hull is fitted is a
 * choice of armour and is left alone; only the damage goes. */
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
