// node src/lib/save/storage.test.ts — moving a module between storage and a slot on a real save.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { AmfObject, decode, encode, type AmfValue } from './codec.ts'
import { extUtf, prepareDownload } from './safety.ts'
import {
  buildSlots, byKey, bySaveName, fittedModules, moduleVector, shipKey, storedModules, storedStations,
  type ModuleRec, type ShipRec,
} from './rules.ts'
import { installFromStorage, storedList, takeIntoStorage } from './storage.ts'

const repo = resolve(import.meta.dirname, '../../../..')
const data = JSON.parse(readFileSync(join(repo, 'editor/public/data/save-data.json'), 'utf8')) as
  { modules: ModuleRec[]; ships: ShipRec[] }
const keys = byKey(data.modules)
const names = bySaveName(data.modules)

const bytes = new Uint8Array(readFileSync(join(repo, 'saves/Save1.SOL')))
const original = encode(decode(bytes))
const load = () => decode(bytes)

const fields = (m: AmfValue | null) => {
  assert.ok(m instanceof AmfObject)
  return m.raw.map(([code, v]) => [code, Buffer.from(v as Uint8Array).toString('hex')].join(':')).join('|')
}
const parts = (sv: ReturnType<typeof load>) => {
  const ship = data.ships.find((s) => s.key === shipKey(sv))
  assert.ok(ship, 'the save\'s ship is in the table')
  return { ship: ship as ShipRec, slots: buildSlots(ship as ShipRec, keys) }
}

// ------------------------------------------------------- install, then put it back

{
  const sv = load()
  const { ship, slots } = parts(sv)
  const list = storedList(sv, names)
  assert.ok(list.length > 2, 'the save carries stored modules')

  // The last entry, so the module it displaces lands where it sat and the swap back is exact.
  const entry = list[list.length - 1]
  assert.ok(entry.mod, 'the last stored module is in the table')
  const before = fields(entry.module)
  const count = list.length

  const slot = slots.find((s) => entry.mod!.slotType === s.restriction && entry.mod!.mClass <= s.sizeMax)
  assert.ok(slot, 'a slot takes the last stored module')
  const displaced = fields(moduleVector(sv).items[slot!.index])

  assert.equal(installFromStorage(sv, entry, slot!, ship, fittedModules(sv, names), keys), true)
  assert.equal(storedModules(sv).items.length, count, 'the displaced module took its place')
  assert.equal(storedStations(sv).items.length, count, 'the station vector followed')
  assert.equal(fields(moduleVector(sv).items[slot!.index]), before, 'the slot holds that module, fields intact')
  assert.equal(extUtf(moduleVector(sv).items[slot!.index] as AmfObject, 0), entry.mod!.subtype)
  assert.equal(fields(storedModules(sv).items[count - 1]), displaced, 'the displaced module is in storage, fields intact')

  // Taking the fitted module back leaves the vectors one longer and the slot empty.
  const aside = decode(encode(sv))
  assert.equal(takeIntoStorage(aside, slot!), true)
  assert.equal(storedModules(aside).items.length, count + 1)
  assert.equal(storedStations(aside).items.length, count + 1)
  assert.equal(moduleVector(aside).items[slot!.index], null, 'the slot is empty')

  // The same move in reverse: the displaced module goes back into its slot.
  const back = storedList(sv, names)[count - 1]
  assert.equal(installFromStorage(sv, back, slot!, ship, fittedModules(sv, names), keys, entry.station), true)
  assert.deepEqual(encode(sv), original, 'the reverse move restores the save byte for byte')
}

// ------------------------------------------------------- a refused install changes nothing

{
  const sv = load()
  const { ship, slots } = parts(sv)
  const list = storedList(sv, names)
  const shot = encode(sv)

  // Too big: a module in a slot whose maximum class is below it.
  const big = list.find((s) => s.mod && slots.some((x) => x.restriction === s.mod!.slotType && x.sizeMax < s.mod!.mClass))
  assert.ok(big, 'a stored module is larger than some slot of its own type')
  const small = slots.find((x) => x.restriction === big!.mod!.slotType && x.sizeMax < big!.mod!.mClass)!
  assert.equal(installFromStorage(sv, big!, small, ship, fittedModules(sv, names), keys), false, 'size refused')

  // Wrong type: a weapon in a main slot, and any module in a main slot of another category.
  const weapon = list.find((s) => s.mod?.slotType === 'Weapon')
  assert.ok(weapon, 'a weapon is in storage')
  const main = slots.find((x) => x.restriction === 'Main' && x.sizeMax >= weapon!.mod!.mClass)!
  assert.equal(installFromStorage(sv, weapon!, main, ship, fittedModules(sv, names), keys), false, 'type refused')

  assert.deepEqual(encode(sv), shot, 'a refused install wrote nothing')
}

// ------------------------------------------------------- the edited save survives a round trip

{
  const sv = load()
  const { ship, slots } = parts(sv)
  const entry = storedList(sv, names).find((s) => s.mod?.slotType === 'Weapon')!
  const slot = slots.find((s) => s.restriction === 'Weapon' && s.sizeMax >= entry.mod!.mClass)!
  assert.equal(installFromStorage(sv, entry, slot, ship, fittedModules(sv, names), keys), true)

  const out = prepareDownload(sv)
  const back = decode(out)
  assert.deepEqual(encode(back), out, 'the edited save re-decodes identically')
  assert.equal(extUtf(moduleVector(back).items[slot.index] as AmfObject, 0), entry.mod!.subtype)
  assert.equal(storedModules(back).items.length, storedStations(back).items.length, 'the vectors stay in step')
}

console.log('storage.test.ts: ok')
