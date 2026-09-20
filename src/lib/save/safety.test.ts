// node src/lib/save/safety.test.ts — the pre-download gate passes a real save and blocks the two states the loader rejects.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { AmfObject, HANGAR, SHIP, decode, getCredits, type AmfVector, type ExtField } from './codec.ts'
import { SaveUnsafe, prepareDownload, shipStation } from './safety.ts'

const repo = resolve(import.meta.dirname, '../../../..')
const bytes = new Uint8Array(readFileSync(join(repo, 'saves/Save2.SOL')))
const load = () => decode(bytes)

function blocked(fn: () => unknown) {
  try {
    fn()
  } catch (e) {
    assert.ok(e instanceof SaveUnsafe, `expected SaveUnsafe, got ${e}`)
    return e
  }
  throw new assert.AssertionError({ message: 'expected the download to be blocked' })
}

// A good save, edited the way the credits screen edits it.
const good = load()
const out = prepareDownload(good, { balance: 123456 })
assert.equal(getCredits(decode(out)), 123456)
assert.deepEqual(out.length, bytes.length)
console.log(`good save passes, balance ${getCredits(decode(out)).toLocaleString()}`)

// A negative balance: the loader resets it (`system/Save/Save.as:321-323`), so it never reaches the file.
const negative = blocked(() => prepareDownload(load(), { balance: -1 }))
assert.equal(negative.field, 'balance')
console.log(`negative balance blocked: ${negative.field} — ${negative.message}`)

// A hangar entry with no station: the loader prunes it (`system/Save/Save.as:387-394`).
const stateless = load()
const ship = stateless.objs[SHIP] as AmfObject
const orphan = new AmfObject('ShipData', false, true)
orphan.raw = ship.raw.map(([c, v]) => [c, v] as ExtField)
orphan.raw[1] = ['U', new Uint8Array([0, 0])] // writeUTF('')
;(stateless.objs[HANGAR] as AmfVector).items.push(orphan)
assert.equal(shipStation(orphan), '')
const hangar = blocked(() => prepareDownload(stateless))
assert.equal(hangar.field, 'Station')
console.log(`hangar entry with no station blocked: ${hangar.field} — ${hangar.message}`)

console.log('safety ok')
