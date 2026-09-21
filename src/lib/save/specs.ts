/** The five figures the game prints above a ship's modules (`ui/screens/ModulesShopScreen.as:198`):
 * hull, shields, jump range, total mass and speed.
 *
 * Every formula is `ShipInfo`'s own: the mass (`objects/Ships/ShipInfo.as:409-430`), the jump
 * (`:860-875 CalcJump`), the speed (`:664-684`), the shields (`:700-724`) and the hull
 * (`:444-460`). An engineer level moves several of them, because a module's boost is its
 * category's `_upgradeMax` times level over 25 (`system/modules/ModuleUpgradeBoost.as:56-61`,
 * applied at `ShipInfo.as:1103-1113`), and the drive's boost multiplies both terms of the jump.
 */
import { AmfObject, CARGO, type AmfVector, type Save } from './codec'
import { levelOf, upgradeTypeOf } from './engineer'
import { MAIN_CATEGORIES, moduleVector, type ModuleRec, type ShipRec } from './rules'

/** `ModuleUpgrades.MakeUpgrades` (`system/modules/ModuleUpgrades.as:19-335`), as the export
 * carries it: the boost a module of this category and upgrade type reaches at level 25. */
export interface Upgrade { category: string; type: number; boost: Record<string, number> }

/** The physical figures a hull carries (`objects/Ships/ShipType.as`). */
export type ShipSpecs = ShipRec & { mass: number; hull: number; shields: number; speedMax: number }
/** A module, with the stats the formulas read (`save-data.json`). */
export type ModuleStats = ModuleRec & { mass: number; stats: Record<string, number> }

export interface Specs { hull: number; shields: number; jump: number; mass: number; massMax: number; speed: number }

/** `MathE.erf`, with the game's own constants (0.25482952, not the textbook 0.254829592). */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const a = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * a)
  return sign * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.25482952)
    * t * Math.exp(-a * a))
}

/** `ModuleGrade` (`system/modules/ModuleGrade.as:6-14`), the multiplier the speed uses. */
const GRADE_VALUE: Record<string, number> = { E: 1, D: 2, C: 3, B: 4, A: 5 }

/** One module's boost at its level: nothing at level 0 or with no modification chosen
 * (`ShipInfo.as:1103`). */
export function boostOf(mod: ModuleStats | null, level: number, upgradeType: number, upgrades: Upgrade[]): Record<string, number> {
  if (!mod || !level || !upgradeType) return {}
  const found = upgrades.find((u) => u.category === mod.subtype && u.type === upgradeType)
  if (!found) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(found.boost)) out[k] = v * (level / 25)
  return out
}

const at = (boost: Record<string, number> | null | undefined, field: string) => boost?.[field] ?? 0
const stat = (mod: ModuleStats | null, field: string) => mod?.stats[field] ?? 0

/** A fit, as the formulas need it: one entry per slot, the boost each module carries, the cargo
 * the hold is counted as holding and the fuel in the tank. */
export interface Fit {
  ship: ShipSpecs
  mods: (ModuleStats | null)[]
  boosts: (Record<string, number> | null)[]
  cargo: number
  /** Null takes the tank as full, which is what a ship leaves the yard with (`BaseShip.as:37`). */
  fuel: number | null
}

const of = (mods: (ModuleStats | null)[], category: string) => mods.filter((m) => m?.category === category) as ModuleStats[]

export function computeSpecs({ ship, mods, boosts, cargo, fuel }: Fit): Specs {
  const hullMod = mods[MAIN_CATEGORIES.indexOf('Hull')]
  const thrusters = mods[MAIN_CATEGORIES.indexOf('Thrusters')]
  const drive = mods[MAIN_CATEGORIES.indexOf('DeepSpaceDrive')]
  const tank = mods[MAIN_CATEGORIES.indexOf('FuelTank')]

  // `MassCalc`: the hull multiplies the ship's own mass, within four fifths and twice it.
  const hullMass = Math.min(Math.max(ship.mass * (1 + stat(hullMod, 'massMultiplier')), ship.mass * 0.8), ship.mass * 2)
  const massTotal = mods.reduce((n, m, i) => n + (m ? m.mass * (1 + at(boosts[i], 'mass')) : 0), hullMass)

  const fuelMax = stat(tank, 'tank')
  const held = fuel === null || fuel < 0 ? fuelMax : Math.min(fuel, fuelMax)
  const fullCargo = of(mods, 'CargoRack').reduce((n, m) => n + m.stats.capacity, 0)

  // `CalcJump(FuelMax, -1)`, the range on a full tank. No drive, no jump.
  let jump = 0
  if (drive) {
    const b = boosts[MAIN_CATEGORIES.indexOf('DeepSpaceDrive')]
    const raw = drive.stats.optimalMass * (1 + at(b, 'optimalMass')) / (massTotal + fuelMax + cargo)
      * Math.pow(1000 * (drive.stats.maxFuel * (1 + at(b, 'maxFuel')) / drive.stats.subClassMultiplier),
        1 / drive.stats.classConstant)
    jump = (raw > 150 ? 30 : raw) + (of(mods, 'DeepSpaceDriveBooster')[0]?.stats.jumpRange ?? 0)
  }

  // `SpeedMax_calc`: the thrusters' optimal mass against the hull, cargo and fuel only.
  const optimal = stat(thrusters, 'shipMassOptimal') * (1 + at(boosts[MAIN_CATEGORIES.indexOf('Thrusters')], 'shipMassOptimal'))
  const speed = thrusters
    ? Math.max(ship.speedMax * Math.sqrt(optimal / (hullMass + cargo + held)) * 0.0165
      * (1 + GRADE_VALUE[thrusters.grade] / 35 - 1 / 35), 0.5)
    : 0.5

  // `ShieldMax_calc`, then every booster's percentage of it.
  const shieldIndex = mods.findIndex((m) => m?.category === 'Shields')
  let shields = 0
  if (shieldIndex >= 0) {
    const sh = mods[shieldIndex]!
    const base = ship.shields * (0.53821 * erf(1.0228 * sh.stats.shieldOptimalMass / ship.mass)
      - 0.0588 * sh.stats.decr_koef + 0.56377) * (1 + at(boosts[shieldIndex], 'shieldStrength'))
    shields = base + base * of(mods, 'ShieldsBooster').reduce((n, m) => n + m.stats.boostPercent, 0) / 100
  }

  // `HullMax_calc`: the hull module's percentage, plus every reinforcement's points.
  const hull = ship.hull * (1 + stat(hullMod, 'hull'))
    + of(mods, 'HullReinforcement').reduce((n, m) => n + m.stats.hullPoints, 0)

  return { hull, shields, jump, mass: massTotal + cargo + held, massMax: massTotal + fullCargo + fuelMax, speed }
}

/** The goods the hold carries (`system/Save/CargoData.as:33-44`). */
const cargoTotal = (sv: Save) =>
  ((sv.objs[CARGO] as AmfObject).raw[2][1] as AmfVector).items.reduce((n: number, c) => n + Number(c), 0)

/** The fuel the tank module carries (`Module.as:30`, `ShipInfo.as:604-606`); a tank the game has
 * never filled reads -1 and the ship leaves the yard full. */
function tankFuel(sv: Save): number | null {
  const m = moduleVector(sv).items[MAIN_CATEGORIES.indexOf('FuelTank')]
  if (!(m instanceof AmfObject)) return null
  const b = m.raw[7][1] as Uint8Array
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getFloat64(0)
}

/** The specs of the ship the save is flying, with each module's engineer level applied. */
export function saveSpecs(sv: Save, ship: ShipSpecs, fitted: (ModuleStats | null)[], upgrades: Upgrade[]): Specs {
  const items = moduleVector(sv).items
  const boosts = fitted.map((mod, i) => {
    const m = items[i]
    if (!(m instanceof AmfObject)) return null
    const b = m.raw[12][1] as Uint8Array
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0)
    return boostOf(mod, levelOf(v), upgradeTypeOf(v), upgrades)
  })
  return computeSpecs({ ship, mods: fitted, boosts, cargo: cargoTotal(sv), fuel: tankFuel(sv) })
}

/** The strip's own wording and rounding (`ModulesShopScreen.as:198`; the units are
 * `Unit_shields`, `Unit_distanceYears`, `Unit_mass` and `Unit_speed` in `lang_en.json`). */
export const specCells = (s: Specs): [string, string][] => [
  ['Hull', String(Math.floor(s.hull))],
  ['Shields', `${Math.floor(s.shields)} MW`],
  ['Jump range', `${Math.floor(s.jump * 10) / 10} ly`],
  ['Total mass', `${Math.floor(s.mass)}/${Math.floor(s.massMax)} T`],
  ['Speed', `${Math.floor(s.speed * 10) / 10} ls/s`],
]
