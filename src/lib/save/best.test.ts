// node src/lib/save/best.test.ts — a save already at its best shows no wand anywhere.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { AmfObject, decode, getCredits } from './codec.ts'
import { prepareDownload } from './safety.ts'
import {
  buildSlots, byKey, bySaveName, canPlace, fittedModules, install, moduleVector, shipKey,
  type ModuleRec, type ShipRec,
} from './rules.ts'
import {
  MATERIAL_MAX, applyBest, atBest, makeUpgrades, materialCounts, moduleBits, type ModuleUpgrade,
} from './engineer.ts'
import { hullMax } from './specs.ts'
import { addToHangar, useShip } from './ships.ts'
import { AmfVector } from './codec.ts'
import { extUtf } from './safety.ts'
import { getPosition } from './position.ts'
import {
  ARENA_MAX, CREDITS_BEST, RANK_FIELDS, ZENTARK, creditsAtBest, hullAtBest, materialsAtBest,
  rankAtBest, recordAtBest, setCreditsBest, setMaterialsBest, setRecordBest, setShipBest,
  setSystemBest, shipAtBest, slotAtBest, systemAtBest, FILLER,
} from './best.ts'
import { REPUTATION_MAX, arena, karma } from './record.ts'

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
  assert.ok(recordAtBest(sv), `${file}: reputation, the arena and the three ranks`)
  for (const f of RANK_FIELDS) assert.ok(rankAtBest(sv, f), `${file}: rank field ${f}`)
  assert.equal(arena(sv), ARENA_MAX)
  // Karma is not part of the record's best, and the wand leaves it where the reader put it.
  assert.equal(karma(sv), karma(decode(new Uint8Array(readFileSync(join(repo, 'saves', file))))), `${file}: karma`)
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
  void full
  assert.equal(hullAtBest(sv, ship, fittedModules(sv, names)), false, 'a damaged hull is not at its best')

  setShipBest(sv, ship, modules, keys, names)
  const after = moduleVector(sv).items[0] as AmfObject
  // The hull points a ship carries follow the reinforcement it ends up with, so the figure to
  // meet is this loadout's `HullMax`, not the one the save arrived with.
  assert.equal(readDouble(after, 2), hullMax(ship, fittedModules(sv, names)), 'the hull is whole again')
  assert.equal(extUtf(after, 1), was, 'and the same hull module is still fitted')
  assert.ok(hullAtBest(sv, ship, fittedModules(sv, names)))
  prepareDownload(sv)
  console.log(`a hull at 35% comes back to ${readDouble(after, 2)} with ${extUtf(after, 0)}.${was} still in the slot`)
}


// ------------------------------------------------------- the ship's best may move a module

// The wand's reach is the thing it sits beside: a slot's wand improves that slot, the ship's
// wand may move a module to a slot that takes more of it. Nothing but filler moves down.
{
  const count = (fit: (ModuleRec | null)[]) => {
    const out = new Map<string, number>()
    for (const m of fit) if (m) out.set(m.category, (out.get(m.category) ?? 0) + 1)
    return out
  }

  let moved = 0
  for (const ship of ships) {
    const sv = decode(new Uint8Array(readFileSync(join(repo, 'saves/Save1.SOL'))))
    addToHangar(sv, ship as never, modules)
    useShip(sv, (sv.objs[3] as AmfVector).items.length - 1)
    assert.equal(shipKey(sv), ship.key, `${ship.key}: in use`)

    const slots = buildSlots(ship, keys)
    const before = fittedModules(sv, names)
    setShipBest(sv, ship, modules, keys, names)
    const after = fittedModules(sv, names)

    // The slots a ship-level best reassigns: a main slot takes one category and a weapon slot
    // has its own settled best, so neither is part of the shuffle.
    const shuffled = slots.filter((s) => s.restriction !== 'Main' && s.restriction !== 'Weapon')

    // Every module is still there, category for category.
    const was = count(shuffled.map((s) => before[s.index]))
    const now = count(shuffled.map((s) => after[s.index]))
    assert.deepEqual([...now].sort(), [...was].sort(), `${ship.key}: the categories changed`)

    // No empty slot gained a module, and every placed module is one the game would install.
    const emptied = shuffled.filter((s) => !before[s.index]).length
    assert.equal(shuffled.filter((s) => !after[s.index]).length, emptied, `${ship.key}: a slot filled or emptied`)
    for (const s of shuffled) {
      const m = after[s.index]
      if (!m) continue
      assert.ok(canPlace(m, s, ship, after, keys), `${ship.key}: ${m.name} cannot sit in slot ${s.index}`)
      assert.ok(m.mClass <= s.sizeMax, `${ship.key}: ${m.name} is too big for slot ${s.index}`)
    }

    // Nothing but filler ends in a slot smaller than the one it started in.
    for (const category of new Set(was.keys())) {
      if (FILLER.includes(category)) continue
      const sizes = (fit: (ModuleRec | null)[]) => shuffled.filter((s) => fit[s.index]?.category === category)
        .map((s) => s.sizeMax).sort((a, b) => a - b)
      const from = sizes(before), to = sizes(after)
      assert.equal(from.length, to.length, `${ship.key}: ${category} lost a module`)
      from.forEach((size, i) => assert.ok(to[i] >= size,
        `${ship.key}: ${category} went from a class ${size} slot to a class ${to[i]} one`))
    }

    if (shuffled.some((s) => before[s.index]?.key !== after[s.index]?.key)) moved++
  }
  console.log(`${ships.length} ships take a ship-level best; ${moved} of them move a module, `
    + `and only ${FILLER.join(', ')} may be pushed down`)
}

// The case that showed it: a Nemesis whose shields were stuck at 4A in its class 4 slot.
{
  const sv = decode(new Uint8Array(readFileSync(join(repo, 'saves/fixtures/nemesis-maxed.SOL'))))
  const ship = ships.find((s) => s.key === shipKey(sv))!
  const before = fittedModules(sv, names).find((m) => m?.category === 'Shields')
  assert.equal(before?.className, '4A', `the fixture carries ${before?.name}`)

  setShipBest(sv, ship, modules, keys, names)
  const after = fittedModules(sv, names).find((m) => m?.category === 'Shields')
  assert.equal(after?.className, '6A', `the ship's best left ${after?.name} on the Nemesis`)
  assert.equal(fittedModules(sv, names).filter((m) => m?.category === 'Shields').length, 1, 'shields are a singleton')
  prepareDownload(sv)
  console.log(`the Nemesis carries ${after?.name} where its old slot allowed ${before?.name}`)
}

console.log('best ok')
