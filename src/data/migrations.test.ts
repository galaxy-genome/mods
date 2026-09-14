// node --import ./scripts/test-hooks.mjs src/data/migrations.test.ts
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { CURRENT_SCHEMA, MIGRATIONS, migrate, type Migration } from './migrations.ts'

// Fixture chain: 1 renames a field, 2 adds one, 3 derives from both.
const chain: Migration[] = [
  ({ name, ...rest }) => ({ ...rest, title: name }),
  (m) => ({ ...m, tags: [] }),
  (m) => ({ ...m, label: `${m.title} (${(m.tags as unknown[]).length})` }),
]

test('each step upgrades a fixture of the previous schema', () => {
  assert.deepEqual(chain[0]({ name: 'A' }), { title: 'A' })
  assert.deepEqual(chain[1]({ title: 'A' }), { title: 'A', tags: [] })
  assert.deepEqual(chain[2]({ title: 'A', tags: [] }), { title: 'A', tags: [], label: 'A (0)' })
})

test('a chain from schema 1 to current', () => {
  assert.deepEqual(migrate({ mod: { name: 'A' }, schema: 1 }, chain), { mod: { title: 'A', tags: [], label: 'A (0)' }, schema: 4 })
  assert.deepEqual(migrate({ mod: { title: 'A', tags: [1] }, schema: 3 }, chain), { mod: { title: 'A', tags: [1], label: 'A (1)' }, schema: 4 })
  assert.deepEqual(migrate({ mod: { name: 'A' } }, chain).schema, 4, 'a record without schema is schema 1')
})

test('a record newer than the app is left untouched', () => {
  const rec = { mod: { future: true }, schema: 9 }
  assert.deepEqual(migrate(rec, chain), rec)
})

test('the app list matches its schema number', () => {
  assert.equal(CURRENT_SCHEMA, MIGRATIONS.length + 1)
  const rec = { mod: { x: 1 }, schema: 1 }
  assert.deepEqual(migrate(rec).mod, { x: 1 })
})
