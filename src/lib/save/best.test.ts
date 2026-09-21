// node src/lib/save/best.test.ts — a save already at its best shows no wand anywhere.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { AmfObject, decode, getCredits } from './codec.ts'
import { prepareDownload } from './safety.ts'
import {
  buildSlots, byKey, bySaveName, fittedModules, install, moduleVector, shipKey,
  type ModuleRec, type ShipRec,
} from './rules.ts'
import {
  MATERIAL_MAX, applyBest, atBest, makeUpgrades, materialCounts, moduleBits, type ModuleUpgrade,
} from './engineer.ts'
import { hullMax } from './specs.ts'
import { extUtf } from './safety.ts'
import { getPosition } from './position.ts'
import {
  ARENA_MAX, CREDITS_BEST, RANK_FIELDS, ZENTARK, creditsAtBest, hullAtBest, materialsAtBest,
  rankAtBest, recordAtBest, setCreditsBest, setMaterialsBest, setRecordBest, setShipBest,
  setSystemBest, shipAtBest, slotAtBest, systemAtBest,
} from './best.ts'
import { KARMA_MAX, REPUTATION_MAX, arena, karma } from './record.ts'

const repo = resolve(import.meta.dirname, '../../../..')
const { modules, ships, upgrades } = JSON.parse(readFileSync(join(repo, 'editor/public/data/save-data.json'), 'utf8')) as
  { modules: ModuleRec[]; ships: ShipRec[]; upgrades: ModuleUpgrade[] }
makeUpgrades(upgrades)
const keys = byKey(modules)

const f64 = (n: number) => {
  const d = new DataView(new ArrayBuffer(8))
  d.setFloat64(0, n)
  return new Uint8Array(d.buffer)
}
const readDouble = (o: AmfObject, i: number) => {
  const b = o.raw[i][1] as Uint8Array
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getFloat64(0)
}
const names = bySaveName(modules)

for (const file of ['Save1.SOL', 'Save2.SOL', 'Save3.SOL']) {
  const sv = decode(new Uint8Array(readFileSync(join(repo, 'saves', file))))
  const ship = ships.find((s) => s.key === shipKey(sv))
  assert.ok(ship, `${file}: the ship in use is in the table`)

  // Every wand, set.
  setCreditsBest(sv)
  setMaterialsBest(sv)
  setRecordBest(sv)
  setShipBest(sv, ship, modules, keys, names)
  const at = getPosition(sv)
  setSystemBest(sv, at)

  // Every wand, now hidden.
  assert.ok(creditsAtBest(sv), `${file}: credits`)
  assert.equal(getCredits(sv), CREDITS_BEST)
  assert.ok(materialsAtBest(materialCounts(sv)), `${file}: craft materials`)
  assert.ok(materialCounts(sv).every((c) => c === MATERIAL_MAX))
  assert.ok(recordAtBest(sv), `${file}: reputation, karma, the arena and the three ranks`)
  for (const f of RANK_FIELDS) assert.ok(rankAtBest(sv, f), `${file}: rank field ${f}`)
  assert.equal(karma(sv), KARMA_MAX)
  assert.equal(arena(sv), ARENA_MAX)
  assert.ok(systemAtBest(sv, at), `${file}: the system the save sits in`)
  assert.ok(shipAtBest(sv, ship, modules, keys, names), `${file}: every slot of the ship`)

  const fitted = fittedModules(sv, names)
  const slots = buildSlots(ship, keys)
  for (const slot of slots) {
    assert.ok(slotAtBest(sv, slot, ship, fitted, modules, keys), `${file}: slot ${slot.index}`)
    const m = moduleVector(sv).items[slot.index]
    if (m instanceof AmfObject) assert.ok(atBest(m), `${file}: slot ${slot.index} is not fully upgraded`)
    // A weapon slot holds a Zentarks cannon.
    if (slot.restriction === 'Weapon') assert.equal(fitted[slot.index]?.category, ZENTARK, `${file}: weapon slot ${slot.index}`)
  }

  // The best of everything is still a save the game loads.
  prepareDownload(sv)
  const weapons = slots.filter((s) => s.restriction === 'Weapon').length
  console.log(`${file}: ${slots.length} slots at their best, ${weapons} Zentarks cannons, reputation ${REPUTATION_MAX}, ${getCredits(sv).toLocaleString()} CR`)
}


// ------------------------------------------------------- a new module arrives undamaged

// The purchase screen promises DURABILITY 100%, so an install carries none of the damage,
// charge or engineer level of the module it replaced.
{
  const sv = decode(new Uint8Array(readFileSync(join(repo, 'saves/Save1.SOL'))))
  const ship = ships.find((s) => s.key === shipKey(sv))!
  const slots = buildSlots(ship, keys)
  const slot = slots.find((s) => s.restriction === 'Weapon')!
  const old = moduleVector(sv).items[slot.index] as AmfObject

  // Leave the module in the slot damaged, discharged, broken and levelled.
  old.raw[2] = ['D', f64(1)]
  old.raw[8] = ['D', f64(0.25)]
  old.raw[9] = ['B', new Uint8Array([1])]
  applyBest(old)

  const mod = modules.find((m) => m.slotType === 'Weapon' && m.mClass <= slot.sizeMax)!
  install(sv, slot, mod)
  const now = moduleVector(sv).items[slot.index] as AmfObject
  assert.equal(readDouble(now, 2), mod.integrity, 'the new module is at its own full integrity')
  assert.equal(readDouble(now, 8), 1, 'its shields are charged')
  assert.equal((now.raw[9][1] as Uint8Array)[0], 0, 'and not broken')
  assert.equal(moduleBits(now).level, 0, 'and it carries no engineer level')
  prepareDownload(sv)
  console.log(`a new ${mod.name} arrives at integrity ${mod.integrity}, shields charged, level 0`)
}

// ------------------------------------------------------- the ship's best repairs the hull

{
  const sv = decode(new Uint8Array(readFileSync(join(repo, 'saves/Save1.SOL'))))
  const ship = ships.find((s) => s.key === shipKey(sv))!
  const hull = moduleVector(sv).items[0] as AmfObject
  const was = extUtf(hull, 1)
  const full = readDouble(hull, 2)

  hull.raw[2] = ['D', f64(full * 0.35)]
  assert.equal(hullAtBest(sv, ship, fittedModules(sv, names)), false, 'a damaged hull is not at its best')

  setShipBest(sv, ship, modules, keys, names)
  const after = moduleVector(sv).items[0] as AmfObject
  assert.equal(readDouble(after, 2), hullMax(ship, fittedModules(sv, names)), 'the hull is whole again')
  assert.equal(readDouble(after, 2), full, 'which is the value the save already carried')
  assert.equal(extUtf(after, 1), was, 'and the same hull module is still fitted')
  assert.ok(hullAtBest(sv, ship, fittedModules(sv, names)))
  prepareDownload(sv)
  console.log(`a hull at 35% comes back to ${full} with ${extUtf(after, 0)}.${was} still in the slot`)
}

console.log('best ok')
