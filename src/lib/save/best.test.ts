// node src/lib/save/best.test.ts — a save already at its best shows no wand anywhere.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { AmfObject, decode, getCredits } from './codec.ts'
import { prepareDownload } from './safety.ts'
import { buildSlots, byKey, bySaveName, fittedModules, moduleVector, shipKey, type ModuleRec, type ShipRec } from './rules.ts'
import { MATERIAL_MAX, atBest, materialCounts } from './engineer.ts'
import { getPosition } from './position.ts'
import {
  ARENA_MAX, CREDITS_BEST, RANK_FIELDS, ZENTARK, creditsAtBest, materialsAtBest, rankAtBest,
  recordAtBest, setCreditsBest, setMaterialsBest, setRecordBest, setShipBest, setSystemBest,
  shipAtBest, slotAtBest, systemAtBest,
} from './best.ts'
import { KARMA_MAX, REPUTATION_MAX, arena, karma } from './record.ts'

const repo = resolve(import.meta.dirname, '../../../..')
const { modules, ships } = JSON.parse(readFileSync(join(repo, 'editor/public/data/save-data.json'), 'utf8')) as
  { modules: ModuleRec[]; ships: ShipRec[] }
const keys = byKey(modules)
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

console.log('best ok')
