/** Ships: the shop, the price arithmetic and the hangar.
 *
 * An owned ship is `Type`, `Station`, `Modules`, `color` (`system/Save/ShipData.as:12-18`). The
 * ship in use is object 8 and the hangar is object 4, `Save._ships` (`system/Save/Save.as:30`).
 * The loader hands an entry whose `Station` is empty to `_shipCurrent` and splices it out of the
 * hangar (`Save.as:387-398`), so every hangar entry here carries a station name.
 */
import {
  AmfObject, AmfVector, HANGAR, SHIP, STATION, getCredits, setCredits, type AmfValue, type ExtField, type Save,
} from './codec'
import { BALANCE_MAX, extUtf, shipStation } from './safety'
import { buildSlots, byKey, makeModule, moduleVector, shipData, shipKey, type ModuleRec, type ShipRec, type Slot } from './rules'

const utf = (s: string) => {
  const b = new TextEncoder().encode(s)
  const o = new Uint8Array(b.length + 2)
  new DataView(o.buffer).setUint16(0, b.length)
  o.set(b, 2)
  return o
}

/** `save-data.json` carries a ship's price and its whole overview table; `ShipRec` types only the
 * part the module rules need, so the ship screens read it through this. */
export type ShipItem = ShipRec & {
  baseCost: number
  overview: ShipRec['overview'] & {
    sold?: boolean
    purpose: string
    icon: string
    price: number
    core: (string | number)[][]
    optional: (string | number)[][]
  }
}

/** A price as the tables print it ("8,020 CR"). */
export const priceOf = (m: ModuleRec) => parseInt(m.price.replace(/\D/g, ''), 10) || 0

const spec = (ship: ShipItem, name: string) =>
  Number(ship.overview.specs.find((s) => s[0] === name)?.[1] ?? 0)

// ------------------------------------------------------- the shop

/** `ShipType.GetAvailableShips` (`objects/Ships/ShipType.as:275-300`) offers the types with no
 * faction requirement plus those the station's faction allows; a type flagged unsold is never in
 * the list. The editor's fake station has no faction, so the shop is every saleable type. */
export const shopShips = (ships: ShipItem[]) => ships.filter((s) => s.overview.sold !== false)

/** `ShipType.baseCost` (`objects/Ships/ShipType.as:222`). */
export const shipPrice = (ship: ShipItem) => ship.baseCost

// ------------------------------------------------------- the default loadout

/** `overview.core` rows, in the order `tools/port/ship_overview.py` writes them. */
const CORE_CATEGORIES = ['PowerPlant', 'PowerDistributor', 'DeepSpaceDrive', 'LifeSupport',
  'FuelTank', 'Thrusters', 'Sensors']

/** The modules the `Modules` constructor fits to a fresh hull (`system/modules/Modules.as:102-190`):
 * the hull, one default per main slot, and the default shields and optional modules the game drops
 * into the remaining slots. `overview.core` and `overview.optional` carry those defaults, the
 * second already in slot order. */
export function defaultLoadout(ship: ShipItem, slots: Slot[], mods: ModuleRec[]): (ModuleRec | null)[] {
  const core = new Map(ship.overview.core.map((row, i) => [CORE_CATEGORIES[i], String(row[2])]))
  const keys = byKey(mods)
  const byName = new Map(mods.map((m) => [m.name.toUpperCase(), m]))

  return slots.map((slot, i) => {
    if (slot.restriction === 'Main') {
      if (slot.category === 'Hull') return keys.get(ship.defaultHull ?? '') ?? null
      const className = core.get(slot.category ?? '')
      return mods.find((m) => m.category === slot.category && m.className === className) ?? null
    }
    // Slots 8 and up line up one for one with the optional-module table.
    const dflt = String(ship.overview.optional[i - 8]?.[2] ?? '')
    return byName.get(dflt.toUpperCase()) ?? null
  })
}

/** `Modules.as:118`: the hull module's integrity is the ship's hull rating times the hull type's
 * own percentage, and `MakePlayerShip` leaves a new ship at full hull
 * (`universe/Managers/ShipsManager.as:351`). A module whose integrity disagrees loads the ship
 * damaged (`tools/bin/gg_save.py:695`). */
export function hullIntegrity(ship: ShipItem, hull: ModuleRec | null): number {
  const pct = parseFloat(hull?.params.find((p) => p[0] === 'Hull')?.[1] ?? '100') || 100
  return spec(ship, 'Hull') * (pct / 100)
}

// ------------------------------------------------------- writing a ShipData

/** One `Module`, with the hull slot's integrity forced to the ship's own hull value. */
const moduleFor = (ship: ShipItem, mod: ModuleRec, slot: Slot): AmfObject => {
  const o = makeModule(mod, null)
  if (slot.index === 0) o.raw[2] = ['D', (() => {
    const b = new DataView(new ArrayBuffer(8))
    b.setFloat64(0, hullIntegrity(ship, mod))
    return new Uint8Array(b.buffer)
  })()]
  return o
}

/** A fresh `ShipData` for `ship`, carrying its default loadout (`MakePlayerShip`,
 * `universe/Managers/ShipsManager.as:323-364`). `station` is empty for the ship in use and the
 * station's name for a hangar entry. */
export function newShipData(sv: Save, ship: ShipItem, mods: ModuleRec[], station: string): AmfObject {
  const slots = buildSlots(ship, byKey(mods))
  const loadout = defaultLoadout(ship, slots, mods)
  const old = moduleVector(sv)
  const items = slots.map((slot) => {
    const mod = loadout[slot.index]
    return mod ? (moduleFor(ship, mod, slot) as AmfValue) : null
  })

  const o = new AmfObject('ShipData', false, true)
  o.raw = [
    ['U', utf(ship.key)],
    ['U', utf(station)],
    ['O', new AmfVector(old.kind, items, old.fixed, old.cls)],
    shipData(sv).raw[3],
  ] as ExtField[]
  return o
}

// ------------------------------------------------------- prices

/** `ShipsManager.CalcCurrShipCost` (`universe/Managers/ShipsManager.as:973-1005`): four fifths of
 * the hull's price, plus seven tenths of every module past the eight main slots, less what the
 * ship's own default weapon and optional modules cost. */
export function tradeIn(ship: ShipItem, fitted: (ModuleRec | null)[], slots: Slot[], mods: ModuleRec[]): number {
  let n = Math.trunc(ship.baseCost * 0.8)
  for (let i = 8; i < fitted.length; i++) if (fitted[i]) n += Math.trunc(priceOf(fitted[i]!) * 0.7)
  for (const d of defaultLoadout(ship, slots, mods).slice(8)) if (d) n -= priceOf(d)
  return Math.max(0, n)
}

// ------------------------------------------------------- the hangar

export const hangarVector = (sv: Save) => sv.objs[HANGAR] as AmfVector
export const hangarShips = (sv: Save) => hangarVector(sv).items.filter((s): s is AmfObject => s instanceof AmfObject)

/** The name the editor's fake station goes by. A save already naming a station keeps that name;
 * otherwise the player's own station, and failing that the name the garage screen itself falls
 * back to (`ui/screens/GarageScreen.as:110`). */
export function fakeStation(sv: Save): string {
  const held = hangarShips(sv).map(shipStation).find(Boolean)
  return held || extUtf(sv.objs[STATION] as AmfObject, 1) || 'Thunder Station'
}

const setStation = (s: AmfObject, name: string) => { s.raw[1] = ['U', utf(name)] }

/**
 * Buys `ship`. `keep` pushes the old ship into the hangar and spends the full price
 * (`ui/screens/ShipShopDetailsScreen.as:489-491`); otherwise the old ship is traded in and its
 * value is credited first (`:514-515`).
 */
export function buyShip(sv: Save, ship: ShipItem, mods: ModuleRec[], keep: boolean, tradeInValue = 0) {
  const old = shipData(sv)
  const station = fakeStation(sv)
  if (keep) {
    setStation(old, station)
    hangarVector(sv).items.push(old)
  }
  const balance = getCredits(sv) + (keep ? 0 : tradeInValue) - shipPrice(ship)
  setCredits(sv, Math.min(Math.max(0, balance), BALANCE_MAX))
  sv.objs[SHIP] = newShipData(sv, ship, mods, '')
}

/** `GarageScreen.as:200-203`: the ship in use goes to the hangar at this station and the chosen
 * hangar entry takes its place. */
export function useShip(sv: Save, index: number) {
  const items = hangarVector(sv).items
  const chosen = items[index]
  if (!(chosen instanceof AmfObject)) return
  const old = shipData(sv)
  setStation(old, fakeStation(sv))
  setStation(chosen, '')
  items.splice(index, 1, old)
  sv.objs[SHIP] = chosen
}

/** `GarageScreen.as:353-357`: the entry leaves the hangar and its value is credited. */
export function sellShip(sv: Save, index: number, value: number) {
  hangarVector(sv).items.splice(index, 1)
  setCredits(sv, Math.min(getCredits(sv) + value, BALANCE_MAX))
}

/** Adds a ship to the hangar without spending anything, at the station the loader needs. */
export function addToHangar(sv: Save, ship: ShipItem, mods: ModuleRec[]) {
  hangarVector(sv).items.push(newShipData(sv, ship, mods, fakeStation(sv)))
}

/** What a hangar entry is worth, for the list and the sell action. */
export function hangarValue(entry: AmfObject, ships: ShipItem[], mods: ModuleRec[], names: Map<string, ModuleRec>): number {
  const ship = ships.find((s) => s.key === extUtf(entry, 0))
  if (!ship) return 0
  const slots = buildSlots(ship, byKey(mods))
  const fitted = (entry.raw[2][1] as AmfVector).items.map((m) =>
    m instanceof AmfObject ? names.get(`${extUtf(m, 0)}.${extUtf(m, 1)}`) ?? null : null)
  return tradeIn(ship, fitted, slots, mods)
}

/** The ship in use, as a table record. */
export const currentShip = (sv: Save, ships: ShipItem[]) => ships.find((s) => s.key === shipKey(sv)) ?? null
