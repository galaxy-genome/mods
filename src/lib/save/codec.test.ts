// node src/lib/save/codec.test.ts — every save in the repo decodes and re-encodes to identical bytes.
import { strict as assert } from 'node:assert'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { decode, encode, getCredits } from './codec.ts'

const repo = resolve(import.meta.dirname, '../../../..')
const root = join(repo, 'saves')
// SharedObject saves live with the emulator backups; `GG2_settings*` is not a save.
const lso = join(repo, 'emulator/saves-backup')
const isSave = (p: string) => p.endsWith('.SOL') || /\/(GG2_[0-5]|live\d|all-eight-ships)\.sol$/.test(p)

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const files = [...walk(root), ...walk(lso)].filter(isSave)
assert.ok(files.length > 0, 'no save files found')
for (const path of files) {
  const before = new Uint8Array(readFileSync(path))
  const sv = decode(before)
  assert.equal(sv.objs.length, 11, `${path}: expected eleven objects`)
  assert.deepEqual(encode(sv), before, `${path}: round-trip differs`)
  console.log(`${path.slice(repo.length + 1)}  ${sv.fmt}  owner ${JSON.stringify(sv.owner)}  credits ${getCredits(sv).toLocaleString()}`)
}
console.log(`codec ok (${files.length} files)`)
