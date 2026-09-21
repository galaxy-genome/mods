// node src/lib/save/best.test.ts — a save already at its best shows no wand anywhere.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { AmfObject, decode, getCredits } from './codec.ts'
import { prepareDownload } from './safety.ts'
import {
  buildSlots, byKey, bySaveName, canPlace, cloneShipData, fittedIn, fittedModules, install,
  moduleVector, modulesOf, sameModules, shipData, shipKey, type ModuleRec, type ShipRec,
} from './rules.ts'
import {
  MATERIAL_MAX, MAX_LEVEL, applyBest, atBest, makePriorities, makeUpgrades, materialCounts,
  moduleBits, priorityFor, upgradesFor, type ModuleUpgrade,
} from './engineer.ts'
import { hullMax, saveSpecs } from './specs.ts'
import { addToHangar } from './ships.ts'
import { AmfVector, HANGAR } from './codec.ts'
import { extUtf } from './safety.ts'
import { getPosition } from './position.ts'
import {
  ARENA_MAX, CREDITS_BEST, RANK_FIELDS, ZENTARK, creditsAtBest, hullAtBest, materialsAtBest,
  rankAtBest, recordAtBest, setCreditsBest, setMaterialsBest, setRecordBest,
  setSystemBest, shipAtBest, slotAtBest, systemAtBest, FILLER, fitShip, tablesOf,
} from './best.ts'
import { REPUTATION_MAX, arena, karma } from './record.ts'

const repo = resolve(import.meta.dirname, '../../../..')
const { modules, ships, upgrades, priorities } = JSON.parse(readFileSync(join(repo, 'editor/public/data/save-data.json'), 'utf8')) as
  { modules: ModuleRec[]; ships: ShipRec[]; upgrades: ModuleUpgrade[]; priorities: Record<string, number> }
makeUpgrades(upgrades)
makePriorities(priorities)
const keys = byKey(modules)
const tables = tablesOf(modules)

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
  fitShip(shipData(sv), ship, tables)
  const at = getPosition(sv)
  setSystemBest(sv, at)

  // Every wand, now hidden.
  assert.ok(creditsAtBest(sv), `${file}: credits`)
  assert.equal(getCredits(sv), CREDITS_BEST)
  assert.ok(materialsAtBest(materialCounts(sv)), `${file}: craft materials`)
  assert.ok(materialCounts(sv).every((c) => c === MATERIAL_MAX))
  assert.ok(recordAtBest(sv), `${file}: reputation, the arena and the three ranks`)
  for (const f of RANK_FIELDS) assert.ok(rankAtBest(sv, f), `${file}: rank field ${f}`)
  assert.equal(arena(sv), ARENA_MAX)
  // Karma is not part of the record's best, and the wand leaves it where the reader put it.
  assert.equal(karma(sv), karma(decode(new Uint8Array(readFileSync(join(repo, 'saves', file))))), `${file}: karma`)
  assert.ok(systemAtBest(sv, at), `${file}: the system the save sits in`)
  assert.ok(shipAtBest(shipData(sv), ship, tables), `${file}: every slot of the ship`)
  // The generator's `shields` is its charge in points (`ShipInfo.as:557`), so a fitted ship
  // leaves with it full rather than at 1 point.
  const fittedNow = fittedModules(sv, tables.names)
  const generator = (shipData(sv).raw[2][1] as AmfVector).items[fittedNow.findIndex((m) => m?.category === 'Shields')]
  const charge = new DataView((generator as AmfObject).raw[8][1].buffer, (generator as AmfObject).raw[8][1].byteOffset, 8).getFloat64(0)
  const capacity = saveSpecs(sv, ship, fittedNow, upgrades).shields
  assert.ok(capacity > 1, `${file}: the ship has shields to charge`)
  assert.equal(charge, capacity, `${file}: shields charged to their capacity`)

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
  void full
  assert.equal(hullAtBest(sv, ship, fittedModules(sv, names)), false, 'a damaged hull is not at its best')

  fitShip(shipData(sv), ship, tables)
  const after = moduleVector(sv).items[0] as AmfObject
  // The hull points a ship carries follow the reinforcement it ends up with, so the figure to
  // meet is this loadout's `HullMax`, not the one the save arrived with.
  assert.equal(readDouble(after, 2), hullMax(ship, fittedModules(sv, names)), 'the hull is whole again')
  assert.equal(extUtf(after, 1), was, 'and the same hull module is still fitted')
  assert.ok(hullAtBest(sv, ship, fittedModules(sv, names)))
  prepareDownload(sv)
  console.log(`a hull at 35% comes back to ${readDouble(after, 2)} with ${extUtf(after, 0)}.${was} still in the slot`)
}


// ------------------------------------------------------- the wand fits a whole ship

// One wand per ship, and it finishes the job: every slot filled, every module the best of its
// category its slot takes, engineered, prioritised and whole, with nothing but filler moved down.
{
  let moved = 0
  for (const ship of ships) {
    const sv = decode(new Uint8Array(readFileSync(join(repo, 'saves/Save1.SOL'))))
    addToHangar(sv, ship as never, modules)
    const hangar = (sv.objs[HANGAR] as AmfVector).items
    // The wand fits a hangar entry where it lies, without flying it first.
    const entry = hangar[hangar.length - 1] as AmfObject

    const slots = buildSlots(ship, keys)
    const before = fittedIn(modulesOf(entry), names)
    assert.equal(shipAtBest(entry, ship, tables), false, `${ship.key}: a stock ship is not at its best`)
    fitShip(entry, ship, tables)
    const after = fittedIn(modulesOf(entry), names)

    for (const slot of slots) {
      const mod = after[slot.index]
      assert.ok(mod, `${ship.key}: slot ${slot.index} (${slot.restriction}) is empty`)
      assert.ok(canPlace(mod, slot, ship, after, keys), `${ship.key}: ${mod.name} cannot sit in slot ${slot.index}`)
      const m = modulesOf(entry).items[slot.index] as AmfObject
      assert.equal(moduleBits(m).priority, priorityFor(mod.subtype), `${ship.key}: ${mod.name} priority`)
      if (upgradesFor(mod.subtype).length) {
        assert.equal(moduleBits(m).level, MAX_LEVEL, `${ship.key}: ${mod.name} is not at level 25`)
      }
      // Nothing but filler ends in a slot smaller than the one it came from.
      if (slot.index === 0 || FILLER.includes(mod.category)) continue
      const from = slots.filter((s) => before[s.index]?.category === mod.category).map((s) => s.sizeMax)
      const to = slots.filter((s) => after[s.index]?.category === mod.category).map((s) => s.sizeMax)
      from.sort((a, b) => a - b).forEach((size, i) => assert.ok(to.sort((a, b) => a - b)[i] >= size,
        `${ship.key}: ${mod.category} went from a class ${size} slot to a class ${to[i]} one`))
    }

    // The hull carries this loadout's own hull points.
    const hull = modulesOf(entry).items[0] as AmfObject
    const b = hull.raw[2][1] as Uint8Array
    assert.equal(new DataView(b.buffer, b.byteOffset, b.byteLength).getFloat64(0),
      hullMax(ship, after), `${ship.key}: hull points`)

    // A second click changes nothing, which is what makes the wand disappear.
    const again = cloneShipData(entry)
    fitShip(again, ship, tables)
    assert.ok(sameModules(modulesOf(entry), modulesOf(again)), `${ship.key}: a second fit moved something`)
    assert.ok(shipAtBest(entry, ship, tables), `${ship.key}: the wand did not finish`)

    if (slots.some((s) => before[s.index]?.key !== after[s.index]?.key)) moved++
  }
  console.log(`${ships.length} ships take the wand in the hangar; ${moved} of them change, `
    + `and only ${FILLER.join(', ')} may be pushed down`)
}

// The flown ship takes the same wand, and the case that showed the reach: a Nemesis whose
// shields were stuck at 4A in its class 4 slot.
{
  const sv = decode(new Uint8Array(readFileSync(join(repo, 'saves/fixtures/nemesis-maxed.SOL'))))
  const ship = ships.find((s) => s.key === shipKey(sv))!
  const before = fittedModules(sv, names).find((m) => m?.category === 'Shields')
  assert.equal(before?.className, '4A', `the fixture carries ${before?.name}`)

  fitShip(shipData(sv), ship, tables)
  const after = fittedModules(sv, names).find((m) => m?.category === 'Shields')
  assert.equal(after?.className, '6A', `the wand left ${after?.name} on the Nemesis`)
  assert.equal(fittedModules(sv, names).filter((m) => m?.category === 'Shields').length, 1, 'shields are a singleton')
  assert.ok(shipAtBest(shipData(sv), ship, tables))
  prepareDownload(sv)
  console.log(`the Nemesis carries ${after?.name} where its old slot allowed ${before?.name}`)
}

console.log('best ok')
