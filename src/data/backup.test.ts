// node --import ./scripts/test-hooks.mjs src/data/backup.test.ts
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { unzip, zip } from '../lib/zip.ts'
import { applyBackup, downloadFileName, normalizeMod, readBackup, stateFiles } from './backup.ts'
import { getAll, request } from './db.ts'
import { CURRENT_SCHEMA } from './migrations.ts'
import { Repository, toStored } from './repository.ts'
import { dbName, entry, mod, texture } from './fixtures.ts'

async function dump(repo: Repository) {
  return repo.tx(['mods', 'history', 'textures', 'meta'], 'readonly', async (t) => {
    const tex = await getAll<{ png: Blob; xml: string }>(t, 'textures')
    return {
      mods: await getAll(t, 'mods'),
      history: await getAll(t, 'history'),
      textureKeys: await request(t.objectStore('textures').getAllKeys()),
      textures: await Promise.all(tex.map(async (x) => [[...new Uint8Array(await x.png.arrayBuffer())], x.xml])),
      settings: await request(t.objectStore('meta').get('settings')),
    }
  })
}

async function filled() {
  const repo = await Repository.open(dbName())
  const a = mod('a', 'A', [texture('txtr_a', 1)])
  await repo.saveMod(a)
  await repo.saveMod(mod('b', 'B', [texture('txtr_b', 2)]))
  await repo.saveMod(mod('gone'))
  await repo.deleteMod('gone', 5)
  const h = entry(a, { name: 'Named', auto: false })
  h.mod = await toStored(a)
  await repo.addHistory(h)
  await repo.setMeta('settings', { downloadLang: 'ru', downloadName: 'pack' })
  return repo
}

const roundTrip = async (repo: Repository) => {
  const files = await stateFiles(repo, { game: '1.6.12', settings: { downloadLang: 'ru', downloadName: 'pack', uiLang: 'en' } })
  return readBackup(await unzip(zip(files)))!
}

test('backup round trip: Replace everything reproduces every store', async () => {
  const source = await filled()
  const backup = await roundTrip(source)
  assert.equal(backup.meta.format, 'ggeditor-state')
  assert.equal(backup.meta.schema, CURRENT_SCHEMA)
  assert.deepEqual(backup.mods.find((r) => r.mod.meta.id === 'a')!.deps?.adds.systems, [], 'the dependencies JSON travels with the record')
  const target = await Repository.open(dbName())
  await target.saveMod(mod('other', 'Other', [texture('txtr_o', 9)]))
  const r = await applyBackup(target, backup, 'replace')
  assert.deepEqual(r, { added: 3, skipped: 0 })
  assert.deepEqual(await dump(target), await dump(source))
})

test('Add to mine skips existing ids and keeps what is here', async () => {
  const source = await filled()
  const backup = await roundTrip(source)
  const target = await Repository.open(dbName())
  await target.saveMod(mod('a', 'Mine'))
  const r = await applyBackup(target, backup, 'add')
  assert.deepEqual(r, { added: 2, skipped: 1 })
  const { mods, history, deleted } = await target.loadAll()
  assert.equal(mods.find((m) => m.mod.meta.id === 'a')?.mod.meta.title, 'Mine')
  assert.equal(mods.find((m) => m.mod.meta.id === 'b')?.mod.textures.length, 1)
  assert.deepEqual(deleted.map((d) => d.id), ['gone'])
  assert.equal(history.length, 0, 'history of the skipped mod stays out')
  assert.equal((await target.getMeta<{ downloadLang: string }>('settings'))?.downloadLang, 'ru')
})

test('newer schema: unknown fields go to _extra and are listed; missing fields take defaults', () => {
  const m = mod('n') as unknown as Record<string, any>
  m.quests[0].versions.en.steps[0].glow = 3
  m.quests[0].versions.en.settings.Weather = 'rain'
  delete m.quests[0].versions.en.steps[0].id
  delete m.quests[0].versions.en.steps[0].failWhen
  const files = [
    { name: 'state/meta.json', text: JSON.stringify({ format: 'ggeditor-state', schema: CURRENT_SCHEMA + 1 }) },
    { name: 'state/mods.json', text: JSON.stringify([{ mod: { ...m, textures: [] }, schema: CURRENT_SCHEMA + 1 }]) },
  ]
  const backup = readBackup(files.map((f) => ({ ...f, bytes: new TextEncoder().encode(f.text) })))!
  const step = backup.mods[0].mod.quests[0].versions.en!.steps[0]
  assert.deepEqual(step._extra, { glow: 3 })
  assert.deepEqual(backup.mods[0].mod.quests[0].versions.en!.settings._extra, { Weather: 'rain' })
  assert.match(step.id, /^[0-9a-f-]{36}$/)
  assert.deepEqual(step.failWhen, [])
  assert.deepEqual(backup.unknown, ['mod.quests[0].versions.en.settings.Weather', 'mod.quests[0].versions.en.steps[0].glow'])
  assert.equal(normalizeMod({ ...m, textures: [] }, false).unknown.length, 0)
})

test('a zip without state/ is not a backup; file name', () => {
  assert.equal(readBackup([{ name: 'mod/Quest0.json', text: '{}' }]), null)
  assert.equal(downloadFileName('  Ben’s Mods! ', new Date(2026, 8, 3)), '20260903-ggmods-ben-s-mods.zip')
  assert.equal(downloadFileName('', new Date(2026, 0, 1)), '20260101-ggmods-mods.zip')
})

test('required mods survive a state round trip', async () => {
  const repo = await Repository.open(dbName())
  const m = mod('r', 'Needs Trappist')
  m.meta.requires = [{ modId: 'community-trappist@2.0', entryId: 'community-trappist', title: 'Trappist-1 & neighbours', version: '2.0' }]
  await repo.saveMod(m)
  const backup = await roundTrip(repo)
  const target = await Repository.open(dbName())
  await applyBackup(target, backup, 'replace')
  assert.deepEqual((await target.loadAll()).mods[0].mod.meta.requires, m.meta.requires)
})
