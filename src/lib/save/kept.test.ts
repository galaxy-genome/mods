// node src/lib/save/kept.test.ts — the save kept across a refresh comes back byte for byte.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// The editor's `localStorage` wrapper reads `globalThis.localStorage`, which node has not got.
const store = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  },
  configurable: true,
})

const { decode, encode, getCredits, setCredits } = await import('./codec.ts')
const { drop, keep, kept, keptBytes } = await import('./kept.ts')

const repo = resolve(import.meta.dirname, '../../../..')

assert.equal(kept(), null, 'nothing kept to begin with')

for (const name of ['Save1.SOL', 'Save2.SOL', 'Save3.SOL']) {
  const bytes = new Uint8Array(readFileSync(join(repo, 'saves', name)))
  const sv = decode(bytes)
  setCredits(sv, 4242)

  keep(sv, name, 'record', true)
  const back = kept()
  assert.ok(back, `${name}: kept`)
  assert.equal(back.name, name)
  assert.equal(back.open, 'record', 'the screen in view came back')
  assert.equal(back.edited, true)
  assert.equal(getCredits(back.sv), 4242, 'the edit came back')
  assert.deepEqual([...encode(back.sv)], [...encode(sv)], `${name}: byte for byte`)
  console.log(`${name}  ${bytes.length.toLocaleString('en-US')} bytes on disk, `
    + `${keptBytes().toLocaleString('en-US')} kept, ${(keptBytes() / 1024).toFixed(1)} KiB of the quota`)
}

// A stored save that no longer reads is dropped rather than blocking the editor.
store.set('gg.save', JSON.stringify({ name: 'broken.SOL', bytes: 'Zm9v', open: '', edited: false }))
assert.equal(kept(), null, 'an unreadable save is dropped')
assert.equal(store.get('gg.save'), undefined)

drop()
assert.equal(kept(), null)
console.log('kept ok')
