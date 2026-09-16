// node --import ./scripts/test-hooks.mjs src/data/repository.test.ts
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { DELETED_KEEP_MS, Repository, textureHash, toStored } from './repository.ts'
import { dbName, entry, mod, texture } from './fixtures.ts'

const textureKeys = (repo: Repository) => repo.tx(['textures'], 'readonly', (t) => new Promise<IDBValidKey[]>((r) => { t.objectStore('textures').getAllKeys().onsuccess = (e) => r((e.target as IDBRequest).result) }))

test('save and load: a mod comes back deep-equal, textures by hash', async () => {
  const repo = await Repository.open(dbName())
  const m = mod('m1', 'One', [texture('txtr_a', 1)])
  const record = await repo.saveMod(m, 1000)
  assert.equal(record.revision, 1)
  assert.equal(record.mod.textures[0].hash, await textureHash(m.textures[0]))
  const { mods } = await repo.loadAll()
  assert.equal(mods.length, 1)
  assert.deepEqual(mods[0].mod, m)
  assert.deepEqual(await textureKeys(repo), [record.mod.textures[0].hash])
  assert.equal((await repo.saveMod(m)).revision, 2)
})

test('texture dedupe and GC: shared once, removed when unreferenced, kept by history', async () => {
  const repo = await Repository.open(dbName())
  const tex = texture('txtr_a', 7)
  const a = mod('a', 'A', [tex])
  const b = mod('b', 'B', [{ ...tex }])
  await repo.saveMod(a)
  await repo.saveMod(b)
  assert.equal((await textureKeys(repo)).length, 1)
  await repo.saveMod({ ...a, textures: [] })
  assert.equal((await textureKeys(repo)).length, 1)
  const h = entry(b)
  h.mod = await toStored(b)
  await repo.addHistory(h)
  await repo.saveMod({ ...b, textures: [] })
  assert.equal((await textureKeys(repo)).length, 1, 'history entry keeps the texture')
  await repo.deleteHistory(h.id)
  assert.equal((await textureKeys(repo)).length, 0)
})

test('history: automatic retention of 20, named entries kept', async () => {
  const repo = await Repository.open(dbName())
  const m = mod('m')
  await repo.addHistory(entry(m, { auto: false, name: 'Keep me', createdAt: 0 }))
  for (let i = 1; i <= 25; i++) await repo.addHistory(entry(m, { createdAt: i }))
  const { history } = await repo.loadAll()
  assert.equal(history.filter((h) => h.auto).length, 20)
  assert.equal(Math.min(...history.filter((h) => h.auto).map((h) => h.createdAt)), 6)
  assert.ok(history.some((h) => h.name === 'Keep me'))
})

test('deleted mods restore within 30 days and are purged after', async () => {
  const repo = await Repository.open(dbName())
  const now = 1_000_000_000_000
  await repo.saveMod(mod('gone', 'Gone', [texture('txtr_g', 3)]))
  await repo.saveMod(mod('kept'))
  await repo.addHistory(entry(mod('gone')))
  await repo.deleteMod('gone', now)
  let all = await repo.loadAll()
  assert.deepEqual(all.mods.map((x) => x.mod.meta.id), ['kept'])
  assert.deepEqual(all.deleted, [{ id: 'gone', title: 'Gone', deletedAt: now }])
  assert.deepEqual(await repo.purge(now + DELETED_KEEP_MS - 1), [])
  const restored = await repo.restoreMod('gone')
  assert.equal(restored?.record.deletedAt, null)
  assert.equal(restored?.mod.textures.length, 1)
  await repo.deleteMod('gone', now)
  assert.deepEqual(await repo.purge(now + DELETED_KEEP_MS + 1), ['gone'])
  all = await repo.loadAll()
  assert.equal(all.deleted.length, 0)
  assert.equal(all.history.length, 0)
  assert.equal((await textureKeys(repo)).length, 0)
})

test('meta values and clear', async () => {
  const repo = await Repository.open(dbName())
  await repo.setMeta('seeded', true)
  assert.equal(await repo.getMeta('seeded'), true)
  await repo.saveMod(mod('x'))
  await repo.clear()
  assert.equal((await repo.loadAll()).mods.length, 0)
  assert.equal(await repo.getMeta('seeded'), true)
})
