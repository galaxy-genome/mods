// node src/lib/save/tables.test.ts — a table read before it is filled throws rather than
// answering emptily, because a save written from an empty table looks right and is not.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repo = resolve(import.meta.dirname, '../../../..')
const data = JSON.parse(readFileSync(join(repo, 'editor/public/data/save-data.json'), 'utf8'))

// A fresh copy of the module, so the tables are as empty as they are in a caller that forgot.
const engineer = await import(`./engineer.ts?${Date.now()}`)

const throws = (what: string, run: () => unknown) => {
  assert.throws(run, /was read before it was filled/, `${what} answered instead of throwing`)
  console.log(`${what} throws until its table is filled`)
}

assert.equal(engineer.upgradesReady(), false)
assert.equal(engineer.prioritiesReady(), false)

throws('upgradesFor', () => engineer.upgradesFor('DeepSpaceDrive'))
throws('upgradeName', () => engineer.upgradeName('DeepSpaceDrive', 1))
throws('engineerLabel', () => engineer.engineerLabel('DeepSpaceDrive', 25, 1))
throws('priorityFor', () => engineer.priorityFor('ShieldsBooster'))

// And the writes that lean on them: a module that reaches the save carries a priority, and the
// engineer's ladder needs to know what the engineer can do.
const { decode } = await import('./codec.ts')
const { install, buildSlots, byKey } = await import('./rules.ts')
const sv = decode(new Uint8Array(readFileSync(join(repo, 'saves/Save1.SOL'))))
const ship = data.ships.find((s: { key: string }) => s.key === 'Falcon')
const slot = buildSlots(ship, byKey(data.modules)).find((s: { restriction: string }) => s.restriction === 'Weapon')
const mod = data.modules.find((m: { slotType: string; mClass: number }) => m.slotType === 'Weapon' && m.mClass === 1)
throws('install', () => install(sv, slot, mod))

// The copy `rules.ts` reads is the one the app fills, so fill that one.
const { engineerLabel, makePriorities, makeUpgrades, prioritiesReady, priorityFor, upgradesReady } =
  await import('./engineer.ts')
makeUpgrades(data.upgrades)
makePriorities(data.priorities)
assert.equal(upgradesReady(), true)
assert.equal(prioritiesReady(), true)
assert.equal(priorityFor('ShieldsBooster'), 3)
assert.equal(engineerLabel('DeepSpaceDrive', 25, 1), ' [25 Jump Range]')
assert.doesNotThrow(() => install(sv, slot, mod))
console.log('and answers once both tables are filled')

console.log('tables ok')
