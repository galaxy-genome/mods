/** Module storage, object 5 `ModulesStorage`: the `Modules` and `Station` vectors in step.
 *
 * A module moves between a slot and storage as the object the save already holds, so its
 * integrity, ammo, fuel and level travel with it.
 */
import { AmfObject, type AmfValue, type Save } from './codec'
import { extUtf } from './safety'
import {
  canPlace, moduleVector, putInStorage, shipData, storedModules, storedStations,
  type ModuleRec, type ShipRec, type Slot,
} from './rules'

/** One row of the storage list: where it sits in the vectors, what it is, and the station it
 * was left at (`ui/screens/ModulesStorageScreen.as:198-200`). */
export interface Stored {
  index: number
  module: AmfObject
  mod: ModuleRec | null
  station: string
}

/** The station a module put into storage is recorded at (`ModulesStorageScreen.as:591`). */
export const currentStation = (sv: Save) => extUtf(shipData(sv), 1)

/** The storage list. An entry the game would drop on sight, a null module or one whose type it
 * no longer knows (`ModulesStorageScreen.as:180-186`), carries a null `mod`. */
export function storedList(sv: Save, names: Map<string, ModuleRec>): Stored[] {
  const stations = storedStations(sv).items
  return storedModules(sv).items.map((m, index) => ({
    index,
    module: m as AmfObject,
    mod: m instanceof AmfObject ? names.get(`${extUtf(m, 0)}.${extUtf(m, 1)}`) ?? null : null,
    station: String(stations[index] ?? ''),
  }))
}

/** The entries a slot's Storage tab lists: its own type, its own category for a main slot, and
 * Military modules in an Optional slot (`ModulesStorageScreen.as:187-197`), within the slot's
 * size (`ModulesStorageScreen.as:229`). */
export const storedForSlot = (list: Stored[], slot: Slot, ship: ShipRec,
  fitted: (ModuleRec | null)[], keys: Map<string, ModuleRec>) =>
  list.filter((s) => s.mod && canPlace(s.mod, slot, ship, fitted, keys))

/** The slots a stored module can go into. */
export const slotsFor = (mod: ModuleRec, slots: Slot[], ship: ShipRec,
  fitted: (ModuleRec | null)[], keys: Map<string, ModuleRec>) =>
  slots.filter((slot) => canPlace(mod, slot, ship, fitted, keys))

/**
 * Installs a stored module into `slot`, and puts the module it displaces into storage
 * (`ModulesStorageScreen.as:407-432`: the fitted module is stored first, then the stored one is
 * spliced out of both vectors and fitted). The displaced module is recorded at `station`, the
 * ship's own station unless the caller names another.
 *
 * Refuses and changes nothing when the module fails a placement rule.
 */
export function installFromStorage(sv: Save, entry: Stored, slot: Slot, ship: ShipRec,
  fitted: (ModuleRec | null)[], keys: Map<string, ModuleRec>, station?: string): boolean {
  if (!entry.mod || !canPlace(entry.mod, slot, ship, fitted, keys)) return false
  const modules = moduleVector(sv)
  const old: AmfValue | null = modules.items[slot.index] ?? null

  modules.items[slot.index] = entry.module
  storedModules(sv).items.splice(entry.index, 1)
  storedStations(sv).items.splice(entry.index, 1)
  if (old instanceof AmfObject) putInStorage(sv, old, station ?? currentStation(sv))
  return true
}

/** Takes the module fitted in `slot` back into storage (`ModulesStorageScreen.as:584-592`),
 * recorded at `station`, the ship's own station unless the caller names another. */
export function takeIntoStorage(sv: Save, slot: Slot, station?: string): boolean {
  const modules = moduleVector(sv)
  const old = modules.items[slot.index]
  if (!(old instanceof AmfObject)) return false
  modules.items[slot.index] = null
  putInStorage(sv, old, station ?? currentStation(sv))
  return true
}
