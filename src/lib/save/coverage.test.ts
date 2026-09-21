// node src/lib/save/coverage.test.ts — every field a save holds is accounted for, and every field
// the manifest calls editable is one an editor action writes.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { decode, setCredits, type Save } from './codec.ts'
import { changed, leaves } from './leaves.ts'
import {
  buildSlots, byKey, bySaveName, fittedModules, install, putInStorage, shipData,
  type ModuleRec,
} from './rules.ts'
import { addToHangar, buyShip, sellShip, useShip, type ShipItem } from './ships.ts'
import { takeIntoStorage } from './storage.ts'
import { trade } from './trade.ts'
import { extUtf } from './safety.ts'
import { setPosition, markExplored } from './position.ts'
import { setQuestCompleted } from './quests.ts'
import { setMaterial, addLevel, setUpgradeType, MATERIAL_COUNT } from './engineer.ts'
import { setArenaBest, setKarmaBest, setReputationBest } from './best.ts'
import { AmfObject, AmfVector, PROGRESS } from './codec.ts'

/** A leaf path with its vector positions collapsed, so one entry covers a whole vector.
 * `leaves` writes an externalizable field as `index:code` and a vector position as a bare number. */
const shape = (path: string) =>
  path.split('/').map((s, i) => (i === 0 || s.includes(':') ? s : '*')).join('/')

type Status = 'editable' | 'missing' | 'derived' | 'structural'

/** `ShipData` is `Type`, `Station`, `Modules`, `color` (`system/Save/ShipData.as:35-41`), and each
 * module is the thirteen fields of `Module.writeExternal` (`system/modules/Module.as:306-321`). */
function shipFields(at: string, status: Status, color: Status): Record<string, Status> {
  const out: Record<string, Status> = {
    [`${at}/0:U`]: status,
    // The loader prunes a hangar entry with no station and the ship in use carries none
    // (`system/Save/Save.as:387-394`), so the station name is the loader's invariant, not a choice.
    [`${at}/1:U`]: status === 'editable' ? 'structural' : status,
    [`${at}/2:O/*`]: status,
    [`${at}/3:u`]: color,
  }
  for (const [i, code] of [...'UUDIssBDDBBBu'].entries()) out[`${at}/2:O/*/${i}:${code}`] = status
  return out
}

/** `ModulesData.Modules` and the storage vector hold the same thirteen fields. */
function moduleFields(at: string, status: Status): Record<string, Status> {
  const out: Record<string, Status> = {}
  for (const [i, code] of [...'UUDIssBDDBBBu'].entries()) out[`${at}/${i}:${code}`] = status
  return out
}

/** `ExtraData` writes its 32 material counts one byte each (`system/Save/ExtraData.as:194-200`). */
const materialFields = (): Record<string, Status> =>
  Object.fromEntries([...Array(MATERIAL_COUNT)].map((_, i) => [`6/${i}:b`, 'editable' as Status]))

/**
 * Every field the eleven objects carry, by the path `leaves` gives it.
 *
 * `editable` is a field some screen writes; `missing` is one a reader could reasonably want and no
 * screen sets; `derived` is recomputed by the game; `structural` is wire format or a reserved slot
 * the game itself never reads. `docs/save-editor-fields.md` carries the field names and citations.
 */
const FIELDS: Record<string, Status> = {
  // object 0, PlayerInfo: the ship's pixel position on the galaxy map (`PlayerInfo.as:25-29`).
  '0/0:D': 'editable',
  '0/1:D': 'editable',

  // object 1, ScanData (`ScanData.as:131-136`). `Visited` is what the map filter draws; `FreshData`
  // and `FreshDataValue` are scan data not yet sold, which `DropData` rewrites (`ScanData.as:27-74`).
  '1/0:O/*/0:u': 'editable',
  '1/0:O/*/1:u': 'editable',
  '1/0:O/*/2:u': 'editable',
  '1/1:O/*/0:u': 'derived',
  '1/1:O/*/1:u': 'derived',
  '1/1:O/*/2:u': 'derived',
  '1/2:O/*': 'derived',

  // object 2, CargoData (`CargoData.as:151-158`).
  '2/0:u': 'editable',
  '2/1:O/*': 'editable',
  '2/2:O/*': 'editable',
  '2/3:O/*': 'missing',
  '2/4:O/*': 'missing',

  // object 3, the hangar: a vector of ShipData.
  ...shipFields('3/*', 'editable', 'missing'),

  // object 4, ModulesData: the modules in storage and the station each one sits at
  // (`ModulesData.as:26-30`).
  ...moduleFields('4/0:O/*', 'editable'),
  '4/1:O/*': 'editable',

  // object 5, ProgressData (`ProgressData.as:322-332`).
  '5/0:O/*/0:U': 'structural',
  '5/0:O/*/1:D': 'editable',
  ...Object.fromEntries([...'UIDUDUUUUIUUBIIBD'].map((c, i) => [`5/1:O/*/${i}:${c}`, 'missing' as Status])),
  '5/2:O/*/0:U': 'missing',
  '5/2:O/*/1:D': 'missing',
  '5/2:O/*/2:U': 'missing',
  '5/3:O/*/0:U': 'structural',
  '5/3:O/*/1:D': 'missing',
  '5/4:I': 'missing',
  '5/5:I': 'missing',
  '5/6:D': 'missing',
  '5/7:D': 'missing',
  '5/8:D': 'missing',

  // object 6, ExtraData (`ExtraData.as:192-219`).
  ...materialFields(),
  '6/32:b': 'editable',
  '6/33:b': 'missing',
  '6/34:b': 'missing',
  '6/35:b': 'editable',
  '6/36:u': 'missing',
  '6/37:D': 'derived',
  '6/38:u': 'missing',
  '6/39:u': 'missing',
  '6/40:u': 'missing',
  '6/41:u': 'missing',
  '6/42:B': 'structural',
  '6/43:B': 'structural',
  '6/44:B': 'structural',
  '6/45:B': 'structural',
  '6/46:U': 'missing',
  '6/47:U': 'missing',
  '6/48:U': 'derived',
  '6/49:U': 'missing',

  // object 7, the ship in use.
  ...shipFields('7', 'editable', 'missing'),

  // object 8, QuestsSave (`QuestsSave.as:114-119`).
  '8/0:D': 'missing',
  '8/1:O/*/0:u': 'editable',
  '8/1:O/*/1:B': 'editable',
  '8/1:O/*/2:I': 'editable',
  '8/1:O/*/3:u': 'structural',
  '8/2:O/*': 'missing',

  // object 9, OwnStationData (`OwnStationData.as:240-282`).
  '9/0:U': 'missing',
  '9/1:U': 'missing',
  '9/2:D': 'missing',
  '9/3:D': 'missing',
  '9/4:D': 'missing',
  '9/5:u': 'missing',
  '9/6:u': 'missing',
  '9/7:u': 'structural',
  ...shipFields('9/8:O/*', 'missing', 'missing'),
  '9/9:O/*': 'missing',
  '9/10:O/*': 'missing',
  '9/11:O/*': 'missing',
  '9/12:O/*': 'missing',
  '9/13:O/*': 'missing',
  '9/14:O/*': 'structural',
  '9/15:O/*': 'missing',
  ...Object.fromEntries([16, 17, 18, 19, 20, 21, 22, 23].map((i) => [`9/${i}:u`, 'missing' as Status])),
  ...Object.fromEntries([24, 25, 26, 27].map((i) => [`9/${i}:u`, 'structural' as Status])),
  ...Object.fromEntries([28, 29, 30, 31, 32].map((i) => [`9/${i}:u`, 'missing' as Status])),
  '9/33:u': 'structural',
  '9/34:u': 'missing',
  '9/35:D': 'missing',
  '9/36:O/*': 'missing',
  '9/37:O/*': 'missing',
  '9/38:O/*': 'missing',
  '9/39:O/*': 'missing',

  // object 10, ExtraData2 (`ExtraData2.as:124-138`).
  '10/0:U': 'missing',
  '10/1:U': 'missing',
  '10/2:U': 'missing',
  '10/3:U': 'structural',
  '10/4:U': 'structural',
  '10/5:U': 'structural',
  '10/6:I': 'missing',
  '10/7:I': 'structural',
  '10/8:D': 'structural',
  '10/9:D': 'structural',
  '10/10:D': 'structural',
  '10/11:D': 'structural',
  '10/12:D': 'structural',
}

// ------------------------------------------------------- what the saves hold

const repo = resolve(import.meta.dirname, '../../../..')
const { modules, ships } = JSON.parse(readFileSync(join(repo, 'editor/public/data/save-data.json'), 'utf8')) as
  { modules: ModuleRec[]; ships: ShipItem[] }
const keys = byKey(modules)
const names = bySaveName(modules)
const SAVES = ['Save1.SOL', 'Save2.SOL', 'Save3.SOL']
const bytesOf = (file: string) => new Uint8Array(readFileSync(join(repo, 'saves', file)))

for (const file of SAVES) {
  const sv = decode(bytesOf(file))
  const unknown = [...new Set([...leaves(sv).keys()].map(shape))].filter((p) => !FIELDS[p]).sort()
  assert.deepEqual(unknown, [], `${file}: fields the manifest does not know about`)
}
console.log(`manifest: ${Object.keys(FIELDS).length} fields, all three saves accounted for`)

// ------------------------------------------------------- what the screens write

const shipOf = (sv: Save) => ships.find((s) => s.key === extUtf(shipData(sv), 0))!
const slotsOf = (sv: Save) => buildSlots(shipOf(sv), keys)
const weapon = modules.find((m) => m.slotType === 'Weapon' && m.mClass === 1)!
const ion = ships.find((s) => s.key === 'Ion')!

/** Each editor action, by the screen a reader reaches it from. */
const ACTIONS: [screen: string, run: (sv: Save) => void, setup?: (sv: Save) => void][] = [
  ['home, credits', (sv) => setCredits(sv, 1_234_567)],
  ['cargo, buy', (sv) => trade(sv, 'Grain', 7, 'buy')],
  ['cargo, sell', (sv) => { trade(sv, 'Grain', 7, 'buy'); trade(sv, 'Grain', 3, 'sell') }],
  ['materials, grant', (sv) => { for (let i = 0; i < MATERIAL_COUNT; i++) setMaterial(sv, i, 50) }],
  ['record, karma', setKarmaBest],
  ['record, rating battles', setArenaBest],
  ['record, reputation', (sv) => {
    const rows = ((sv.objs[PROGRESS] as AmfObject).raw[0][1] as AmfVector).items
    assert.ok(rows.length, 'the save has a reputation row')
    setReputationBest(rows[0] as AmfObject)
  }],
  ['galaxy, travel', (sv) => setPosition(sv, { x: 1234, z: -4321 })],
  ['galaxy, explore', (sv) => assert.ok(markExplored(sv, { x: 90_000, z: 90_000 }), 'a fresh cell is recorded')],
  ['quests, complete', (sv) => setQuestCompleted(sv, 0xdead, true)],
  ['hangar, buy and keep', (sv) => buyShip(sv, ion, modules, true)],
  ['hangar, add', (sv) => addToHangar(sv, ion, modules)],
  ['hangar, use', (sv) => useShip(sv, 0), (sv) => addToHangar(sv, ion, modules)],
  ['hangar, discard', (sv) => sellShip(sv, 0), (sv) => addToHangar(sv, ion, modules)],
  ['ship, install', (sv) => {
    const slot = slotsOf(sv).find((s) => s.restriction === 'Weapon' && s.sizeMax >= weapon.mClass)!
    install(sv, slot, weapon)
  }],
  ['ship, keep the old module', (sv) => {
    const fitted = fittedModules(sv, names)
    const slot = slotsOf(sv).find((s) => s.restriction === 'Weapon' && fitted[s.index] && s.sizeMax >= weapon.mClass)!
    const old = install(sv, slot, weapon)
    assert.ok(old, 'the slot held a module')
    putInStorage(sv, old, 'Thunder Station')
  }],
  ['storage, take in', (sv) => {
    const fitted = fittedModules(sv, names)
    const slot = slotsOf(sv).find((s) => s.restriction === 'Weapon' && fitted[s.index])!
    assert.ok(takeIntoStorage(sv, slot, 'Thunder Station'), 'the module moves to storage')
  }],
  ['engineer, upgrade', (sv) => {
    const fitted = (shipData(sv).raw[2][1] as AmfVector).items.filter((m) => m instanceof AmfObject)
    assert.ok(fitted.length, 'the ship carries modules')
    for (const m of fitted) { setUpgradeType(m as AmfObject, 1); addLevel(m as AmfObject, 1) }
  }],
]

const written = new Set<string>()
for (const [screen, run, setup] of ACTIONS) {
  const sv = decode(bytesOf('Save2.SOL'))
  setup?.(sv)
  const before = leaves(sv)
  run(sv)
  const diff = changed(before, leaves(sv)).map(shape)
  assert.ok(diff.length, `${screen}: nothing changed`)
  for (const p of diff) written.add(p)
}

const claimed = Object.keys(FIELDS).filter((p) => FIELDS[p] === 'editable' && !written.has(p)).sort()
assert.deepEqual(claimed, [], 'fields the manifest calls editable that no screen writes')

// The other direction is weaker: adding or dropping a vector row touches every field of that row,
// including ones no control sets, so a written path is not proof of a control. What a screen must
// never touch is a field the game recomputes.
const recomputed = [...written].filter((p) => FIELDS[p] === 'derived').sort()
assert.deepEqual(recomputed, [], 'fields a screen writes that the game recomputes')

const count = (s: Status) => Object.values(FIELDS).filter((v) => v === s).length
console.log(`editable ${count('editable')}, missing ${count('missing')}, derived ${count('derived')}, structural ${count('structural')}`)
console.log('coverage ok')
