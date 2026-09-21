// node src/lib/save/ships.test.ts — taking a ship leaves a loadable save: the new ship in use, the
// old one in the hangar with its station, an undamaged hull, and the balance where it was.
import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { AmfObject, AmfVector, HANGAR, SHIP, decode, getCredits, setCredits } from './codec.ts'
import { prepareDownload, extUtf, shipStation } from './safety.ts'
import { buildSlots, byKey, bySaveName, type ModuleRec } from './rules.ts'
import { addToHangar, buyShip, defaultLoadout, hangarValue, sellShip, shopShips, useShip, type ShipItem } from './ships.ts'
import { hullMax } from './specs.ts'
import { makePriorities } from './engineer.ts'

const repo = resolve(import.meta.dirname, '../../../..')
const { modules, ships } = JSON.parse(readFileSync(join(repo, 'editor/public/data/save-data.json'), 'utf8')) as
  { modules: ModuleRec[]; ships: ShipItem[] }
// The tables the game builds at start-up; a module written without them is quietly wrong.
makePriorities(JSON.parse(readFileSync(join(repo, 'editor/public/data/save-data.json'), 'utf8')).priorities)
const keys = byKey(modules)
const names = bySaveName(modules)

const bytes = new Uint8Array(readFileSync(join(repo, 'saves/Save2.SOL')))
const load = () => decode(bytes)

const shipObj = (sv: ReturnType<typeof load>) => sv.objs[SHIP] as AmfObject
const modulesOf = (s: AmfObject) => (s.raw[2][1] as AmfVector).items
const integrityOf = (m: AmfObject) => {
  const b = m.raw[2][1] as Uint8Array
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getFloat64(0)
}

// ------------------------------------------------------- every ship has a default loadout

for (const ship of ships) {
  const slots = buildSlots(ship, keys)
  const loadout = defaultLoadout(ship, slots, modules)
  assert.equal(loadout.length, slots.length, `${ship.key}: one entry per slot`)
  for (let i = 0; i < 8; i++) {
    assert.ok(loadout[i], `${ship.key}: main slot ${i} (${slots[i].category}) has no default module`)
    assert.ok(loadout[i]!.mClass <= slots[i].sizeMax, `${ship.key}: slot ${i} default is too large`)
  }
  assert.ok(hullMax(ship, loadout) > 0, `${ship.key}: hull points`)
}
console.log(`${ships.length} ships have a full main-module loadout`)

// ------------------------------------------------------- buying, on a real save

const FUNDS = 2_000_000_000
const picks = ['Ion', 'Atom', 'Chaser', 'Gladiator', 'Phoenix', 'Hawk']
let written = ''

for (const key of picks) {
  const ship = ships.find((s) => s.key === key)
  assert.ok(ship, `${key} is in the table`)

  const sv = load()
  setCredits(sv, FUNDS)
  const before = shipObj(sv)
  const oldType = extUtf(before, 0)
  const oldModules = modulesOf(before).length
  const oldHangar = (sv.objs[HANGAR] as AmfVector).items.length

  buyShip(sv, ship, modules, true)
  const out = prepareDownload(sv)          // refuses anything the loader would reject
  const back = decode(out)

  const now = shipObj(back)
  assert.equal(extUtf(now, 0), ship.key, `${key}: the ship in use`)
  assert.equal(extUtf(now, 1), '', `${key}: the ship in use has no station`)

  const slots = buildSlots(ship, keys)
  const fitted = modulesOf(now)
  assert.equal(fitted.length, slots.length, `${key}: one module entry per slot`)
  for (let i = 0; i < 8; i++) {
    const m = fitted[i]
    assert.ok(m instanceof AmfObject, `${key}: main slot ${i} is empty`)
    assert.ok(names.get(`${extUtf(m, 0)}.${extUtf(m, 1)}`), `${key}: slot ${i} is not a module the table knows`)
  }

  // A hull whose integrity disagrees with the ship's hull value loads the ship damaged.
  // A new ship leaves the yard at full hull, which is `HullMax` (`ShipInfo.as:306`, `:449`).
  const wanted = hullMax(ship, defaultLoadout(ship, slots, modules))
  assert.equal(integrityOf(fitted[0] as AmfObject), wanted, `${key}: hull integrity`)

  const hangar = (back.objs[HANGAR] as AmfVector).items
  assert.equal(hangar.length, oldHangar + 1, `${key}: the old ship joined the hangar`)
  const kept = hangar[hangar.length - 1] as AmfObject
  assert.equal(extUtf(kept, 0), oldType, `${key}: the old ship kept its type`)
  assert.equal(modulesOf(kept).length, oldModules, `${key}: the old ship kept its modules`)
  hangar.forEach((h, i) => assert.ok(shipStation(h as AmfObject), `${key}: hangar entry ${i + 1} has no station`))

  assert.equal(getCredits(back), FUNDS, `${key}: the balance is untouched`)
  console.log(`${key}: ${oldType} -> ${key}, hull ${wanted}, ${hangar.length} in the hangar, ${getCredits(back).toLocaleString()} CR`)

  if (!written) {
    written = join(mkdtempSync(join(tmpdir(), 'gg-ships-')), 'Save2.SOL')
    writeFileSync(written, out)
  }
}

// ------------------------------------------------------- the Python oracle reads the same bytes

const dump = execFileSync('python3', [join(repo, 'tools/bin/gg_save.py'), 'dump', written], { encoding: 'utf8' })
assert.ok(dump.includes('Ion'), `gg_save.py does not see the new ship:\n${dump}`)
console.log(dump.trim().split('\n').slice(0, 8).join('\n'))

// ------------------------------------------------------- the hangar's own actions

const sv = load()
const ion = ships.find((s) => s.key === 'Ion')!
addToHangar(sv, ion, modules)
const n = (sv.objs[HANGAR] as AmfVector).items.length
const mine = extUtf(shipObj(sv), 0)

useShip(sv, n - 1)
assert.equal(extUtf(shipObj(sv), 0), 'Ion', 'the chosen ship is now in use')
assert.equal((sv.objs[HANGAR] as AmfVector).items.length, n, 'the hangar keeps its count on a swap')
assert.equal(extUtf((sv.objs[HANGAR] as AmfVector).items[n - 1] as AmfObject, 0), mine, 'the old ship took its place')

const value = hangarValue((sv.objs[HANGAR] as AmfVector).items[n - 1] as AmfObject, ships, modules, names)
const balance = getCredits(sv)
sellShip(sv, n - 1)
assert.equal((sv.objs[HANGAR] as AmfVector).items.length, n - 1, 'the discarded ship left the hangar')
assert.equal(getCredits(sv), balance, 'the balance is untouched')
prepareDownload(sv)
console.log(`swap and discard round-trip, ${mine} listed at ${value.toLocaleString()} CR`)

// ------------------------------------------------------- the shop

assert.ok(shopShips(ships).length > 0 && shopShips(ships).length <= ships.length, 'the shop lists saleable ships')
console.log(`${shopShips(ships).length} of ${ships.length} ships are for sale`)
