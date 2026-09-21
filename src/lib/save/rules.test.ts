// node src/lib/save/rules.test.ts — Max all obeys the game's slot rules for every ship in the table.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { AmfObject, decode, encode, type AmfVector } from './codec.ts'
import { prepareDownload, extUtf } from './safety.ts'
import { makePriorities } from './engineer.ts'
import {
  MAIN_CATEGORIES, buildSlots, byKey, bySaveName, canPlace, fitsHangar, fitsSize, fitsType,
  fittedModules, install, maxAll, maxCategory, maxZentarks, moduleVector, shipKey,
  type ModuleRec, type ShipRec,
} from './rules.ts'

const repo = resolve(import.meta.dirname, '../../../..')
const data = JSON.parse(readFileSync(join(repo, 'editor/public/data/save-data.json'), 'utf8')) as
  { modules: ModuleRec[]; ships: ShipRec[] }
// The tables the game builds at start-up; a module written without them is quietly wrong.
makePriorities(JSON.parse(readFileSync(join(repo, 'editor/public/data/save-data.json'), 'utf8')).priorities)
const { modules, ships } = data
const keys = byKey(modules)
const names = bySaveName(modules)

// ------------------------------------------------------- every ship in the table

let filled = 0
for (const ship of ships) {
  const slots = buildSlots(ship, keys)

  const expected = 8 + ship.weapons.reduce((a, b) => a + b, 0) + ship.external.reduce((a, b) => a + b, 0)
    + ship.optional.reduce((a, b) => a + b, 0) + ship.optionalMilitary.reduce((a, b) => a + b, 0)
  assert.equal(slots.length, expected, `${ship.key}: slot count`)

  // Max all, then the three optional fills and Zentarks, each on top of the last.
  const fitted: (ModuleRec | null)[] = slots.map(() => null)
  const place = (fills: { slot: { index: number }; mod: ModuleRec }[]) =>
    fills.forEach((f) => { fitted[f.slot.index] = f.mod })

  place(maxAll(slots, ship, fitted, modules, keys))
  for (const category of ['CargoRack', 'Shields', 'HullReinforcement']) {
    place(maxCategory(category, slots, ship, fitted, modules, keys))
  }
  place(maxZentarks(slots, ship, fitted, modules, keys))

  for (const slot of slots) {
    const mod = fitted[slot.index]
    // Slots 1 to 7 hold a main module whenever the table has one small enough for the slot.
    if (slot.restriction === 'Main' && slot.index > 0) {
      const any = modules.some((m) => m.category === MAIN_CATEGORIES[slot.index] && m.mClass <= slot.sizeMax)
      assert.equal(!!mod, any, `${ship.key}: main slot ${slot.index} (${slot.category}) fill`)
    }
    if (!mod) continue
    filled++
    assert.ok(fitsSize(mod, slot), `${ship.key}: ${mod.key} class ${mod.mClass} > slot ${slot.index} max ${slot.sizeMax}`)
    assert.ok(fitsType(mod, slot), `${ship.key}: ${mod.key} (${mod.slotType}) in a ${slot.restriction} slot`)
    assert.ok(fitsHangar(mod, ship, keys), `${ship.key}: ${mod.key} exceeds the fighter hangar cap`)
    assert.ok(canPlace(mod, slot, ship, fitted, keys), `${ship.key}: ${mod.key} fails a placement rule`)
  }

  // The hull slot is never touched, and no singleton is placed twice.
  assert.equal(fitted[0], null, `${ship.key}: the hull slot was rewritten`)
  const seen = new Set<string>()
  for (const mod of fitted) {
    if (!mod?.singleton) continue
    assert.ok(!seen.has(mod.category), `${ship.key}: ${mod.category} placed twice`)
    seen.add(mod.category)
  }
}
console.log(`${ships.length} ships, ${filled} slots filled: every module fits its slot`)

// A hull with no fighter hangar refuses one (`ModulesAvailableScreen.as:316-325`).
const hangarMod = modules.find((m) => m.category === 'FighterHangar')!
const noHangar = ships.find((s) => !s.maxFighterHangar)!
assert.equal(fitsHangar(hangarMod, noHangar, keys), false)
const withHangar = ships.find((s) => s.maxFighterHangar)!
assert.equal(fitsHangar({ ...hangarMod, mClass: 99 }, withHangar, keys), false)
console.log(`fighter hangar cap holds: ${noHangar.key} refuses one, ${withHangar.key} caps the class`)

// ------------------------------------------------------- a real save, maxed and re-encoded

const bytes = new Uint8Array(readFileSync(join(repo, 'saves/Save1.SOL')))
const sv = decode(bytes)
const ship = ships.find((s) => s.key === shipKey(sv))!
const slots = buildSlots(ship, keys)
assert.equal(slots.length, moduleVector(sv).items.length, 'the built slots match the save')

const before = fittedModules(sv, names)
for (const f of maxAll(slots, ship, before, modules, keys)) install(sv, f.slot, f.mod)
const after = fittedModules(sv, names)
after.forEach((mod, i) => {
  if (mod) assert.ok(mod.mClass <= slots[i].sizeMax, `slot ${i}: ${mod.key} is too large`)
})
assert.notDeepEqual(after.map((m) => m?.key), before.map((m) => m?.key))

const out = prepareDownload(sv)
const back = decode(out)
assert.deepEqual(encode(back), out, 'the maxed save does not re-encode identically')
assert.deepEqual(
  (moduleVector(back).items as AmfVector['items']).map((m) => (m instanceof AmfObject ? `${extUtf(m, 0)}.${extUtf(m, 1)}` : null)),
  after.map((m) => (m ? `${m.subtype}.${m.className}` : null)),
  'the modules do not survive the round trip',
)
console.log(`${ship.key}: max all wrote ${after.filter(Boolean).length} modules, the save re-decodes identically`)

console.log('rules ok')
