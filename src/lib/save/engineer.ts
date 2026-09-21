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

/** The upgrades a module type has, by `ModuleSubType`, with the upgrade type the save stores and
 * the game's name for it (`system/modules/ModuleUpgrades.as:19-335`, names `lang_en.json` `Mod*`). */
export const UPGRADES: Record<string, { type: number; name: string }[]> = {
  DeepSpaceDrive: [{ type: 1, name: 'Jump Range' }, { type: 2, name: 'Faster Boot' }],
  Sensors: [{ type: 1, name: 'Lightweight' }, { type: 2, name: 'Long Range' }],
  Thrusters: [{ type: 1, name: 'Clean Modification' }, { type: 2, name: 'Dirty Modification' }],
  PowerPlant: [{ type: 1, name: 'Power Generation' }],
  LifeSupport: [{ type: 1, name: 'Lightweight' }],
  PowerDistributor: [{ type: 1, name: 'Bandwidth to Cannons' }, { type: 2, name: 'Bandwidth to Engines' }, { type: 3, name: 'Bandwidth to System' }],
  Shields: [{ type: 1, name: 'Low Power' }, { type: 2, name: 'Rapid Charge' }],
  CannonWeapon: [{ type: 1, name: 'Charging mechanism' }, { type: 2, name: 'Armor-piercing' }, { type: 3, name: 'Aimed shooting' }],
  FragmentCannonWeapon: [{ type: 1, name: 'Shutter durability' }],
  MissileWeapon: [{ type: 1, name: 'Explosive power' }, { type: 2, name: 'Charging mechanism' }],
  TorpedoWeapon: [{ type: 1, name: 'Explosive power' }, { type: 2, name: 'Charging mechanism' }],
  LaserWeapon: [{ type: 1, name: 'Emitter power' }, { type: 2, name: 'Aimed shooting' }],
  PulseLaserWeapon: [{ type: 1, name: 'Emitter power' }, { type: 2, name: 'Capacitor capacitance' }],
  RailgunWeapon: [{ type: 1, name: 'Length of rails' }, { type: 2, name: 'Conductive elements' }],
  TitanLanceWeapon: [{ type: 1, name: 'Emitter power' }],
  PlasmaGunWeapon: [{ type: 1, name: 'Peltier elements' }, { type: 2, name: 'Emitter power' }],
  GaussWeapon: [{ type: 1, name: 'Emitter power' }],
}

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
      if (m instanceof AmfObject && UPGRADES[extUtf(m, 0)]) out.push(entry(m, where, i, names))
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
  const options = UPGRADES[extUtf(m, 0)]
  if (!options) return false
  const v = raw(m)
  const upgradeType = upgradeTypeOf(v) || options[0].type
  if (upgradeTypeOf(v) === upgradeType && levelOf(v) === MAX_LEVEL) return false
  write(m, packLevel(priorityOf(v), MAX_LEVEL, upgradeType))
  return true
}

/** A module the engineer has taken as far as it goes. A type no engineer works on is at its best
 * already. */
export function atBest(m: AmfObject): boolean {
  if (!UPGRADES[extUtf(m, 0)]) return true
  const v = raw(m)
  return levelOf(v) === MAX_LEVEL && upgradeTypeOf(v) > 0
}
