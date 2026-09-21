/** The engineer and the craft materials: object 8 and object 5 `Module.priority_and_level`, and
 * object 7 `ExtraData.materials`.
 *
 * The engineer here works as if every required supply were in hand: it writes the level and the
 * upgrade type and never touches a material count (`system/modules/ModuleUpgrade.as:65,85` are the
 * check and the spend the editor skips). Material counts move only on the materials screen.
 */
import { AmfObject, EXTRA, type Save } from './codec'
import { extUtf } from './safety'
import { moduleVector, storedModules, type ModuleRec } from './rules'

// ------------------------------------------------------- priority_and_level

/** `Module.priority_and_level`, the last field a module writes (`system/modules/Module.as:320`).
 * Priority is bits 0-3 (`Module.as:277-283`), level bits 4-9 (`Module.as:287-293`) and upgrade
 * type bits 10-11 (`Module.as:297-303`). */
export const priorityOf = (v: number) => v & 0x0f
export const levelOf = (v: number) => (v >>> 4) & 0x3f
export const upgradeTypeOf = (v: number) => (v >>> 10) & 3

export const packLevel = (priority: number, level: number, upgradeType: number) =>
  (((upgradeType & 3) << 10) | ((level & 0x3f) << 4) | (priority & 0x0f)) >>> 0

/** `EngineerScreen.as:117`: the engineer refuses a module already at level 25. */
export const MAX_LEVEL = 25

/** `globalSettings.as:51 materialCountMax`. */
export const MATERIAL_MAX = 50

/** The 32 material counts, one signed byte each (`system/Save/ExtraData.as:18`, written at `:198`). */
export const MATERIAL_COUNT = 32

// ------------------------------------------------------- what each engineer offers

/** `ModuleUpgrades.MakeUpgrades` (`system/modules/ModuleUpgrades.as:19-335`), as
 * `save-data.json` carries it: what each module category can be modified into, the upgrade type
 * the save stores, the game's own name for it (`ModuleUpgrade.Name`, `ModuleUpgrade.as:35-41`)
 * and the boost at level 25.
 */
export interface ModuleUpgrade { category: string; type: number; name: string; boost: Record<string, number> }

/** The table the game builds once at start-up (`ModuleUpgrades.as:15-18`); the screens fill it
 * from `save-data.json` the same way. */
let TABLE: ModuleUpgrade[] = []

export const makeUpgrades = (list: ModuleUpgrade[]) => { TABLE = list }

/** What some engineer can do to this module category, in the table's order. */
export const upgradesFor = (category: string) => TABLE.filter((u) => u.category === category)

/** The game's name for one modification, or nothing where the module carries none. */
export const upgradeName = (category: string, type: number) =>
  TABLE.find((u) => u.category === category && u.type === type)?.name ?? ''

/** The engineer who takes a module type furthest, `levels_max * 5` (`EngineerScreen.as:116`,
 * tables at `system/modules/Engineer.as:62-96`), and who that engineer is. */
export const ENGINEER_CAP: Record<string, { engineer: string; cap: number }> = {
  LifeSupport: { engineer: 'Edmond Anger', cap: 25 },
  Sensors: { engineer: 'Edmond Anger', cap: 25 },
  PowerPlant: { engineer: 'Olivia Hopper', cap: 15 },
  PowerDistributor: { engineer: 'Edmond Anger', cap: 15 },
  DeepSpaceDrive: { engineer: 'Dr Landau', cap: 25 },
  Shields: { engineer: 'Dr Landau', cap: 25 },
  GaussWeapon: { engineer: 'Dr Landau', cap: 15 },
  Thrusters: { engineer: 'Olivia Hopper', cap: 25 },
  PulseLaserWeapon: { engineer: 'Kaito', cap: 15 },
  LaserWeapon: { engineer: 'Kaito', cap: 15 },
  RailgunWeapon: { engineer: 'Kaito', cap: 15 },
  TitanLanceWeapon: { engineer: 'Kaito', cap: 15 },
  PlasmaGunWeapon: { engineer: 'Kaito', cap: 15 },
  CannonWeapon: { engineer: 'Dina', cap: 15 },
  MissileWeapon: { engineer: 'Dina', cap: 15 },
  FragmentCannonWeapon: { engineer: 'Dina', cap: 15 },
  TorpedoWeapon: { engineer: 'Dina', cap: 15 },
}

// ------------------------------------------------------- the modules the engineer works on

/** A module the engineer can reach: on the ship (object 8) or in storage (object 5). */
export interface Upgradeable {
  where: 'ship' | 'storage'
  index: number
  module: AmfObject
  subtype: string
  mod: ModuleRec | null
  priority: number
  level: number
  upgradeType: number
}

const raw = (m: AmfObject) => {
  const b = m.raw[12][1] as Uint8Array
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0)
}

/** The three packed fields of one module. */
export const moduleBits = (m: AmfObject) => {
  const v = raw(m)
  return { priority: priorityOf(v), level: levelOf(v), upgradeType: upgradeTypeOf(v) }
}

const entry = (m: AmfObject, where: 'ship' | 'storage', index: number, names: Map<string, ModuleRec>): Upgradeable => {
  const v = raw(m)
  const subtype = extUtf(m, 0)
  return {
    where, index, module: m, subtype,
    mod: names.get(`${subtype}.${extUtf(m, 1)}`) ?? null,
    priority: priorityOf(v), level: levelOf(v), upgradeType: upgradeTypeOf(v),
  }
}

/** Every module of a type some engineer upgrades, on the ship then in storage. */
export function upgradeables(sv: Save, names: Map<string, ModuleRec>): Upgradeable[] {
  const out: Upgradeable[] = []
  const scan = (items: unknown[], where: 'ship' | 'storage') =>
    items.forEach((m, i) => {
      if (m instanceof AmfObject && upgradesFor(extUtf(m, 0)).length) out.push(entry(m, where, i, names))
    })
  scan(moduleVector(sv).items, 'ship')
  scan(storedModules(sv).items, 'storage')
  return out
}

const write = (m: AmfObject, value: number) => {
  const b = new DataView(new ArrayBuffer(4))
  b.setUint32(0, value >>> 0)
  m.raw[12] = ['u', new Uint8Array(b.buffer)]
}

/** Sets the level, keeping priority and upgrade type. Refuses a level above 25
 * (`EngineerScreen.as:117`). */
export function setLevel(m: AmfObject, level: number): boolean {
  if (!Number.isInteger(level) || level < 0 || level > MAX_LEVEL) return false
  const v = raw(m)
  write(m, packLevel(priorityOf(v), level, upgradeTypeOf(v)))
  return true
}

/** Sets the upgrade type. A different type resets the level to 1
 * (`EngineerScreen.as:214-216`); the same type leaves the level alone. */
export function setUpgradeType(m: AmfObject, upgradeType: number): boolean {
  if (!Number.isInteger(upgradeType) || upgradeType < 0 || upgradeType > 3) return false
  const v = raw(m)
  if (upgradeTypeOf(v) === upgradeType) return true
  write(m, packLevel(priorityOf(v), 1, upgradeType))
  return true
}

/** One level, the engineer's own step (`EngineerScreen.as:186-188`, without the spend). */
export function addLevel(m: AmfObject, upgradeType: number): boolean {
  const v = raw(m)
  if (upgradeTypeOf(v) !== upgradeType) return setUpgradeType(m, upgradeType)
  return setLevel(m, levelOf(v) + 1)
}

// ------------------------------------------------------- craft materials

/** The 32 counts, in `CraftMaterial` declaration order (`system/CraftMaterials/CraftMaterial.as:16-128`). */
export function materialCounts(sv: Save): number[] {
  const extra = sv.objs[EXTRA] as AmfObject
  const out: number[] = []
  for (let i = 0; i < MATERIAL_COUNT; i++) {
    const b = extra.raw[i][1] as Uint8Array
    out.push(new DataView(b.buffer, b.byteOffset, b.byteLength).getInt8(0))
  }
  return out
}

/** Grants a material outright, clamped to 0 to 50 (`globalSettings.as:51`). */
export function setMaterial(sv: Save, id: number, count: number): boolean {
  if (!Number.isInteger(id) || id < 0 || id >= MATERIAL_COUNT) return false
  const n = Math.max(0, Math.min(MATERIAL_MAX, Math.round(count)))
  ;(sv.objs[EXTRA] as AmfObject).raw[id] = ['b', new Uint8Array([n])]
  return true
}

/** The whole ladder applied: the module's first modification where it carries none, and level 25
 * (`EngineerScreen.as:117`). Nothing is spent and no material is consumed. Reports whether the
 * module moved. */
export function applyBest(m: AmfObject): boolean {
  const options = upgradesFor(extUtf(m, 0))
  if (!options.length) return false
  const v = raw(m)
  const upgradeType = upgradeTypeOf(v) || options[0].type
  if (upgradeTypeOf(v) === upgradeType && levelOf(v) === MAX_LEVEL) return false
  write(m, packLevel(priorityOf(v), MAX_LEVEL, upgradeType))
  return true
}

/** The engineer's ladder applied to a module that carries no modification yet
 * (`Module.as:297-303`: upgrade type 0). A module that carries one keeps whatever level the save
 * holds, including a level the reader lowered or cleared. Reports whether the module moved. */
export function applyBestIfUnmodified(m: AmfObject): boolean {
  if (upgradeTypeOf(raw(m)) !== 0) return false
  return applyBest(m)
}

/** A module the engineer has taken as far as it goes. A type no engineer works on is at its best
 * already. */
export function atBest(m: AmfObject): boolean {
  if (!upgradesFor(extUtf(m, 0)).length) return true
  const v = raw(m)
  return levelOf(v) === MAX_LEVEL && upgradeTypeOf(v) > 0
}

/** `ShipsManager.ApplyShipModulesByLevel` (`universe/Managers/ShipsManager.as:842-889`) gives
 * each category the priority the game sheds it at when the draw passes what the plant makes: 3
 * goes first, then 2, then 1 (`system/modules/Modules.as:327-346`). A category the game does not
 * name keeps the `Module` default (`system/modules/Module.as:44`). */
let PRIORITIES: Record<string, number> = {}
export const DEFAULT_PRIORITY = 1

export const makePriorities = (table: Record<string, number>) => { PRIORITIES = table }

export const priorityFor = (category: string) => PRIORITIES[category] ?? DEFAULT_PRIORITY

/** Writes the priority the game would give this module, keeping its level and modification. */
export function setPriority(m: AmfObject, priority: number): boolean {
  const v = raw(m)
  if (priorityOf(v) === priority) return false
  write(m, packLevel(priority, levelOf(v), upgradeTypeOf(v)))
  return true
}

/** Every fitted module at the priority its category carries, so the game sheds a scanner or a
 * booster before it sheds the shields. */
export function setPriorities(items: unknown[]): number {
  let moved = 0
  for (const m of items) {
    if (m instanceof AmfObject && setPriority(m, priorityFor(extUtf(m, 0)))) moved++
  }
  return moved
}

/** A module row's engineer state, in the game's own words: the level and the modification's name
 * in square brackets, and nothing at all where the module carries no modification. */
export function engineerLabel(category: string, level: number, upgradeType: number): string {
  const name = upgradeName(category, upgradeType)
  return name ? ` [${level} ${name}]` : ''
}
