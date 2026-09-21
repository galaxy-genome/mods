// node src/lib/save/money.test.ts — every screen's action moves its own fields and never the balance.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { decode, getCredits, setCredits, type Save } from './codec.ts'
import { buildSlots, byKey, bySaveName, fittedModules, install, putInStorage, shipData, type ModuleRec } from './rules.ts'
import { addToHangar, buyShip, sellShip, type ShipItem } from './ships.ts'
import { trade } from './trade.ts'
import { extUtf } from './safety.ts'
import { changed, leaves } from './leaves.ts'

const repo = resolve(import.meta.dirname, '../../../..')
const { modules, ships } = JSON.parse(readFileSync(join(repo, 'editor/public/data/save-data.json'), 'utf8')) as
  { modules: ModuleRec[]; ships: ShipItem[] }
const keys = byKey(modules)
const names = bySaveName(modules)
const bytes = new Uint8Array(readFileSync(join(repo, 'saves/Save2.SOL')))

/** `CargoData.balance` is the first field of object 2 (`system/Save/CargoData.as:153`). */
const BALANCE = '2/0:u'


/** Runs `act` on a fresh save, after `setup`, and reports which leaves moved. */
function act(name: string, allowed: RegExp, run: (sv: Save) => void, setup?: (sv: Save) => void) {
  const sv = decode(bytes)
  setCredits(sv, 1_234_567)
  setup?.(sv)
  const before = leaves(sv)
  run(sv)
  const after = leaves(sv)
  const diff = changed(before, after)
  assert.ok(diff.length > 0, `${name}: nothing changed`)
  const stray = diff.filter((p) => !allowed.test(p))
  assert.deepEqual(stray, [], `${name}: fields outside ${allowed} changed`)
  assert.equal(after.get(BALANCE), before.get(BALANCE), `${name}: the balance moved`)
  assert.equal(getCredits(sv), 1_234_567, `${name}: the balance moved`)
  console.log(`${name}: ${diff.length} leaves, balance ${getCredits(sv).toLocaleString()} CR`)
}

const ion = ships.find((s) => s.key === 'Ion')!
const slotOf = (sv: Save, want: (i: number) => boolean) => {
  const ship = ships.find((s) => s.key === extUtf(shipData(sv), 0))!
  return buildSlots(ship, keys).find((s) => want(s.index))!
}

// The ship in use is object 7 and the hangar object 3; a trade-in touches the ship alone.
act('buy ship, keep the old one', /^[37]\b/, (sv) => buyShip(sv, ion, modules, true))
act('buy ship, trade the old one in', /^7\b/, (sv) => buyShip(sv, ion, modules, false))
act('add to hangar', /^3\b/, (sv) => addToHangar(sv, ion, modules))
act('discard a hangar ship', /^3\b/, (sv) => sellShip(sv, 0), (sv) => addToHangar(sv, ion, modules))

// A module goes into the ship's own module vector, object 7 field 2; storage is object 4.
const weapon = modules.find((m) => m.slotType === 'Weapon' && m.mClass === 1)!
act('buy a module', /^7\/2:O\b/, (sv) => {
  const slot = slotOf(sv, (i) => i > 7)
  install(sv, buildSlots(ships.find((s) => s.key === extUtf(shipData(sv), 0))!, keys)
    .find((s) => s.restriction === 'Weapon' && s.sizeMax >= weapon.mClass) ?? slot, weapon)
})
act('keep the old module, in storage', /^(7\/2:O|4)\b/, (sv) => {
  const ship = ships.find((s) => s.key === extUtf(shipData(sv), 0))!
  const slots = buildSlots(ship, keys)
  const fitted = fittedModules(sv, names)
  const slot = slots.find((s) => s.restriction === 'Weapon' && fitted[s.index] && s.sizeMax >= weapon.mClass)!
  const old = install(sv, slot, weapon)
  if (old) putInStorage(sv, old, 'Thunder Station')
})
act('discard the old module', /^7\/2:O\b/, (sv) => {
  const ship = ships.find((s) => s.key === extUtf(shipData(sv), 0))!
  const slots = buildSlots(ship, keys)
  const fitted = fittedModules(sv, names)
  const slot = slots.find((s) => s.restriction === 'Weapon' && fitted[s.index] && s.sizeMax >= weapon.mClass)!
  install(sv, slot, weapon)
})

// Goods are the name and count vectors of object 2, fields 1 and 2 (`CargoData.as:15-21`).
act('buy goods', /^2\/[12]:O\b/, (sv) => trade(sv, 'Grain', 7, 'buy'))
act('sell goods', /^2\/[12]:O\b/, (sv) => trade(sv, 'Grain', 3, 'sell'), (sv) => trade(sv, 'Grain', 7, 'buy'))

// The one screen that moves money is the credits field itself.
{
  const sv = decode(bytes)
  const before = leaves(sv)
  setCredits(sv, 2_000_000_000)
  assert.deepEqual(changed(before, leaves(sv)), [BALANCE], 'the credits screen writes the balance alone')
  console.log('credits: the balance alone')
}

console.log('money ok')
