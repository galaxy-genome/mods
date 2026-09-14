// node --import ./scripts/test-hooks.mjs src/data/store.test.ts — the store over a real (fake) IndexedDB.
import { strict as assert } from 'node:assert'
import { mock, test } from 'node:test'
import { dbName, mod, texture } from './fixtures.ts'
import type * as Store from '../store/editor.ts'
import type { Mod, QuestContent } from '../lib/types.ts'

const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})

const tab = (name: string) => import(`../store/editor.ts?${name}`) as Promise<typeof Store>
const until = async (check: () => boolean, what: string) => {
  for (let i = 0; i < 400; i++) { if (check()) return; await new Promise((r) => setImmediate(r)) }
  assert.fail(`timed out waiting for ${what}`)
}
const content = (m: Mod | undefined) => m!.quests[0].versions.en as QuestContent
const part = (s: typeof Store, id: string) => `${id}~${s.modById(id)!.quests[0].id}`
const seedOf = (...mods: Mod[]) => async () => structuredClone(mods)

test('boot seeds once; a deleted seed is not seeded again', async () => {
  const s = await tab('seed')
  const name = dbName()
  await s.bootEditor({ dbName: name, seed: seedOf(mod('a'), mod('b')) })
  assert.deepEqual(s.getState().mods.map((m) => m.meta.id).sort(), ['a', 'b'])
  assert.equal(s.getState().loading, false)
  s.deleteMod('a')
  await s.flushAll()
  await until(() => s.getState().deleted.length === 1, 'deleted row')
  await s.bootEditor({ dbName: name, seed: seedOf(mod('a'), mod('b')) })
  assert.deepEqual(s.getState().mods.map((m) => m.meta.id), ['b'])
  assert.deepEqual(s.getState().deleted.map((d) => d.id), ['a'])
  await s.restoreDeletedMod('a')
  assert.deepEqual(s.getState().mods.map((m) => m.meta.id).sort(), ['a', 'b'])
  await s.bootEditor({ dbName: name, search: '?fresh', seed: seedOf(mod('a')) })
  assert.equal(s.getState().mods.length, 0)
  await s.bootEditor({ dbName: name, search: '?samples' })
  assert.ok(s.getState().mods.length >= 2, '?samples adds the samples')
})

test('flush: one write 400 ms after the last of several edits; flushAll (pagehide) writes at once', async () => {
  const s = await tab('flush')
  await s.bootEditor({ dbName: dbName(), seed: seedOf(mod('m')) })
  const repo = s.getRepository()!
  let writes = 0
  const save = repo.saveMod.bind(repo)
  repo.saveMod = (...a) => { writes++; return save(...a) }
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    for (const title of ['A', 'AB', 'ABC']) { s.updateMod('m', (d) => { d.meta.title = title }); mock.timers.tick(300) }
    assert.equal(writes, 0)
    assert.equal(s.getState().saves.m, 'dirty')
    await new Promise((r) => setImmediate(r))
    assert.equal(writes, 0)
    mock.timers.tick(100)
    await until(() => writes === 1, 'the write')
    await until(() => s.getState().saves.m === 'saved', 'saved')
    s.updateMod('m', (d) => { d.meta.title = 'Now' })
    await s.flushAll()
    assert.equal(writes, 2)
    mock.timers.tick(1000)
    await new Promise((r) => setImmediate(r))
    assert.equal(writes, 2)
  } finally { mock.timers.reset() }
  assert.equal((await repo.loadMod('m'))?.mod.meta.title, 'Now')
})

test('two tabs: a save increments revision, posts mod-changed, the other reloads and drops its undo; deletes reach it too', async () => {
  const a = await tab('a')
  const b = await tab('b')
  const name = dbName()
  await a.bootEditor({ dbName: name, seed: seedOf(mod('m'), mod('n')) })
  await b.bootEditor({ dbName: name })
  b.updateMod('m', (d) => { d.meta.summary = 'b edit' })
  await b.flushAll()
  await until(() => a.modById('m')?.meta.summary === 'b edit', 'tab a to reload b’s save')
  a.updateMod('m', (d) => { d.meta.title = 'From A' })
  assert.ok(b.canUndo('m'))
  await a.flushAll()
  await until(() => b.modById('m')?.meta.title === 'From A', 'tab b to reload')
  assert.equal((await a.getRepository()!.loadMod('m'))?.record.revision, 3)
  assert.equal(b.canUndo('m'), false)
  a.deleteMod('n')
  await a.flushAll()
  await until(() => !b.modById('n'), 'tab b to drop the deleted mod')
  await until(() => b.getState().deleted.some((d) => d.id === 'n'), 'deleted row in tab b')
})

test('undo shares unchanged objects; typing in one field is one step', async () => {
  const s = await tab('undo')
  const big = mod('m', 'M', [texture('txtr_a', 1)])
  big.quests[0].versions.en!.steps.push({ ...big.quests[0].versions.en!.steps[0], id: 'second', name: 'Two' })
  big.stars = { id: 'stars', stars: [], planets: [], stations: [] }
  await s.bootEditor({ dbName: dbName(), seed: seedOf(big) })
  const before = s.modById('m')!
  s.updateQuest(part(s, 'm'), (q) => { q.steps[0].name = 'Changed' })
  const after = s.modById('m')!
  assert.notEqual(after, before)
  assert.equal(after.stars, before.stars)
  assert.equal(after.textures, before.textures)
  assert.equal(content(after).steps[1], content(before).steps[1], 'untouched step is the same object')
  assert.equal(content(after).rumors, content(before).rumors)
  assert.notEqual(content(after).steps[0], content(before).steps[0])
  assert.equal(content(before).steps[0].name, 'Go', 'the undo entry is not mutated')

  s.undo('m')
  assert.equal(content(s.modById('m')).steps[0].name, 'Go')
  assert.ok(s.canRedo('m'))

  const field = {}
  s.setFocusedField(() => field)
  for (const text of ['H', 'He', 'Hey']) s.updateQuest(part(s, 'm'), (q) => { q.steps[0].name = text })
  assert.equal(s.canRedo('m'), false, 'a new edit drops the redo tail')
  s.setFocusedField(() => null)
  s.updateQuest(part(s, 'm'), (q) => { q.steps[0].journal = 'Other' })
  s.undo('m')
  assert.equal(content(s.modById('m')).steps[0].name, 'Hey')
  s.undo('m')
  assert.equal(content(s.modById('m')).steps[0].name, 'Go', 'three keystrokes undo as one step')
  assert.equal(s.startsUndoStep(field, field), false)
  assert.equal(s.startsUndoStep(field, {}), true)
  assert.equal(s.startsUndoStep(null, null), true)
})

test('texture changes are not undoable; community mods stay Modified through undo', async () => {
  const s = await tab('tex')
  const community = mod('c')
  community.meta.community = { entryId: 'e', entryTitle: 'E', author: '', licence: '', popularity: 1 }
  await s.bootEditor({ dbName: dbName(), seed: seedOf(community) })
  s.updateMod('c', (d) => { d.meta.title = 'Edited' })
  s.addTextures('c', [texture('txtr_n', 4)])
  s.undo('c')
  const m = s.modById('c')!
  assert.equal(m.meta.title, 'c')
  assert.equal(m.textures.length, 1)
  assert.equal(m.meta.modified, true)
  await s.flushAll()
  assert.equal((await s.getRepository()!.loadMod('c'))?.mod.textures.length, 1)
})

test('history: idle-gap entry, pre-destructive entry, restore saves current first', async () => {
  const s = await tab('history')
  const m = mod('m')
  m.quests.push({ ...structuredClone(m.quests[0]), id: 'q2' })
  m.meta.updatedAt = 0
  await s.bootEditor({ dbName: dbName(), seed: seedOf(m) })
  s.updateMod('m', (d) => { d.meta.title = 'First' })
  await until(() => s.getState().history.length === 1, 'idle-gap entry')
  const idle = s.getState().history[0]
  assert.equal(idle.auto, true)
  assert.equal(idle.name, '')
  assert.equal(idle.mod.meta.title, 'm', 'copy of the state before the edit')
  s.updateMod('m', (d) => { d.meta.title = 'Second' })
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(s.getState().history.length, 1, 'no entry without a gap')
  s.removePart('m', 'q2', 'Quest two')
  await until(() => s.getState().history.length === 2, 'entry before removing a part')
  assert.equal(s.modById('m')!.quests.length, 1)
  await s.restoreHistory(idle.id)
  assert.equal(s.modById('m')!.meta.title, 'm')
  assert.equal(s.getState().history.length, 3)
  assert.equal(s.getState().history[0].mod.meta.title, 'Second')
  await s.renameHistory(s.getState().history[0].id, 'Kept')
  assert.equal(s.getState().history[0].auto, false)
  await s.deleteHistory(idle.id)
  await s.flushAll()
  const { history } = await s.getRepository()!.loadIndex()
  assert.equal(history.length, 2)
  assert.ok(history.some((h) => h.name === 'Kept' && !h.auto))
})

test('quota: a failing put leaves the mod dirty with the red save state, and the next change retries', async () => {
  const s = await tab('quota')
  await s.bootEditor({ dbName: dbName(), seed: seedOf(mod('m')) })
  s.simulateQuota(true)
  s.updateMod('m', (d) => { d.meta.title = 'Lost?' })
  await s.flushAll()
  assert.equal(s.getState().saves.m, 'error')
  assert.equal(s.getState().storage.quotaFull, true)
  s.simulateQuota(false)
  s.updateMod('m', (d) => { d.meta.summary = 'retry' })
  await s.flushAll()
  assert.equal(s.getState().saves.m, 'saved')
  assert.equal(s.getState().storage.quotaFull, false)
  assert.equal((await s.getRepository()!.loadMod('m'))?.mod.meta.title, 'Lost?')
})

test('draft: typed text is mirrored to gg.draft, recovered on boot when the save never landed, cleared by a save', async () => {
  const s = await tab('draft')
  const name = dbName()
  await s.bootEditor({ dbName: name, seed: seedOf(mod('m')) })
  s.setFocusedField(() => ({}))
  s.updateQuest(part(s, 'm'), (q) => { q.settings.questName = 'Typed' })
  s.setFocusedField(() => null)
  const draft = JSON.parse(memory.get('gg.draft')!)
  assert.equal(draft.value, 'Typed')
  assert.equal(draft.lang, 'en')
  await new Promise((r) => setTimeout(r, 2))
  await s.bootEditor({ dbName: name })
  assert.equal(s.getState().recoveredDraft?.value, 'Typed')
  s.restoreDraft()
  assert.equal(content(s.modById('m')).settings.questName, 'Typed')
  assert.equal(memory.has('gg.draft'), false)
  await s.flushAll()
  await s.bootEditor({ dbName: name })
  assert.equal(s.getState().recoveredDraft, null)

  s.setFocusedField(() => ({}))
  s.updateQuest(part(s, 'm'), (q) => { q.settings.questName = 'Saved' })
  s.setFocusedField(() => null)
  await s.flushAll()
  assert.equal(memory.has('gg.draft'), false, 'the resolved flush clears the draft')
})

test('settings persist: prefs in localStorage, download settings in meta', async () => {
  const s = await tab('settings')
  const name = dbName()
  await s.bootEditor({ dbName: name, seed: seedOf() })
  s.setSettings({ advanced: true, downloadName: 'pack' })
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(JSON.parse(memory.get('gg.prefs')!).advanced, true)
  await s.bootEditor({ dbName: name })
  assert.equal(s.getState().settings.advanced, true)
  assert.equal(s.getState().settings.downloadName, 'pack')
})

test('favoriting takes required mods along, through cycles, and one undo reverts it all', async () => {
  const s = await tab('favorites')
  const need = (m: Mod, ...ids: string[]) => { m.meta.favorite = false; m.meta.requires = ids.map((modId) => ({ modId, title: modId })); return m }
  await s.bootEditor({ dbName: dbName(), seed: seedOf(need(mod('a'), 'b'), need(mod('b'), 'c'), need(mod('c'), 'a'), need(mod('d'))) })
  const favs = () => s.getState().mods.filter((m) => m.meta.favorite).map((m) => m.meta.id).sort()
  const undo = s.setFavorite(['a'], true)
  assert.deepEqual(favs(), ['a', 'b', 'c'])
  s.setFavorite(['b'], false)
  assert.deepEqual(favs(), ['a', 'c'], 'unfavoriting a required mod is allowed')
  s.setFavorite(['b'], true)
  undo()
  assert.deepEqual(favs(), [])
})
