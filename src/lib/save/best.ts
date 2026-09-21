/** What "the best there is" means for each thing the magic wand sits beside, and how to set it.
 *
 * Every entry is a pair: whether the save already holds the best, and the write that puts it
 * there. Nothing here trades one advantage against another, which is why the hull, the cargo and
 * shield choices and the ship itself have no entry.
 */
import { AmfObject, AmfVector, EXTRA, PROGRESS, getCredits, setCredits, type Save } from './codec'
import { MATERIAL_COUNT, MATERIAL_MAX, applyBest, atBest, setMaterial } from './engineer'
import {
  bestModule, buildSlots, canPlace, fittedModules, install, moduleVector,
  type ModuleRec, type ShipRec, type Slot,
} from './rules'
import { markExplored, visitedCells, cellOf, type Position } from './position'

/** Below the `uint` ceiling on purpose: a balance near 2^31 goes negative as soon as the player
 * earns more. */
export const CREDITS_BEST = 2_000_000_000

/** `ProgressData.AddStationReputation` clamps at 100 (`system/Save/ProgressData.as:292-294`). */
export const REPUTATION_MAX = 100
/** `ExtraData.AddKarma` clamps at 100 (`system/Save/ExtraData.as:83-85`). */
export const KARMA_MAX = 100
/** `arenaLVL` indexes `ArenaLevel.Levels`, 83 of them (`ui/screens/ShipInfoScreen.as:230`). */
export const ARENA_MAX = 82

/** `ExtraData` writes 32 material counts, then karma, drunk, fleetMode, arenaLVL
 * (`system/Save/ExtraData.as:194-204`). */
const KARMA = 32, ARENA = 35
const REPUTATION = 0

const extra = (sv: Save) => sv.objs[EXTRA] as AmfObject
const byteOf = (o: AmfObject, i: number) => {
  const b = o.raw[i][1] as Uint8Array
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getInt8(0)
}
const f64 = (n: number) => {
  const v = new DataView(new ArrayBuffer(8))
  v.setFloat64(0, n)
  return new Uint8Array(v.buffer)
}

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

export const karma = (sv: Save) => byteOf(extra(sv), KARMA)
export const arena = (sv: Save) => new DataView(
  (extra(sv).raw[ARENA][1] as Uint8Array).buffer,
  (extra(sv).raw[ARENA][1] as Uint8Array).byteOffset, 1).getUint8(0)

const reputations = (sv: Save) => ((sv.objs[PROGRESS] as AmfObject).raw[REPUTATION][1] as AmfVector).items
  .filter((r): r is AmfObject => r instanceof AmfObject)

export const reputationOf = (row: AmfObject) => {
  const b = row.raw[1][1] as Uint8Array
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getFloat64(0)
}

export const reputationAtBest = (row: AmfObject) => reputationOf(row) >= REPUTATION_MAX
export const setReputationBest = (row: AmfObject) => { row.raw[1] = ['D', f64(REPUTATION_MAX)] }
export const setKarmaBest = (sv: Save) => { extra(sv).raw[KARMA] = ['b', new Uint8Array([KARMA_MAX]) ] }
export const setArenaBest = (sv: Save) => { extra(sv).raw[ARENA] = ['b', new Uint8Array([ARENA_MAX]) ] }

export const recordAtBest = (sv: Save) =>
  karma(sv) >= KARMA_MAX && arena(sv) >= ARENA_MAX && reputations(sv).every(reputationAtBest)

export function setRecordBest(sv: Save) {
  setKarmaBest(sv)
  setArenaBest(sv)
  reputations(sv).forEach(setReputationBest)
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
  return buildSlots(ship, keys).every((slot) => slotAtBest(sv, slot, ship, fitted, mods, keys))
}

export function setShipBest(sv: Save, ship: ShipRec, mods: ModuleRec[], keys: Map<string, ModuleRec>,
  names: Map<string, ModuleRec>) {
  for (const slot of buildSlots(ship, keys)) {
    setSlotBest(sv, slot, ship, fittedModules(sv, names), mods, keys)
  }
}

// ------------------------------------------------------- the galaxy

export const systemAtBest = (sv: Save, at: Position) => visitedCells(sv).has(cellOf(at))
export const setSystemBest = (sv: Save, at: Position) => markExplored(sv, at)
