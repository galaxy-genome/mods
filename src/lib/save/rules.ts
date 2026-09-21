/** The module rules, ported from the game.
 *
 * A ship's slots are one flat array built from its vectors (`system/modules/Modules.as:48-190`),
 * and a slot index here is the index the save stores: `ShipData.Modules` becomes
 * `ModulesBlocks` unchanged (`universe/Managers/ShipsManager.as:278`), nulls and all.
 */
import { AmfObject, AmfVector, SHIP, STORAGE, type AmfValue, type ExtField, type Save } from './codec'
import { extUtf } from './safety'
import { priorityFor } from './engineer'

// ------------------------------------------------------- the data tables

export interface ModuleRec {
  key: string
  /** `BaseModule.category._typeName`, the first field a save writes (`system/modules/Module.as:308`). */
  subtype: string
  /** The module line, as `moduleCards` keys it. */
  line: string
  category: string
  /** `BaseModule.type`, the slot class this module asks for (`system/modules/BaseModule.as:12`). */
  slotType: SlotType
  /** `BaseModule.mClassName`, the second field a save writes. */
  className: string
  mClass: number
  grade: string
  singleton: boolean
  name: string
  icon: string
  price: string
  params: [string, string][]
  /** `BaseModule.integrity`, when the export carries it. */
  integrity?: number
  /** `BaseModule.mass`, the term `MassCalc` sums (`objects/Ships/ShipInfo.as:425`). */
  mass: number
  /** `BaseModule.power`, drawn while the module is on (`system/modules/Modules.as:269`). */
  power: number
  /** A module the power budget can switch off (`Modules.as:265`). */
  switchable: boolean
  /** The per-category figures `ShipInfo`'s formulas read (`lib/save/specs.ts`). */
  stats: Record<string, number>
}

export interface ShipRec {
  key: string
  optional: number[]
  optionalMilitary: number[]
  weapons: number[]
  external: number[]
  maxDSD: number
  maxThrusters: number
  maxPowerPlant: number
  maxPowerDistributor: number
  maxTank: number
  defaultLifeSupport: string | null
  defaultSensors: string | null
  defaultHull: string | null
  maxFighterHangar: string | null
  /** The hull's own physical figures (`objects/Ships/ShipType.as`). */
  mass: number
  hull: number
  shields: number
  speedMax: number
  /** `mnvr`, which sets how fast the hull turns (`objects/Ships/Ship.as:277`). */
  mnvr: number
  overview: { name: string; specs: [string, string | number][] }
}

export type SlotType = 'Main' | 'Weapon' | 'External' | 'Military' | 'Optional'

export interface Slot {
  index: number
  /** `Modules.ModulesRestriction[i]` (`Modules.as:34`). */
  restriction: SlotType
  /** `Modules.ModulesSizeMax[i]` (`Modules.as:40`). */
  sizeMax: number
  /** For a main slot, the one category it takes. */
  category?: string
}

/** Slots 0 to 7, in the order `Modules.as:102-116` fills them. */
export const MAIN_CATEGORIES = ['Hull', 'PowerPlant', 'Thrusters', 'PowerDistributor',
  'DeepSpaceDrive', 'LifeSupport', 'FuelTank', 'Sensors']

/** `ModuleType` as the screens name it (`lang_en.json`, `ModuleTypeName*`). */
export const SLOT_NAME: Record<SlotType, string> = {
  Main: 'Main', Weapon: 'Weapon', External: 'External', Military: 'Military', Optional: 'Optional',
}

/** `ModuleGrade`, worst to best (`system/modules/ModuleGrade.as:6-14`). */
export const GRADES = ['E', 'D', 'C', 'B', 'A']

export const byKey = (mods: ModuleRec[]) => new Map(mods.map((m) => [m.key, m]))
/** A save names a module by category and class (`system/modules/Module.as:342-355`). */
export const bySaveName = (mods: ModuleRec[]) => new Map(mods.map((m) => [`${m.subtype}.${m.className}`, m]))

// ------------------------------------------------------- slots

/** The flat slot array the `Modules` constructor builds (`Modules.as:48-190`). */
export function buildSlots(ship: ShipRec, mods: Map<string, ModuleRec>): Slot[] {
  const out: Slot[] = []
  const add = (restriction: SlotType, sizeMax: number, category?: string) =>
    out.push({ index: out.length, restriction, sizeMax, category })

  const mClass = (key: string | null) => (key && mods.get(key)?.mClass) || 1
  // `Modules.as:102-117`: the hull slot is size one, life support and sensors take their own class.
  const mains = [1, ship.maxPowerPlant, ship.maxThrusters, ship.maxPowerDistributor, ship.maxDSD,
    mClass(ship.defaultLifeSupport), ship.maxTank, mClass(ship.defaultSensors)]
  mains.forEach((max, i) => add('Main', max, MAIN_CATEGORIES[i]))

  const run = (counts: number[], type: SlotType) =>
    counts.forEach((n, i) => { for (let k = 0; k < n; k++) add(type, i + 1) })

  run(ship.weapons, 'Weapon')     // `Modules.as:141-142`
  run(ship.external, 'External')  // `Modules.as:156-157`
  // Military slots of a size come before the optional slots of that size (`Modules.as:167-186`).
  ship.optional.forEach((n, i) => {
    for (let k = 0; k < (ship.optionalMilitary[i] ?? 0); k++) add('Military', i + 1)
    for (let k = 0; k < n; k++) add('Optional', i + 1)
  })
  return out
}

// ------------------------------------------------------- does this module fit this slot

/** `BuySellModuleScreen.as:505`: a module larger than the slot is refused. */
export const fitsSize = (mod: ModuleRec, slot: Slot) => mod.mClass <= slot.sizeMax

/** `GetAvailableModules.as:337-352`: a main slot takes its own category, every other slot takes its
 * own type, and Military modules also fit an Optional slot. */
export function fitsType(mod: ModuleRec, slot: Slot): boolean {
  if (slot.restriction === 'Main') return mod.slotType === 'Main' && mod.category === slot.category
  if (slot.restriction === 'Optional' && mod.slotType === 'Military') return true
  return mod.slotType === slot.restriction
}

/** `ModulesAvailableScreen.as:316-325`: a fighter hangar needs a hull that carries one, of at
 * least this class. */
export function fitsHangar(mod: ModuleRec, ship: ShipRec, mods: Map<string, ModuleRec>): boolean {
  if (mod.category !== 'FighterHangar') return true
  if (!ship.maxFighterHangar) return false
  return mod.mClass <= (mods.get(ship.maxFighterHangar)?.mClass ?? 0)
}

/** `BuySellModuleScreen.as:510-520`: a singleton module may sit in one slot only. */
export const singletonFree = (mod: ModuleRec, fitted: (ModuleRec | null)[], slot: Slot) =>
  !mod.singleton || !fitted.some((m, i) => m?.category === mod.category && i !== slot.index)

/** Every test the game applies before it installs a module. Power is not one of them: it is a
 * runtime budget (`Modules.as:249,:260`), and mass moves speed only (`ShipInfo.as:670`). */
export function canPlace(mod: ModuleRec, slot: Slot, ship: ShipRec, fitted: (ModuleRec | null)[], mods: Map<string, ModuleRec>) {
  return fitsSize(mod, slot) && fitsType(mod, slot) && fitsHangar(mod, ship, mods) && singletonFree(mod, fitted, slot)
}

// ------------------------------------------------------- the best module a slot can hold

/** `ShipsManager.GetModuleByGrade` (`universe/Managers/ShipsManager.as:897-910`): the largest
 * module of this category and grade that the slot's maximum class allows. */
export function getModuleByGrade(mods: ModuleRec[], category: string, grade: string, maxClass: number): ModuleRec | null {
  let best: ModuleRec | null = null
  for (const m of mods) {
    if (m.category !== category || m.grade !== grade) continue
    if (m.mClass <= maxClass && m.mClass > (best?.mClass ?? 0)) best = m
  }
  return best
}

/** The best module of a category a slot can hold: grade A where the category has one, and the
 * best grade it does have otherwise, since fuel tanks are all grade C and hulls all grade E. */
export const bestModule = (mods: ModuleRec[], category: string, maxClass: number): ModuleRec | null =>
  GRADES.slice().reverse().map((g) => getModuleByGrade(mods, category, g, maxClass)).find(Boolean) ?? null

/** A placement the convenience buttons propose: the slot and what goes in it. */
export interface Fill { slot: Slot; mod: ModuleRec }

/** One pass of the game's own rule over the slots `want` picks: the best module of the first
 * category that fits, `ModulesSizeMax[slot]` as its ceiling. An empty `categories` means the
 * slot's own category, which only a main slot has. */
function fill(slots: Slot[], want: (slot: Slot) => boolean, categories: string[], ship: ShipRec,
  fitted: (ModuleRec | null)[], mods: ModuleRec[], keys: Map<string, ModuleRec>): Fill[] {
  const out: Fill[] = []
  const after = fitted.slice()
  for (const slot of slots) {
    if (!want(slot)) continue
    for (const category of categories.length ? categories : [slot.category ?? '']) {
      const mod = bestModule(mods, category, slot.sizeMax)
      if (!mod || !canPlace(mod, slot, ship, after, keys)) continue
      out.push({ slot, mod })
      after[slot.index] = mod
      break
    }
  }
  return out
}

/** Max all: the best module each main slot can hold. The hull slot is left alone: a hull is a
 * choice of armour rather than a grade ladder, and its integrity is the ship's own hull value
 * (`Modules.as:118`), so replacing it loads the ship damaged. */
export const maxAll = (slots: Slot[], ship: ShipRec, fitted: (ModuleRec | null)[], mods: ModuleRec[], keys: Map<string, ModuleRec>) =>
  fill(slots, (s) => s.restriction === 'Main' && s.index > 0, [], ship, fitted, mods, keys)

/** Max storage, Max shield enhancements, Max hull enhancements: the same rule over every empty
 * optional slot, restricted to one category. */
export const maxCategory = (category: string, slots: Slot[], ship: ShipRec, fitted: (ModuleRec | null)[], mods: ModuleRec[], keys: Map<string, ModuleRec>) =>
  fill(slots, (s) => s.restriction === 'Optional' && !fitted[s.index], [category], ship, fitted, mods, keys)

/** Zentarks: the Zentarks cannon (`system/modules/ZenLaserWeapon.as:8-22`) in every empty weapon
 * slot, and the Shadow jump module (`system/modules/ZentarksShadowModule.as:8`) in an optional one. */
export const maxZentarks = (slots: Slot[], ship: ShipRec, fitted: (ModuleRec | null)[], mods: ModuleRec[], keys: Map<string, ModuleRec>) =>
  fill(slots, (s) => s.restriction === 'Weapon' && !fitted[s.index], ['ZenLaserWeapon'], ship, fitted, mods, keys)
    .concat(fill(slots, (s) => s.restriction === 'Optional' && !fitted[s.index], ['ZenShadowModule'], ship, fitted, mods, keys))

// ------------------------------------------------------- the save's module vectors

const u16 = (n: number) => { const b = new DataView(new ArrayBuffer(2)); b.setUint16(0, n); return new Uint8Array(b.buffer) }
const u32 = (n: number) => { const b = new DataView(new ArrayBuffer(4)); b.setUint32(0, n); return new Uint8Array(b.buffer) }
const i32 = (n: number) => { const b = new DataView(new ArrayBuffer(4)); b.setInt32(0, n); return new Uint8Array(b.buffer) }
const f64 = (n: number) => { const b = new DataView(new ArrayBuffer(8)); b.setFloat64(0, n); return new Uint8Array(b.buffer) }
const utf = (s: string) => { const b = new TextEncoder().encode(s); const o = new Uint8Array(b.length + 2); o.set(u16(b.length)); o.set(b, 2); return o }

export const shipData = (sv: Save) => sv.objs[SHIP] as AmfObject
/** `ShipData.Modules` (`system/Save/ShipData.as:16`), one entry per slot, null where empty. */
export const moduleVector = (sv: Save) => shipData(sv).raw[2][1] as AmfVector
export const shipKey = (sv: Save) => extUtf(shipData(sv), 0)

/** `ModulesStorage` is two parallel vectors, the modules and the station each was left at
 * (`system/Save/ModulesStorage.as`, `EXT.ModulesStorage = 'OO'`). */
export const storedModules = (sv: Save) => (sv.objs[STORAGE] as AmfObject).raw[0][1] as AmfVector
export const storedStations = (sv: Save) => (sv.objs[STORAGE] as AmfObject).raw[1][1] as AmfVector

/** The module fitted in each slot, by the table record, null where the slot is empty. */
export function fittedModules(sv: Save, names: Map<string, ModuleRec>): (ModuleRec | null)[] {
  return moduleVector(sv).items.map((m) => {
    if (!(m instanceof AmfObject)) return null
    return names.get(`${extUtf(m, 0)}.${extUtf(m, 1)}`) ?? null
  })
}

/** One `Module`, written in `writeExternal` order (`system/modules/Module.as:307-321`), fresh: a
 * module just installed is the module the purchase screen described, at full integrity with its
 * shields charged and no engineer level, whatever stood in the slot before it.
 *
 * ponytail: a module whose table row carries no `integrity` gets `FRESH_INTEGRITY`, which is
 * larger than any hull's, so the game reads it as undamaged.
 */
export const FRESH_INTEGRITY = 1e6

export function makeModule(mod: ModuleRec): AmfObject {
  const o = new AmfObject('Module', false, true)
  o.raw = [
    ['U', utf(mod.subtype)],
    ['U', utf(mod.className)],
    ['D', f64(mod.integrity ?? FRESH_INTEGRITY)],
    ['I', i32(1)],                               // ammo
    ['s', u16(9)],                               // weaponGroups, `Module.as:42`
    ['s', u16(0)],                               // totalAmmo
    ['B', new Uint8Array([0])],                  // needReset
    ['D', f64(-1)],                              // fuel, `Module.as:30`
    ['D', f64(1)],                               // shields, `Module.as:32`
    ['B', new Uint8Array([0])],                  // shieldsIsBroken
    ['B', new Uint8Array([1])],                  // IsOnManual
    ['B', new Uint8Array([1])],                  // IsOnAuto
    ['u', u32(priorityFor(mod.subtype))],        // priority_and_level, `Module.as:44`
  ] as ExtField[]
  return o
}

/** Installs `mod` in `slot`, and hands back the module it displaced. */
export function install(sv: Save, slot: Slot, mod: ModuleRec): AmfValue | null {
  const v = moduleVector(sv)
  const old = v.items[slot.index] ?? null
  v.items[slot.index] = makeModule(mod)
  return old instanceof AmfObject ? old : null
}

/** Empties a slot. */
export function removeModule(sv: Save, slot: Slot): AmfValue | null {
  const v = moduleVector(sv)
  const old = v.items[slot.index] ?? null
  v.items[slot.index] = null
  return old instanceof AmfObject ? old : null
}

/** Puts a module into storage at `station`, where the storage screen and the game both find it. */
export function putInStorage(sv: Save, module: AmfValue, station: string) {
  storedModules(sv).items.push(module)
  storedStations(sv).items.push(station)
}
